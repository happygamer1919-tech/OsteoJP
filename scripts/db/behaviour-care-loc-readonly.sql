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
--   L1  THE INSTRUMENT, and the half of it that matters is auth.uid(). The
--       clinic count CANNOT differ - the actor query already requires a
--       staff_locations row and the helper reads those same rows under a
--       UNIQUE constraint - so an arm asserting only that is a tautology, and
--       it is kept only as a reading. What CAN differ is WHO the session is:
--       auth.uid() prefers the `request.jwt.claim.sub` GUC over the
--       `request.jwt.claims` blob this file sets, so a pooler leftover makes
--       every comparand here belong to one user and every subject to another.
--       A zero or a mismatch prints FAIL and never VACUOUS. A zero is not
--       reachable past the STOPs below (a therapist with no clinic leaves L5
--       without a subject, so the file halts first); the FAIL is kept so that
--       a later edit to the STOPs cannot turn an empty clinic set into a pass.
--   L2  THE WORKHORSE. The actor reads EXACTLY old_arm OR (ruled AND own
--       clinic): no row more and no row fewer. The comparand is computed
--       outside RLS in the same snapshot from the same helper arrays. It is
--       the only arm that goes red when the policy is absent, or when the
--       conjunct is an OR, or when the ALTER landed on another policy. It
--       compares COUNTS, not sets: a policy wrong in both directions by the
--       same number would pass it, and L3 to L6 are the arms that name rows.
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
-- WHAT NO ARM HERE MEASURES, stated so nobody reads a green run as covering it.
-- Each was MEASURED by a REVIEWER on a throwaway: the policy was broken in that
-- one way and this file still printed 8 OK / 0 VACUOUS / 0 FAIL.
--   * THE TENANT CONJUNCT. The helper arrays are tenant-scoped, so on data
--     whose rows reference their own tenant the conjunct's loss admits no
--     extra row, and no count can see it; production holds one tenant, so an
--     isolation arm would print VACUOUS there anyway. An earlier revision of
--     this header claimed L2 caught it. It does not.
--   * THE CARE-TEAM HALF ON ITS OWN. When the actor's assigned patients are
--     also patients they treated, a policy that lost its care-team disjuncts
--     reads exactly like the correct one, here and in the CARE-01 file.
-- Both are proven by the SHAPE, not by behaviour: the 0092 post-check pins the
-- whole USING expression by md5, so a rewrite that lost either one reads FAIL
-- there. That is the division of labour, and this paragraph is what keeps it
-- honest.
--
-- IT PRINTS THE ACTOR LINE, THEN COUNTS AND VERDICTS, AND NOTHING ELSE. No name,
-- no phone, no email, no patient id and no appointment id reaches the
-- transcript: every subject is chosen into a psql variable with \gset and used,
-- never echoed.
--
-- THE ACTOR LINE, printed once before anything is checked, names the staff user
-- this run acts as by its id and role slug, and says how it was chosen:
--     ACTOR id <uuid> | role <slug> | chosen <how>
-- where <how> is "passed in with -v actor_id" or "picked at run time (the
-- lowest matching id)". The id is there so whoever reads the transcript can
-- tell, by comparing ids, whether the run acted as a particular account, such
-- as a test account about to be deactivated. It is a staff id, never a name.
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
 * has nothing to measure and says so rather than certifying a vacuous run.
 *
 * THIS PREDICATE GUARANTEES L4's SUBJECT AND NO OTHER, and the three STOPs
 * below say so where they fire. It cannot guarantee the rest: the other three
 * subjects are defined by the helper arrays, which do not resolve until the
 * claims are set, which is after the actor is chosen. So a halt below is a
 * statement about THIS actor, not about the database, and the remedy is to
 * name another one:
 *     psql ... -v actor_id=<uuid> -f scripts/db/behaviour-care-loc-readonly.sql
 * An actor passed that way is used as given and this query is skipped. */
\if :{?actor_id}
\set actor_source 'passed in with -v actor_id'
\else
\set actor_source 'picked at run time (the lowest matching id)'
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
\endif

\if :{?actor_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: no active therapist holds a clinic AND a cross-clinic row the pre-0092 view admitted, inside the window. This migration closes nothing measurable for anybody here. Nothing was checked.';
  END $stop$;
\endif

/* AN ACTOR PASSED WITH -v actor_id IS VERIFIED AND NORMALISED, NOT TRUSTED.
 * It must be an active, non-resource therapist holding a clinic, because the
 * claims below always say therapist; and its id is re-read from the table, so
 * an upper-case uuid cannot trip the identity STOP and an unknown one reaches a
 * STOP that says so instead of psql's own "no rows returned for \gset". */
SELECT (SELECT u.id::text
          FROM public.users u
          JOIN public.roles r ON r.id = u.role_id AND r.slug = 'therapist'
         WHERE u.id = :'actor_id'::uuid
           AND u.is_active
           AND NOT u.is_shared_resource
           AND EXISTS (SELECT 1 FROM public.staff_locations sl
                        WHERE sl.user_id = u.id AND sl.tenant_id = u.tenant_id)) AS actor_checked \gset
\if :{?actor_checked}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the actor is not an active, non-resource therapist holding a clinic. Nothing was checked. Pass another with -v actor_id.';
  END $stop$;
\endif
\set actor_id :actor_checked

SELECT tenant_id AS actor_tenant FROM public.users WHERE id = :'actor_id' \gset

/* THE ACTOR LINE. The role slug only, read from the table; a scalar subquery
 * so a missing role prints NO ROLE rather than ending the run on \gset. The
 * id is the normalised one above, so it is the id the claims below carry. */
SELECT coalesce((SELECT r.slug FROM public.users u JOIN public.roles r ON r.id = u.role_id
                  WHERE u.id = :'actor_id'::uuid), 'NO ROLE') AS actor_role \gset
\echo 'ACTOR id' :actor_id '| role' :actor_role '| chosen' :actor_source

/* THE CLAIMS, SET BEFORE THE ROLE CHANGE. */
SELECT set_config('request.jwt.claims',
       json_build_object('tenant_id', :'actor_tenant', 'user_role', 'therapist', 'sub', :'actor_id')::text,
       true) IS NOT NULL AS claims_set \gset

/* AND THE IDENTITY CHECK COMES FIRST, BEFORE ANYTHING IS CLASSIFIED, AND IT
 * CHECKS ALL THREE THINGS THE HELPERS READ. auth.uid() prefers the
 * `request.jwt.claim.sub` GUC over the `request.jwt.claims` blob set above, and
 * auth.jwt(), which jwt_tenant_id() and jwt_role() read, prefers the
 * `request.jwt.claim` GUC over it in the same way. So a session-level leftover
 * from a pooler can make the helpers answer for a DIFFERENT user, tenant or
 * role than the claims this file set. That poisons the CLASSIFICATION, not
 * just the reads, so it halts here rather than being reported as a verdict at
 * the end - MEASURED by a REVIEWER: a leftover `request.jwt.claim` carrying
 * role owner made four arms FAIL on a correct policy while the uid-only check
 * passed, and one carrying another tenant halted on the L4 STOP blaming the
 * actor. L1 reports the uid half for the transcript. */
/* THE COMPARISON IS DONE IN SQL AND BRANCHED WITH \if, NOT INSIDE THE DO BODY:
 * psql does not interpolate `:'var'` inside a dollar-quoted block, and a DO
 * body that tried would die on a syntax error at the colon. */
SELECT coalesce((SELECT auth.uid())::text, '') AS pre_uid \gset
SELECT (coalesce((SELECT auth.uid()) = :'actor_id'::uuid, false)
        AND coalesce((SELECT public.jwt_tenant_id())::text = :'actor_tenant', false)
        AND coalesce((SELECT public.jwt_role()) = 'therapist', false))::text AS identity_matches \gset
\if :identity_matches
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the session is not the identity this file set: auth.uid(), jwt_tenant_id() or jwt_role() answers for someone else. Something has set request.jwt.claim.sub or request.jwt.claim on this session, which the helpers prefer over the claims blob. Nothing was checked. Reconnect, or RESET both.';
  END $stop$;
\endif

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
    RAISE EXCEPTION 'STOP: the chosen actor has no appointment the pre-0092 view admitted at a clinic they do not belong to, so L4 has no subject. Nothing was checked. This can only happen for an actor passed with -v actor_id; the default selector guarantees this one.';
  END $stop$;
\endif
\if :{?kept_appt}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the chosen actor follows no patient whose appointment sits at their OWN clinic, so L5 has no subject and every negative below would be unguarded. Nothing was checked. THIS IS ABOUT THIS ACTOR, NOT THE DATABASE: the selector cannot test this condition, because it needs the helper arrays and those need the claims. Re-run with -v actor_id=<another therapist>.';
  END $stop$;
\endif
\if :{?neg_own_appt}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the chosen actor has no appointment at their own clinic for a patient they neither follow nor have treated, so L6 has no subject. Nothing was checked. THIS IS ABOUT THIS ACTOR, NOT THE DATABASE. Re-run with -v actor_id=<another therapist>.';
  END $stop$;
\endif
\if :{?own_foreign_appt}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the chosen actor holds no work of their own at a clinic they do not belong to, so L7 has no subject. Nothing was checked. THIS IS ABOUT THIS ACTOR, NOT THE DATABASE. Re-run with -v actor_id=<another therapist>.';
  END $stop$;
\endif

/* BECOME THE ACTOR. */
SET LOCAL ROLE authenticated;

/* L1's own reading, as the actor. Calling the helper here is also what proves
 * `authenticated` holds EXECUTE: a denial aborts the file under ON_ERROR_STOP
 * before any verdict prints.
 *
 * AND auth.uid(), WHICH IS THE HALF THAT CAN ACTUALLY DIFFER. The clinic count
 * cannot: the actor query already requires a staff_locations row, and
 * viewer_location_ids() (0073) reads those same rows under a UNIQUE
 * (tenant_id, user_id, location_id), so cardinality equals the count by
 * construction and an arm asserting only that is a tautology. What is NOT
 * guaranteed is that auth.uid() is the user this file chose: auth.uid() prefers
 * the `request.jwt.claim.sub` GUC over the `request.jwt.claims` blob this file
 * sets, so a session-level leftover from a pooler makes the helpers answer for
 * a DIFFERENT user while jwt_tenant_id() and jwt_role() still answer for ours.
 * Every comparand in this file would then be computed for one user and every
 * subject read as another. That is what L1 is for. */
SELECT coalesce(cardinality(public.viewer_location_ids()), 0)::int AS fn_locs \gset
SELECT coalesce((SELECT auth.uid())::text, '') AS seen_uid \gset

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
  (1, 'L1. INSTRUMENT: the session IS the chosen actor, and holds the clinics we counted',
      CASE WHEN :'seen_uid' = :'actor_id' THEN 'auth.uid() is the chosen actor' ELSE 'auth.uid() is SOMEBODY ELSE' END
        || ', ' || :'fn_locs' || ' clinic(s) from the helper',
      'the chosen actor, ' || :'sl_locs' || ' in staff_locations, > 0',
      CASE WHEN :'seen_uid' <> :'actor_id' THEN 'FAIL'
           WHEN :sl_locs = 0 OR :fn_locs = 0 THEN 'FAIL'
           WHEN :fn_locs <> :sl_locs THEN 'FAIL' ELSE 'OK' END),
  (2, 'L2. EXACTLY the narrowed set: no row more and no row fewer',
      :'readable', :'admitted_0092',
      CASE WHEN :readable <> :admitted_0092 THEN 'FAIL'
           WHEN :admitted_0092 = 0 THEN 'VACUOUS' ELSE 'OK' END),
  (3, 'L3. SWEEP: all that is still readable at a foreign clinic is the actor''s own work',
      :'foreign_not_own' || ' of ' || :'closed_total' || ' that crossed the wall before 0092', '0',
      CASE WHEN :foreign_not_own <> 0 THEN 'FAIL'
           WHEN :closed_total = 0 THEN 'VACUOUS' ELSE 'OK' END),
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
       (SELECT count(*) FROM r) || ' arms', 'SUMMARY'
ORDER BY 1;

ROLLBACK;
