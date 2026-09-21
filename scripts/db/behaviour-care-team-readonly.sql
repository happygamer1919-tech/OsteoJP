-- CARE-01 BEHAVIOUR CHECK. READ ONLY. Run AFTER 0091 is applied.
--
-- The post-check proves the SHAPE: the table exists, the function is SECURITY
-- DEFINER, who may execute it, that appointments_rls did not move. This proves
-- what the new policy DOES, to a real actor, on the database it was applied to:
--
--   B1  the RULED set contains appointments the pre-0091 predicate did NOT
--       admit, so this actor is a subject on which the migration has work to
--       do. B1 is a statement about the DATA and not about the policy: with
--       the policy dropped it still reads OK, and B2 is what FAILS. Measured,
--       not reasoned: that arm was run (see the apply document);
--   B2  the actor reads EXACTLY the union of the old predicate and the ruled
--       one: no row more and no row fewer. The comparand is computed outside
--       RLS in the same transaction;
--   B3  THE NEGATIVE: an appointment admitted by NEITHER arm is refused;
--   B4  THE POSITIVE CONTROL FOR B3, same actor, same table, same transaction:
--       one of their own appointments IS readable. Without it B3 would pass
--       just as well on a session that can read no appointment at all;
--   B5  the new table itself shows a therapist NOTHING. The helper reads it on
--       their behalf; they never see who else is on any team;
--   B6  viewer_care_team_patient_ids() agrees with the table: the array it
--       returns for the actor has exactly as many ids as the actor has live
--       assignments counted outside RLS. It is also the proof that
--       `authenticated` can call the function at all;
--   B7  tenant isolation is intact: zero appointments of any other tenant are
--       readable, against a non-zero number that exist.
--
-- IT PRINTS COUNTS AND VERDICTS AND NOTHING ELSE. No name, no phone, no email,
-- no patient id and no appointment id reaches the transcript: the actor and
-- both appointments are chosen into psql variables with \gset and used, never
-- echoed.
--
-- IT IMPERSONATES, IT DOES NOT LOG IN. `SET LOCAL ROLE authenticated` plus the
-- `request.jwt.claims` GUC is what packages/db/tests/rls-harness.ts does in
-- every RLS test in this repository, so RLS sees exactly what it sees for a
-- real therapist token. No credential of any staff member is involved.
--
-- THE CLAIMS ARE SET BEFORE THE ROLE CHANGE, DELIBERATELY. set_config(..., true)
-- is transaction-local and survives the role change, so the four visibility
-- helpers resolve identically on both sides of it. The comparands in B1, B2 and
-- B6 are therefore computed from the SAME arrays RLS will use, as the
-- connecting role, which bypasses RLS by ownership.
--
-- The whole file is ONE READ ONLY transaction, so the server refuses any write,
-- and SET LOCAL and set_config(..., true) both end with it. It is REPEATABLE
-- READ as well: B2 compares two counts taken by two statements, and at READ
-- COMMITTED a booking made by reception between them would read as a FAIL on a
-- correct policy.
--
-- EVERY SELECTOR BELOW RETURNS EXACTLY ONE ROW, by being a scalar subquery. With
-- ON_ERROR_STOP a `\gset` over ZERO rows is itself a psql error, which would end
-- the run on "no rows returned for \gset" before the STOP line that explains
-- why. A scalar subquery that finds nothing yields NULL, `\gset` leaves the
-- variable unset for a NULL, and the `\if :{?...}` branch is reached.

\pset pager off
\timing off
\set ON_ERROR_STOP on

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo ''
\echo '=== CARE-01 BEHAVIOUR CHECK. READ ONLY. Every verdict must read OK (8 expected) ==='

/* An active therapist who has treated a patient that somebody ELSE also has an
 * appointment with. That second appointment is the one 0091 is about. */
SELECT (
SELECT u.id
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id AND r.slug = 'therapist'
 WHERE u.is_active
   AND NOT u.is_shared_resource
   AND EXISTS (
         SELECT 1
           FROM public.appointments own
           JOIN public.appointments oth
             ON oth.tenant_id = own.tenant_id
            AND (oth.patient_id = own.patient_id OR oth.patient_2_id = own.patient_id)
          WHERE own.tenant_id = u.tenant_id
            AND (own.practitioner_id = u.id OR own.practitioner_2_id = u.id)
            AND own.patient_id IS NOT NULL
            AND oth.practitioner_id IS DISTINCT FROM u.id
            AND oth.practitioner_2_id IS DISTINCT FROM u.id
            AND oth.created_by IS DISTINCT FROM u.id
            /* and NOT already admitted by the shared-resource arms of
             * appointments_rls or of 0088, which would make it not new. */
            AND NOT EXISTS (
                  SELECT 1
                    FROM public.users n
                    JOIN public.staff_locations nsl
                      ON nsl.user_id = n.id AND nsl.tenant_id = n.tenant_id
                   WHERE n.tenant_id = oth.tenant_id
                     AND n.is_shared_resource
                     AND n.id IN (oth.practitioner_id, oth.practitioner_2_id)
                     AND nsl.location_id = oth.location_id
                     AND oth.location_id IN (SELECT sl.location_id
                                               FROM public.staff_locations sl
                                              WHERE sl.user_id = u.id
                                                AND sl.tenant_id = u.tenant_id)))
 ORDER BY u.id
 LIMIT 1
) AS actor_id
\gset

\if :{?actor_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: no active therapist has a patient of their own whose history also carries an appointment somebody else holds. Nothing was checked.';
  END $stop$;
\endif

SELECT u.tenant_id AS actor_tenant FROM public.users u WHERE u.id = :'actor_id' \gset

/* BECOME THE ACTOR AS FAR AS THE CLAIMS GO. The role change comes later; the
 * helpers below must resolve from these claims on BOTH sides of it. */
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', :'actor_tenant', 'user_role', 'therapist', 'sub', :'actor_id')::text,
         true) IS NOT NULL AS claims_set
\gset

/* THE TWO PREDICATES, SIDE BY SIDE, COMPUTED OUTSIDE RLS.
 *   old_arm  what a therapist token could already read before 0091:
 *            appointments_rls (created_by, either practitioner column, the
 *            shared-resource arm) plus 0088's second-participant policy.
 *   new_arm  what 0091 adds: either patient column in the care-team set or in
 *            the treated set. */
/* THE CLASSIFICATION IS REPEATED AS A CTE AND NOT PUT IN A TEMP VIEW, because
 * a READ ONLY transaction disallows every CREATE, temporary ones included
 * (measured: `ERROR: cannot execute CREATE VIEW in a read-only transaction`).
 * Two statements need it, so it appears twice, byte-identical. */
WITH v AS (
  SELECT coalesce(public.viewer_care_team_patient_ids(),     '{}'::uuid[]) AS care,
         coalesce(public.viewer_treated_patient_ids(),       '{}'::uuid[]) AS treated,
         coalesce(public.shared_resource_practitioner_ids(), '{}'::uuid[]) AS sr,
         coalesce(public.viewer_location_ids(),              '{}'::uuid[]) AS loc
), cls AS (
  SELECT a.id,
         (coalesce(a.patient_id   = ANY (v.care),    false)
       OR coalesce(a.patient_2_id = ANY (v.care),    false)
       OR coalesce(a.patient_id   = ANY (v.treated), false)
       OR coalesce(a.patient_2_id = ANY (v.treated), false))            AS new_arm,
         (a.created_by        IS NOT DISTINCT FROM (SELECT auth.uid())
       OR a.practitioner_id   IS NOT DISTINCT FROM (SELECT auth.uid())
       OR a.practitioner_2_id IS NOT DISTINCT FROM (SELECT auth.uid())
       OR (coalesce(a.practitioner_id   = ANY (v.sr), false) AND coalesce(a.location_id = ANY (v.loc), false))
       OR (coalesce(a.practitioner_2_id = ANY (v.sr), false) AND coalesce(a.location_id = ANY (v.loc), false)))
                                                                        AS old_arm
    FROM public.appointments a
   CROSS JOIN v
   WHERE a.tenant_id = (SELECT public.jwt_tenant_id())
)
SELECT count(*) FILTER (WHERE new_arm AND NOT old_arm)::int AS new_only,
       count(*) FILTER (WHERE new_arm OR old_arm)::int      AS admitted,
       count(*) FILTER (WHERE old_arm)::int                 AS old_admitted
  FROM cls
\gset

/* THE SUBJECT OF THE NEGATIVE: an appointment of this tenant that NEITHER arm
 * admits. Without one, B3 has nothing to be refused. */
WITH v AS (
  SELECT coalesce(public.viewer_care_team_patient_ids(),     '{}'::uuid[]) AS care,
         coalesce(public.viewer_treated_patient_ids(),       '{}'::uuid[]) AS treated,
         coalesce(public.shared_resource_practitioner_ids(), '{}'::uuid[]) AS sr,
         coalesce(public.viewer_location_ids(),              '{}'::uuid[]) AS loc
), cls AS (
  SELECT a.id,
         (coalesce(a.patient_id   = ANY (v.care),    false)
       OR coalesce(a.patient_2_id = ANY (v.care),    false)
       OR coalesce(a.patient_id   = ANY (v.treated), false)
       OR coalesce(a.patient_2_id = ANY (v.treated), false))            AS new_arm,
         (a.created_by        IS NOT DISTINCT FROM (SELECT auth.uid())
       OR a.practitioner_id   IS NOT DISTINCT FROM (SELECT auth.uid())
       OR a.practitioner_2_id IS NOT DISTINCT FROM (SELECT auth.uid())
       OR (coalesce(a.practitioner_id   = ANY (v.sr), false) AND coalesce(a.location_id = ANY (v.loc), false))
       OR (coalesce(a.practitioner_2_id = ANY (v.sr), false) AND coalesce(a.location_id = ANY (v.loc), false)))
                                                                        AS old_arm
    FROM public.appointments a
   CROSS JOIN v
   WHERE a.tenant_id = (SELECT public.jwt_tenant_id())
)
SELECT (SELECT id FROM cls WHERE NOT new_arm AND NOT old_arm ORDER BY id LIMIT 1) AS neg_appt
\gset

\if :{?neg_appt}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: every appointment in this tenant is admitted by one arm or the other, so the negative arm has no subject. Nothing was checked.';
  END $stop$;
\endif

/* THE SUBJECT OF THE CONTROL: one the actor holds themselves. */
SELECT (
SELECT a.id FROM public.appointments a
 WHERE a.tenant_id = :'actor_tenant' AND a.practitioner_id = :'actor_id'
 ORDER BY a.id LIMIT 1
) AS own_appt
\gset

\if :{?own_appt}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the chosen actor holds no appointment of their own, so B3 has no positive control. Nothing was checked.';
  END $stop$;
\endif

/* OUTSIDE-RLS COMPARANDS for B5, B6 and B7. */
SELECT count(*)::int AS ct_total FROM public.patient_care_team \gset
SELECT count(DISTINCT patient_id)::int AS ct_live_actor FROM public.patient_care_team
 WHERE tenant_id = :'actor_tenant' AND user_id = :'actor_id' AND removed_at IS NULL \gset
SELECT count(*)::int AS other_tenant_appts FROM public.appointments
 WHERE tenant_id <> :'actor_tenant' \gset

/* BECOME THE ACTOR. */
SET LOCAL ROLE authenticated;

SELECT count(*)::int AS readable FROM public.appointments \gset
SELECT count(*)::int AS sees_negative FROM public.appointments WHERE id = :'neg_appt' \gset
SELECT count(*)::int AS sees_own      FROM public.appointments WHERE id = :'own_appt' \gset
SELECT count(*)::int AS sees_team     FROM public.patient_care_team \gset
SELECT coalesce(cardinality(public.viewer_care_team_patient_ids()), 0)::int AS fn_ids \gset
SELECT count(*)::int AS sees_other_tenant FROM public.appointments
 WHERE tenant_id <> :'actor_tenant' \gset

RESET ROLE;

SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict
UNION ALL SELECT 'B1. the RULED set contains appointments the old predicate did NOT admit',
       :'new_only' || ' new-only of ' || :'admitted' || ' admitted', '> 0',
       CASE WHEN :new_only > 0 THEN 'OK' ELSE 'FAIL' END
UNION ALL SELECT 'B2. exactly the ruled set: no row more and no row fewer',
       :'readable', :'admitted',
       CASE WHEN :readable = :admitted THEN 'OK' ELSE 'FAIL' END
UNION ALL SELECT 'B3. NEGATIVE: an appointment neither arm admits is refused',
       :'sees_negative', '0',
       CASE WHEN :sees_negative = 0 THEN 'OK' ELSE 'FAIL' END
UNION ALL SELECT 'B4. CONTROL for B3: the same actor DOES read one of their own',
       :'sees_own', '1',
       CASE WHEN :sees_own = 1 THEN 'OK' ELSE 'FAIL' END
UNION ALL SELECT 'B5. the care-team table itself shows a therapist nothing',
       :'sees_team' || ' read of ' || :'ct_total' || ' rows', '0 read',
       CASE WHEN :sees_team = 0 THEN 'OK' ELSE 'FAIL' END
UNION ALL SELECT 'B6. the helper agrees with the table (and authenticated can call it)',
       :'fn_ids', :'ct_live_actor',
       CASE WHEN :fn_ids = :ct_live_actor THEN 'OK' ELSE 'FAIL' END
UNION ALL SELECT 'B7. tenant isolation: no appointment of any other tenant is readable',
       :'sees_other_tenant' || ' read of ' || :'other_tenant_appts' || ' that exist', '0 read',
       CASE WHEN :sees_other_tenant = 0 THEN 'OK' ELSE 'FAIL' END;

ROLLBACK;
