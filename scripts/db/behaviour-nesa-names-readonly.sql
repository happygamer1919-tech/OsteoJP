-- NESA-NAMES BEHAVIOUR CHECK. READ ONLY. Run AFTER 0090 is applied.
--
-- The post-check proves the function's SHAPE: it exists, who owns it, who may
-- execute it, that no policy moved. This proves what it DOES, to a real actor,
-- on the database it was applied to:
--
--   B1  a therapist installed where a shared resource holds a booking gets at
--       least one row back, and every row carries a non-empty name;
--   B2  the function returns EXACTLY the ruled set for that actor, no row more:
--       the count under the actor's claims equals the count the ruling's own
--       predicate gives when computed outside RLS;
--   B3  THE NEGATIVE: that same therapist cannot read the patients row of a
--       patient only another therapist treats and no shared resource ever
--       booked. The function must not have widened anything else;
--   B4  THE POSITIVE CONTROL FOR B3, same actor, same table, same transaction:
--       their OWN patient IS readable. Without it B3 would pass just as well on
--       a session that can read no patient at all;
--   B5  a second control: the actor sees a non-zero number of patients in all;
--   B6  the function answers a NON-therapist with nothing (reception reads names
--       through patients_select; the function is not their door).
--
-- IT PRINTS COUNTS AND VERDICTS AND NOTHING ELSE. No name, no phone, no email and
-- no patient id reaches the transcript: the actor and both patients are chosen
-- into psql variables with \gset and used, never echoed.
--
-- IT IMPERSONATES, IT DOES NOT LOG IN. `SET LOCAL ROLE authenticated` plus the
-- `request.jwt.claims` GUC is what packages/db/tests/rls-harness.ts does in every
-- RLS test in this repository, so RLS sees exactly what it sees for a real
-- therapist token. No credential of any staff member is involved.
--
-- The whole file is ONE `BEGIN READ ONLY` transaction, so the server refuses any
-- write, and SET LOCAL and set_config(..., true) both end with it.

\pset pager off
\timing off
\set ON_ERROR_STOP on

BEGIN READ ONLY;

\echo ''
\echo '=== NESA-NAMES BEHAVIOUR CHECK. READ ONLY. Every verdict must read OK (7 expected) ==='

SELECT u.id AS actor_id, u.tenant_id AS actor_tenant
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id AND r.slug = 'therapist'
  JOIN public.staff_locations sl ON sl.user_id = u.id AND sl.tenant_id = u.tenant_id
 WHERE u.is_active
   AND NOT u.is_shared_resource
   AND EXISTS (
         SELECT 1
           FROM public.appointments a
           JOIN public.users n
             ON n.tenant_id = a.tenant_id AND n.is_shared_resource
            AND n.id IN (a.practitioner_id, a.practitioner_2_id)
           JOIN public.staff_locations nsl
             ON nsl.user_id = n.id AND nsl.tenant_id = n.tenant_id AND nsl.location_id = a.location_id
          WHERE a.tenant_id = u.tenant_id AND a.location_id = sl.location_id AND a.patient_id IS NOT NULL)
   AND EXISTS (
         SELECT 1 FROM public.appointments a
          WHERE a.tenant_id = u.tenant_id AND a.practitioner_id = u.id AND a.patient_id IS NOT NULL)
 ORDER BY u.id
 LIMIT 1
\gset

\if :{?actor_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: no active therapist is installed at a clinic where a shared resource holds a booking AND has a patient of their own. Nothing was checked.';
  END $stop$;
\endif

SELECT a.patient_id AS own_patient
  FROM public.appointments a
 WHERE a.tenant_id = :'actor_tenant' AND a.practitioner_id = :'actor_id' AND a.patient_id IS NOT NULL
 ORDER BY a.id
 LIMIT 1
\gset

SELECT p.id AS other_patient
  FROM public.patients p
 WHERE p.tenant_id = :'actor_tenant'
   AND p.created_by IS DISTINCT FROM :'actor_id'::uuid
   AND EXISTS (SELECT 1 FROM public.appointments a
                WHERE a.tenant_id = p.tenant_id AND (a.patient_id = p.id OR a.patient_2_id = p.id))
   AND NOT EXISTS (SELECT 1 FROM public.appointments a
                    WHERE a.tenant_id = p.tenant_id AND (a.patient_id = p.id OR a.patient_2_id = p.id)
                      AND (a.practitioner_id = :'actor_id' OR a.practitioner_2_id = :'actor_id'))
   AND NOT EXISTS (SELECT 1 FROM public.appointments a
                     JOIN public.users n ON n.tenant_id = a.tenant_id AND n.is_shared_resource
                      AND n.id IN (a.practitioner_id, a.practitioner_2_id)
                    WHERE a.tenant_id = p.tenant_id AND (a.patient_id = p.id OR a.patient_2_id = p.id))
 ORDER BY p.id
 LIMIT 1
\gset

\if :{?other_patient}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: no patient exists who is treated only by another therapist and never by a shared resource, so the negative arm has no subject. Nothing was checked.';
  END $stop$;
\endif

/* THE RULING'S OWN PREDICATE, computed as the connecting role and therefore
 * outside RLS: appointments held by a shared-resource staff row, at a location
 * where BOTH that row and the actor are installed, that have a patient. */
SELECT count(*)::int AS ruled_count
  FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
 WHERE a.tenant_id = :'actor_tenant'
   AND a.location_id IN (SELECT sl.location_id FROM public.staff_locations sl
                          WHERE sl.user_id = :'actor_id' AND sl.tenant_id = :'actor_tenant')
   AND EXISTS (SELECT 1 FROM public.users n
                 JOIN public.staff_locations nsl ON nsl.user_id = n.id AND nsl.tenant_id = n.tenant_id
                WHERE n.tenant_id = a.tenant_id AND n.is_shared_resource
                  AND n.id IN (a.practitioner_id, a.practitioner_2_id)
                  AND nsl.location_id IN (SELECT sl.location_id FROM public.staff_locations sl
                                           WHERE sl.user_id = :'actor_id' AND sl.tenant_id = :'actor_tenant'))
\gset

/* BECOME THE ACTOR. */
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', :'actor_tenant', 'user_role', 'therapist', 'sub', :'actor_id')::text,
         true) IS NOT NULL AS claims_set
\gset
SET LOCAL ROLE authenticated;

SELECT count(*)::int                                                              AS fn_rows,
       count(*) FILTER (WHERE patient_name IS NOT NULL AND btrim(patient_name) <> '')::int AS fn_named
  FROM public.shared_resource_appointment_patient_names()
\gset
SELECT count(*)::int AS sees_other   FROM public.patients WHERE id = :'other_patient' \gset
SELECT count(*)::int AS sees_own     FROM public.patients WHERE id = :'own_patient'   \gset
SELECT count(*)::int AS sees_any     FROM public.patients                             \gset

/* THE SAME PERSON WITH A RECEPTION TOKEN. The function keys on the role claim. */
RESET ROLE;
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', :'actor_tenant', 'user_role', 'reception', 'sub', :'actor_id')::text,
         true) IS NOT NULL AS claims_reset
\gset
SET LOCAL ROLE authenticated;
SELECT count(*)::int AS fn_rows_reception FROM public.shared_resource_appointment_patient_names() \gset
RESET ROLE;

SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict
UNION ALL SELECT 'B1. the therapist gets names back for shared-resource bookings',
       :'fn_named' || ' named of ' || :'fn_rows' || ' rows', 'at least 1, and every row named',
       CASE WHEN :fn_rows > 0 AND :fn_named = :fn_rows THEN 'OK' ELSE 'FAIL' END
UNION ALL SELECT 'B2. exactly the ruled set, no row more and no row fewer',
       :'fn_rows', :'ruled_count',
       CASE WHEN :fn_rows = :ruled_count THEN 'OK' ELSE 'FAIL' END
UNION ALL SELECT 'B3. NEGATIVE: another therapist''s non-NESA patient is refused',
       :'sees_other', '0',
       CASE WHEN :sees_other = 0 THEN 'OK' ELSE 'FAIL' END
UNION ALL SELECT 'B4. CONTROL for B3: the same actor DOES read their own patient',
       :'sees_own', '1',
       CASE WHEN :sees_own = 1 THEN 'OK' ELSE 'FAIL' END
UNION ALL SELECT 'B5. CONTROL: the actor reads a non-zero number of patients at all',
       :'sees_any', '> 0',
       CASE WHEN :sees_any > 0 THEN 'OK' ELSE 'FAIL' END
UNION ALL SELECT 'B6. the function answers a reception token with nothing',
       :'fn_rows_reception', '0',
       CASE WHEN :fn_rows_reception = 0 THEN 'OK' ELSE 'FAIL' END;

ROLLBACK;
