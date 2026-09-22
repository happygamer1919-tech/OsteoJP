-- CARE-LOC (0092) BEHAVIOUR CHECK. READ ONLY. Run AFTER 0092 is applied.
--
-- 0091 let a therapist read every appointment of a patient they treat or are
-- assigned to, at ANY clinic. The owner ruled that too wide on 2026-09-21,
-- option (b): the patient-following view stops at the therapist's OWN clinic.
-- 0092 adds one conjunct to one policy to do it. This file proves what that
-- does to a REAL actor on the database it was applied to.
--
-- THIS IS NOT THE CARE-01 CHECK WITH A NEW NAME, and both must exist. Running
-- scripts/db/behaviour-care-team-readonly.sql after 0092 is applied prints B2
-- FAIL and it is RIGHT to: its comparand is the pre-0092 predicate, so the
-- actor reads fewer rows than it admits, by exactly the number 0092 closed.
-- MEASURED on a throwaway standing at 0092: readable 3 against admitted 4.
-- After 0092 the CARE-01 file is a historical record of the 0091 sitting;
-- this file is the live instrument.
--
-- ===========================================================================
-- THE VERDICT CONTRACT. THREE VALUES, AND A PROFILE.
-- ===========================================================================
-- Every arm prints OK, VACUOUS or FAIL, and the last row prints
--     N OK / M VACUOUS / K FAIL
-- A 0 COMPARAND OR A 0 SUBJECT PRINTS VACUOUS, NEVER OK. The caller asserts
-- the three numbers it expects, measured on the day, and never "no VACUOUS":
-- the 0091 document predicted correctly that two of its arms would be vacuous
-- on apply day, and an absence-assertion would have halted a correct sitting.
--
-- WHERE A SUBJECT IS MISSING THIS FILE HALTS INSTEAD, and that is the
-- difference between the two states. VACUOUS means the arm ran and could not
-- have failed. A STOP means the database cannot furnish the arm at all, which
-- is a fact about the actor and has to be read before anything else is
-- believed. Every named-subject arm is furnished by its own STOP, so none of
-- them can print a verdict over a NULL id - `count(*) WHERE id = NULL` is 0
-- and would print OK, which is the exact shape of a vacuous negative.
--
-- ===========================================================================
-- THE ARMS
-- ===========================================================================
--   0   the transaction is READ ONLY and REPEATABLE READ. A guard on the
--       harness, not a measurement: nothing wraps this file, so no database
--       state makes it print FAIL. It is counted, and that is stated rather
--       than hidden.
--   L1  THE INSTRUMENT. viewer_location_ids() agrees with the actor's
--       staff_locations rows, and is NOT EMPTY. A zero here prints FAIL and
--       never VACUOUS, deliberately: an empty array makes the location
--       conjunct false everywhere, which makes L3 and L4 green for the worst
--       possible reason. The 0092 arm of a therapist with no clinic is not a
--       narrower view, it is no view, and this file refuses to certify it.
--   L2  THE WORKHORSE. The actor reads EXACTLY old_arm OR (ruled AND own
--       clinic): no row more and no row fewer. The comparand is computed
--       outside RLS in the same snapshot from the same helper arrays. It is
--       the only arm that goes red when the policy is absent, or when the
--       conjunct is an OR, or when the ALTER landed on another policy. Its
--       subject carries NO tenant filter and its comparand does, so a lost
--       tenant conjunct shows up here as a surplus.
--   L3  INDEPENDENT SWEEP. Everything still readable at a clinic the actor
--       does NOT belong to is their own work. It reuses neither patient
--       helper, so it is the one arm that survives a comparand and a subject
--       built from the same wrong model - the compensating error L2 cannot
--       see. `IS DISTINCT FROM` is load-bearing: created_by is nullable.
--   L4  THE NEGATIVE, and it is 0092's own: ONE named appointment that the
--       PRE-0092 view admitted, at a clinic the actor does not belong to, is
--       refused. Stronger than "a row neither arm ever admitted", which is
--       what the 0091 file asserts: this one was visible yesterday.
--   L5  THE POSITIVE CONTROL, and it replaces the 0091 file's B4. A
--       colleague's booking for a followed patient at the actor's OWN clinic
--       IS readable. It fires through the policy UNDER TEST, which B4 does
--       not: B4's subject is the actor's own work, admitted by appointments_rls
--       with no location predicate at all, so a 0092 that admitted nothing
--       would leave B4 green. Where a row exists, L5's subject is the SAME
--       PATIENT as L4's, so the two differ only in the location.
--   L6  THE OTHER NEGATIVE, at the actor's OWN clinic: an appointment for a
--       patient they neither follow nor have treated is still refused. This
--       is what catches an ALTER that rewrote the whole USING and lost the
--       PATIENT conjunct, leaving tenant + role + location - one typo whose
--       blast radius is every therapist seeing their whole clinic. At a
--       FOREIGN clinic the location conjunct alone would refuse it and the arm
--       would prove nothing, which is why it is pinned to the own clinic.
--   L7  ON PURPOSE: the actor STILL reads work they personally hold at a
--       clinic they do not belong to. 0092's own header says it does not
--       narrow that and carries it to the owner as a question. If somebody
--       later narrows it, this arm is what goes red and says so.
--
-- IT PRINTS COUNTS AND VERDICTS AND NOTHING ELSE. No name, no phone, no email,
-- no patient id and no appointment id reaches the transcript: every subject is
-- chosen into a psql variable with \gset and used, never echoed.
--
-- IT IMPERSONATES, IT DOES NOT LOG IN. set_config on request.jwt.claims then
-- SET LOCAL ROLE authenticated, which is what packages/db/tests/rls-harness.ts
-- does in every RLS test here. No credential of any staff member is involved.
-- The claims are set BEFORE the role change on purpose: set_config(..., true)
-- is transaction-local and survives it, so the helpers resolve identically on
-- both sides and the comparands are computed from the SAME arrays RLS will use.
--
-- ONE READ ONLY REPEATABLE READ transaction, so the server refuses every write
-- and both SET LOCAL and set_config(..., true) end with it. REPEATABLE READ
-- because L2 compares two counts taken by two statements, and at READ COMMITTED
-- a booking made between them would read as a FAIL on a correct policy.
--
-- WHY `MATERIALIZED` AND A WINDOW. Measured on production for the 0091 file:
-- the unbounded classification TIMED OUT at 300 s because the helper CTE was
-- inlined and re-evaluated per row over 89,581 appointments. MATERIALIZED plus
-- a 90-day bound took the same three numbers in 306 ms. Raise :window_days to
-- widen it. The bound narrows the POPULATION of L2, L3, L4, L6 and L7 and
-- changes the MEANING of none of them.

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?window_days}
\else
\set window_days 90
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo ''
\echo '=== CARE-LOC (0092) BEHAVIOUR CHECK. READ ONLY. 8 arms, profile printed last ==='

/* THE ACTOR. An active therapist who holds at least one clinic AND at least
 * one appointment that the pre-0092 view admitted at a clinic they do NOT
 * belong to - i.e. a row this migration actually closes. Without one the file
 * has nothing to measure and says so rather than certifying a vacuous run. */
SELECT (
SELECT u.id
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id AND r.slug = 'therapist'
 WHERE u.is_active
   AND NOT u.is_shared_resource
   AND EXISTS (SELECT 1 FROM public.staff_locations sl
                WHERE sl.user_id = u.id AND sl.tenant_id = u.tenant_id)
   AND EXISTS (
         SELECT 1
           FROM public.appointments own
           JOIN public.appointments oth
             ON oth.tenant_id = own.tenant_id
            AND (oth.patient_id = own.patient_id OR oth.patient_2_id = own.patient_id)
          WHERE own.tenant_id = u.tenant_id
            AND (own.practitioner_id = u.id OR own.practitioner_2_id = u.id)
            AND oth.practitioner_id IS DISTINCT FROM u.id
            AND oth.practitioner_2_id IS DISTINCT FROM u.id
            AND oth.created_by IS DISTINCT FROM u.id
            AND oth.starts_at >= now() - (:'window_days' || ' days')::interval
            AND NOT EXISTS (SELECT 1 FROM public.staff_locations sl2
                             WHERE sl2.user_id = u.id AND sl2.tenant_id = u.tenant_id
                               AND sl2.location_id = oth.location_id))
 ORDER BY u.id
 LIMIT 1
) AS actor_id
\gset

\if :{?actor_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: no active therapist holds a clinic AND a cross-clinic row the pre-0092 view admitted, inside the window. This migration closes nothing measurable for anybody here. Nothing was checked.';
  END $stop$;
\endif

SELECT tenant_id AS actor_tenant FROM public.users WHERE id = :'actor_id' \gset

/* THE CLAIMS, SET BEFORE THE ROLE CHANGE. */
SELECT set_config('request.jwt.claims',
       json_build_object('tenant_id', :'actor_tenant', 'user_role', 'therapist', 'sub', :'actor_id')::text,
       true) AS claims_set \gset

/* THE INSTRUMENT'S COMPARAND, outside RLS: how many distinct clinics the actor
 * is installed at. L1 compares the helper against this. */
SELECT count(DISTINCT location_id)::int AS sl_locs
  FROM public.staff_locations
 WHERE user_id = :'actor_id' AND tenant_id = :'actor_tenant' \gset

/* ONE CLASSIFICATION PASS, outside RLS, from the SAME arrays RLS will use.
 * MATERIALIZED is load-bearing: see the header. */
WITH v AS MATERIALIZED (
  SELECT coalesce(public.viewer_care_team_patient_ids(),     '{}'::uuid[]) AS care,
         coalesce(public.viewer_treated_patient_ids(),       '{}'::uuid[]) AS treated,
         coalesce(public.shared_resource_practitioner_ids(), '{}'::uuid[]) AS sr,
         coalesce(public.viewer_location_ids(),              '{}'::uuid[]) AS loc
), cls AS (
  SELECT a.id,
         (coalesce(a.patient_id   = ANY (v.care),    false)
       OR coalesce(a.patient_2_id = ANY (v.care),    false)
       OR coalesce(a.patient_id   = ANY (v.treated), false)
       OR coalesce(a.patient_2_id = ANY (v.treated), false))            AS follows,
         coalesce(a.location_id = ANY (v.loc), false)                   AS at_own_loc,
         (a.created_by        IS NOT DISTINCT FROM (SELECT auth.uid())
       OR a.practitioner_id   IS NOT DISTINCT FROM (SELECT auth.uid())
       OR a.practitioner_2_id IS NOT DISTINCT FROM (SELECT auth.uid())
       OR (coalesce(a.practitioner_id   = ANY (v.sr), false) AND coalesce(a.location_id = ANY (v.loc), false))
       OR (coalesce(a.practitioner_2_id = ANY (v.sr), false) AND coalesce(a.location_id = ANY (v.loc), false)))
                                                                        AS own_arm
    FROM public.appointments a
   CROSS JOIN v
   WHERE a.tenant_id = (SELECT public.jwt_tenant_id())
     AND a.starts_at >= now() - (:'window_days' || ' days')::interval
)
SELECT count(*) FILTER (WHERE own_arm OR (follows AND at_own_loc))::int     AS admitted_0092,
       count(*) FILTER (WHERE follows AND NOT own_arm AND NOT at_own_loc)::int AS closed_total,
       count(*) FILTER (WHERE NOT follows AND NOT own_arm AND at_own_loc)::int AS neg_own_total,
       count(*) FILTER (WHERE own_arm AND NOT at_own_loc)::int             AS own_foreign_total
  FROM cls
\gset

/* THE SUBJECTS. Each is one id, chosen and never echoed. A scalar subquery
 * over nothing yields NULL, \gset leaves the variable unset, and the STOP
 * below is reached - which is why none of these arms can run over a NULL id. */
WITH v AS MATERIALIZED (
  SELECT coalesce(public.viewer_care_team_patient_ids(),     '{}'::uuid[]) AS care,
         coalesce(public.viewer_treated_patient_ids(),       '{}'::uuid[]) AS treated,
         coalesce(public.shared_resource_practitioner_ids(), '{}'::uuid[]) AS sr,
         coalesce(public.viewer_location_ids(),              '{}'::uuid[]) AS loc
), cls AS (
  SELECT a.id, a.patient_id,
         (coalesce(a.patient_id   = ANY (v.care),    false)
       OR coalesce(a.patient_2_id = ANY (v.care),    false)
       OR coalesce(a.patient_id   = ANY (v.treated), false)
       OR coalesce(a.patient_2_id = ANY (v.treated), false))            AS follows,
         coalesce(a.location_id = ANY (v.loc), false)                   AS at_own_loc,
         (a.created_by        IS NOT DISTINCT FROM (SELECT auth.uid())
       OR a.practitioner_id   IS NOT DISTINCT FROM (SELECT auth.uid())
       OR a.practitioner_2_id IS NOT DISTINCT FROM (SELECT auth.uid())
       OR (coalesce(a.practitioner_id   = ANY (v.sr), false) AND coalesce(a.location_id = ANY (v.loc), false))
       OR (coalesce(a.practitioner_2_id = ANY (v.sr), false) AND coalesce(a.location_id = ANY (v.loc), false)))
                                                                        AS own_arm
    FROM public.appointments a
   CROSS JOIN v
   WHERE a.tenant_id = (SELECT public.jwt_tenant_id())
     AND a.starts_at >= now() - (:'window_days' || ' days')::interval
), closed AS (
  SELECT id, patient_id FROM cls
   WHERE follows AND NOT own_arm AND NOT at_own_loc ORDER BY id LIMIT 1
)
SELECT (SELECT id FROM closed) AS closed_appt,
       /* L5 prefers the SAME PATIENT as L4, so the pair differs only in the
        * location; it falls back to any followed patient at the own clinic. */
       coalesce(
         (SELECT c.id FROM cls c WHERE c.follows AND NOT c.own_arm AND c.at_own_loc
             AND c.patient_id = (SELECT patient_id FROM closed) ORDER BY c.id LIMIT 1),
         (SELECT c.id FROM cls c WHERE c.follows AND NOT c.own_arm AND c.at_own_loc
           ORDER BY c.id LIMIT 1)
       ) AS kept_appt,
       (SELECT c.id FROM cls c WHERE NOT c.follows AND NOT c.own_arm AND c.at_own_loc
         ORDER BY c.id LIMIT 1) AS neg_own_appt,
       (SELECT c.id FROM cls c WHERE c.own_arm AND NOT c.at_own_loc
         ORDER BY c.id LIMIT 1) AS own_foreign_appt
\gset

\if :{?closed_appt}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the chosen actor has no appointment the pre-0092 view admitted at a clinic they do not belong to, so L4 has no subject. Nothing was checked.';
  END $stop$;
\endif
\if :{?kept_appt}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the chosen actor follows no patient whose appointment sits at their OWN clinic, so L5 has no subject and every negative below would be unguarded. Nothing was checked.';
  END $stop$;
\endif
\if :{?neg_own_appt}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the chosen actor has no appointment at their own clinic for a patient they neither follow nor have treated, so L6 has no subject. Nothing was checked.';
  END $stop$;
\endif
\if :{?own_foreign_appt}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the chosen actor holds no work of their own at a clinic they do not belong to, so L7 has no subject. Nothing was checked.';
  END $stop$;
\endif

/* BECOME THE ACTOR. */
SET LOCAL ROLE authenticated;

/* L1's own reading, as the actor: the helper, and how many of its ids are NOT
 * in the actor's own rows. Calling it here is also what proves `authenticated`
 * holds EXECUTE - a denial aborts the file before any verdict prints. */
SELECT coalesce(cardinality(public.viewer_location_ids()), 0)::int AS fn_locs \gset

/* THE SAME WINDOW AS THE COMPARAND, and no tenant filter: RLS must supply it. */
SELECT count(*)::int AS readable FROM public.appointments
 WHERE starts_at >= now() - (:'window_days' || ' days')::interval \gset

/* L3's sweep. Everything readable at a clinic the actor does not belong to,
 * that is not their own work. IS DISTINCT FROM because created_by is nullable. */
SELECT count(*)::int AS foreign_not_own FROM public.appointments a
 WHERE a.starts_at >= now() - (:'window_days' || ' days')::interval
   AND coalesce(a.location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[])), false) IS NOT TRUE
   AND a.created_by        IS DISTINCT FROM (SELECT auth.uid())
   AND a.practitioner_id   IS DISTINCT FROM (SELECT auth.uid())
   AND a.practitioner_2_id IS DISTINCT FROM (SELECT auth.uid()) \gset

SELECT count(*)::int AS sees_closed      FROM public.appointments WHERE id = :'closed_appt' \gset
SELECT count(*)::int AS sees_kept        FROM public.appointments WHERE id = :'kept_appt' \gset
SELECT count(*)::int AS sees_neg_own     FROM public.appointments WHERE id = :'neg_own_appt' \gset
SELECT count(*)::int AS sees_own_foreign FROM public.appointments WHERE id = :'own_foreign_appt' \gset

RESET ROLE;

WITH r(n, "check", observed, expected, verdict) AS (VALUES
  (0, '0. this transaction is READ ONLY and REPEATABLE READ',
      current_setting('transaction_read_only') || ' / ' || current_setting('transaction_isolation'),
      'on / repeatable read',
      CASE WHEN current_setting('transaction_read_only') = 'on'
            AND current_setting('transaction_isolation') = 'repeatable read' THEN 'OK' ELSE 'FAIL' END),
  (1, 'L1. INSTRUMENT: viewer_location_ids() is the actor''s clinics, and is not empty',
      :'fn_locs' || ' clinic(s) from the helper', :'sl_locs' || ' in staff_locations, > 0',
      CASE WHEN :sl_locs = 0 OR :fn_locs = 0 THEN 'FAIL'
           WHEN :fn_locs = :sl_locs THEN 'OK' ELSE 'FAIL' END),
  (2, 'L2. EXACTLY the narrowed set: no row more and no row fewer',
      :'readable', :'admitted_0092',
      CASE WHEN :admitted_0092 = 0 THEN 'VACUOUS'
           WHEN :readable = :admitted_0092 THEN 'OK' ELSE 'FAIL' END),
  (3, 'L3. SWEEP: all that is still readable at a foreign clinic is the actor''s own work',
      :'foreign_not_own' || ' of ' || :'closed_total' || ' that crossed the wall before 0092', '0',
      CASE WHEN :closed_total = 0 THEN 'VACUOUS'
           WHEN :foreign_not_own = 0 THEN 'OK' ELSE 'FAIL' END),
  (4, 'L4. NEGATIVE: one row the PRE-0092 view admitted, at a foreign clinic, is refused',
      :'sees_closed' || ' read of 1 subject, of ' || :'closed_total' || ' such rows', '0 read',
      CASE WHEN :sees_closed = 0 THEN 'OK' ELSE 'FAIL' END),
  (5, 'L5. CONTROL for L4, through the SAME policy: a colleague''s booking for a followed patient at the OWN clinic IS read',
      :'sees_kept' || ' read of 1 subject', '1 read',
      CASE WHEN :sees_kept = 1 THEN 'OK' ELSE 'FAIL' END),
  (6, 'L6. NEGATIVE at the OWN clinic: a patient the actor neither follows nor treated is still refused',
      :'sees_neg_own' || ' read of 1 subject, of ' || :'neg_own_total' || ' such rows', '0 read',
      CASE WHEN :sees_neg_own = 0 THEN 'OK' ELSE 'FAIL' END),
  (7, 'L7. ON PURPOSE: the actor still reads work they personally hold at a foreign clinic',
      :'sees_own_foreign' || ' read of 1 subject, of ' || :'own_foreign_total' || ' such rows', '1 read',
      CASE WHEN :sees_own_foreign = 1 THEN 'OK' ELSE 'FAIL' END)
)
SELECT n, "check", observed, expected, verdict FROM r
UNION ALL
SELECT 99, 'SUMMARY. the verdict profile this run printed',
       (SELECT count(*) FROM r WHERE verdict = 'OK')      || ' OK / ' ||
       (SELECT count(*) FROM r WHERE verdict = 'VACUOUS') || ' VACUOUS / ' ||
       (SELECT count(*) FROM r WHERE verdict = 'FAIL')    || ' FAIL',
       '8 arms', 'SUMMARY'
ORDER BY 1;

ROLLBACK;
