-- ===========================================================================
-- BACKFILL B — patients.primary_location_id, from UNANIMOUS appointments.
-- ===========================================================================
-- RULED BY STRATEGY 2026-09-08, and the ruling IS the predicate:
--   "B, primary_location_id: derive ONLY where every one of a patient's
--    appointments agrees on a single location. Leave the rest for the desk."
--
-- WHO RUNS THIS: Ivan, against PRODUCTION, AFTER strategy has read the three
-- counts from scripts/import/backfill-counts.sql. No terminal may.
--
-- ===========================================================================
-- THIS ONE CHANGES WHO SEES WHOM. A DOES NOT. READ THAT DIFFERENCE FIRST.
-- ===========================================================================
-- `primary_location_id` is one of the two bases PL-09 scopes a patient by, so
-- every row this file writes puts a person onto a clinic's list - in the
-- patient list, in the search, and on the detail page. It is a visibility
-- change wearing a data migration's clothes, and that is why it derives only
-- from unanimous evidence and refuses to guess for anybody else.
--
-- ===========================================================================
-- WHAT IT WILL NOT DO, AND WHY EACH REFUSAL IS RIGHT
-- ===========================================================================
-- IT NEVER OVERWRITES. `primary_location_id IS NULL` is in the WHERE clause.
--   A patient already filed at a clinic was filed there by somebody - the form,
--   the guest convert, or the importer's primaryLocationKey - and a majority of
--   appointments elsewhere is not grounds to move them. PL-15b made the clinic
--   EDITABLE for exactly that case, and the desk does it.
--
-- IT NEVER PICKS A WINNER. A patient with appointments at two clinics gets
--   NOTHING from this file. Not the most frequent, not the most recent, not the
--   first. Those are all defensible and they disagree with each other, which is
--   the definition of a decision that is not a script's to take.
--
-- IT NEVER INVENTS ONE. A patient with no appointment at all has no evidence,
--   and `now()`-style defaults have no analogue here: there is no neutral
--   clinic. They stay NULL and stay on the desk's list.
--
-- ===========================================================================
-- THE SECOND PARTICIPANT COUNTS, AND THAT IS A CHOICE THIS FILE MAKES OUT LOUD
-- ===========================================================================
-- A dual-therapist or dual-patient session records the second person in
-- `appointments.patient_2_id`. `patientLocationScope` and 0047's policy BOTH
-- count that column when deciding whether a patient belongs to a clinic, so
-- counting it here keeps the derivation and the visibility rule speaking about
-- the same set. backfill-counts.sql prints the population both ways so the
-- difference was seen before this ran, not after.
--
-- ===========================================================================
-- IDEMPOTENT. A second run updates zero rows: every row it wrote now fails the
-- `primary_location_id IS NULL` predicate.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- STEP 1. PREVIEW. READ ONLY. The three counts, again, at the moment of the run.
--
--   THEY ARE RE-READ HERE RATHER THAN CARRIED FROM backfill-counts.sql, and
--   that is SR-59 applied one file over: a carry value from an earlier run can
--   make a correct database look wrong, or - worse - make a changed one look
--   unchanged. `rows_to_update` below is the number STEP 2 must report.
-- ---------------------------------------------------------------------------
\echo '--- STEP 1: PREVIEW (read only) ---'
WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1),
live AS (
  SELECT p.id, p.primary_location_id FROM public.patients p, tenant t
   WHERE p.tenant_id = t.tenant_id AND p.deleted_at IS NULL
),
ev AS (
  SELECT a.patient_id AS pid, a.location_id FROM public.appointments a, tenant t
   WHERE a.tenant_id = t.tenant_id AND a.patient_id IS NOT NULL
  UNION ALL
  SELECT a.patient_2_id, a.location_id FROM public.appointments a, tenant t
   WHERE a.tenant_id = t.tenant_id AND a.patient_2_id IS NOT NULL
),
agree AS (SELECT pid, count(DISTINCT location_id) AS locs FROM ev GROUP BY pid)
SELECT
  (SELECT count(*) FROM live WHERE primary_location_id IS NULL)                       AS unplaced_now,
  (SELECT count(*) FROM live l JOIN agree g ON g.pid=l.id
    WHERE l.primary_location_id IS NULL AND g.locs = 1)                                AS rows_to_update,
  (SELECT count(*) FROM live l JOIN agree g ON g.pid=l.id
    WHERE l.primary_location_id IS NULL AND g.locs > 1)                                AS ambiguous_left_for_desk,
  (SELECT count(*) FROM live l
    WHERE l.primary_location_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM agree g WHERE g.pid=l.id))                         AS no_basis_left_for_desk;

-- ---------------------------------------------------------------------------
-- STEP 2. THE UPDATE, AND IT CHECKS ITSELF IN THE SAME STATEMENT.
--
--   EXPECTED: one row reading  rows_updated = <STEP 1's rows_to_update>,
--   wrote_wrong_location = 0.  STOP on any other pair.
--
--   THE CHECK IS INSIDE THE STATEMENT, ON PURPOSE (SR-59). A verify that runs
--   afterwards can only see the FINAL state, and the final state cannot tell a
--   row this file wrote from a row it deliberately left alone. `RETURNING` into
--   a CTE gives the check the exact set of rows written and nothing else, with
--   no number carried by hand between two commands.
--
--   THE `HAVING count(DISTINCT ...) = 1` IS THE RULING. It is not an
--   optimisation and it must not be relaxed: it is the difference between
--   deriving a fact and picking a favourite.
-- ---------------------------------------------------------------------------
\echo '--- STEP 2: THE UPDATE (self-checking) ---'
WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1),
ev AS (
  SELECT a.patient_id AS pid, a.location_id FROM public.appointments a, tenant t
   WHERE a.tenant_id = t.tenant_id AND a.patient_id IS NOT NULL
  UNION ALL
  SELECT a.patient_2_id, a.location_id FROM public.appointments a, tenant t
   WHERE a.tenant_id = t.tenant_id AND a.patient_2_id IS NOT NULL
),
unanimous AS (
  -- (array_agg(DISTINCT ...))[1] AND NOT min(): there is no min(uuid) in
  -- Postgres, and the rehearsal found that rather than a reader. The array form
  -- also says what is meant - "the ONLY distinct location" - which min() would
  -- have obscured even where it compiles.
  SELECT pid, (array_agg(DISTINCT location_id))[1] AS location_id
    FROM ev
   GROUP BY pid
  HAVING count(DISTINCT location_id) = 1
),
upd AS (
  UPDATE public.patients p
     SET primary_location_id = u.location_id,
         updated_at = now()
    FROM unanimous u, tenant t
   WHERE p.id = u.pid
     AND p.tenant_id = t.tenant_id
     AND p.deleted_at IS NULL
     AND p.primary_location_id IS NULL
  RETURNING p.id, p.primary_location_id
)
SELECT count(*)                                                              AS rows_updated,
       count(*) FILTER (WHERE upd.primary_location_id IS DISTINCT FROM u.location_id)
                                                                             AS wrote_wrong_location
  FROM upd JOIN unanimous u ON u.pid = upd.id;

-- ---------------------------------------------------------------------------
-- STEP 3. VERIFY. READ ONLY.
--
--   `derivable_still_null` MUST be 0 - every unanimous unplaced patient now has
--   a clinic. That is this file's whole job and it is the only hard assertion
--   here.
--
--   `already_filed_elsewhere` IS NOT A FAILURE AND AN EARLIER DRAFT ASSERTED IT
--   WAS ZERO. It counts patients whose primary_location_id disagrees with their
--   unanimous appointment evidence - and every one of them was filed by a
--   person or by the importer BEFORE this ran, which is precisely the population
--   this file refuses to overwrite. On the rehearsal lane it read 2 before any
--   backfill ran at all, so a draft that demanded 0 would have reported a false
--   FAIL on a correct production run. It is reported because the DESK may want
--   the list; it is not a stop condition.
--
--   `unplaced_left_for_desk` is the ambiguous plus the no-basis population, and
--   it is the number that says how much work this file did NOT do.
-- ---------------------------------------------------------------------------
\echo '--- STEP 3: VERIFY (read only) ---'
WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1),
live AS (
  SELECT p.id, p.primary_location_id FROM public.patients p, tenant t
   WHERE p.tenant_id = t.tenant_id AND p.deleted_at IS NULL
),
ev AS (
  SELECT a.patient_id AS pid, a.location_id FROM public.appointments a, tenant t
   WHERE a.tenant_id = t.tenant_id AND a.patient_id IS NOT NULL
  UNION ALL
  SELECT a.patient_2_id, a.location_id FROM public.appointments a, tenant t
   WHERE a.tenant_id = t.tenant_id AND a.patient_2_id IS NOT NULL
),
unanimous AS (
  SELECT pid, (array_agg(DISTINCT location_id))[1] AS location_id FROM ev GROUP BY pid
  HAVING count(DISTINCT location_id) = 1
)
SELECT
  -- HARD ASSERTION. Anything but 0 is a stop.
  (SELECT count(*) FROM live l JOIN unanimous u ON u.pid = l.id
    WHERE l.primary_location_id IS NULL)                                        AS derivable_still_null,
  -- INFORMATION, NOT AN ASSERTION. See the header above.
  (SELECT count(*) FROM live l JOIN unanimous u ON u.pid = l.id
    WHERE l.primary_location_id IS NOT NULL
      AND l.primary_location_id IS DISTINCT FROM u.location_id)                 AS already_filed_elsewhere,
  (SELECT count(*) FROM live WHERE primary_location_id IS NULL)                 AS unplaced_left_for_desk,
  -- A LINK ROW IS NOT CREATED BY THIS FILE. Re-run backfill A afterwards to
  -- give the newly-placed patients their junction rows; this number says how
  -- many that will be.
  (SELECT count(*) FROM live l
    WHERE l.primary_location_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.patient_locations pl
                       WHERE pl.patient_id = l.id
                         AND pl.location_id = l.primary_location_id))           AS links_A_would_now_add;
