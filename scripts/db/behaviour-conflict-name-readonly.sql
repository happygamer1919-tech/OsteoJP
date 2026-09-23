-- CONFLICT NAMES (ruled 0096) BEHAVIOUR CHECK. READ ONLY. Run AFTER the
-- ruled-0096 migration is applied (while pending it is
-- packages/db/migrations-pending/NEXT-AFTER-0095_conflict_name_visibility.sql).
--
-- The ruling, owner 2026-09-22: the conflict check returns a patient's name
-- only when the caller's SELECT policy on appointments returns the row, else
-- the placeholder. The migration splits the check into a SECURITY DEFINER
-- rows function with no patient column and a SECURITY INVOKER
-- appointment_conflicts that adds the name under the caller's own reads. This
-- file proves what that does for a REAL actor on the database it runs on.
--
-- ===========================================================================
-- THE VERDICT CONTRACT. THREE VALUES, AND A PROFILE.
-- ===========================================================================
-- Every arm prints OK, VACUOUS or FAIL, and the last row prints
--     N OK / M VACUOUS / K FAIL
-- A 0 COMPARAND OR A 0 SUBJECT PRINTS VACUOUS, NEVER OK. The caller asserts
-- the three numbers it expects, measured on the day, and never "no VACUOUS".
--
-- WHERE A NAMED SUBJECT IS MISSING THIS FILE HALTS INSTEAD. VACUOUS means the
-- arm ran and could not have failed; a STOP means the database cannot furnish
-- the arm at all. The two named subjects (the positive and the negative) are
-- each furnished by a STOP, so neither arm can print a verdict over a NULL id.
-- The arms that are COUNTS over whatever the calls returned (C1, D1, E1) print
-- VACUOUS on a zero population instead, because a count cannot be read over a
-- missing id.
--
-- ===========================================================================
-- THE CALLS
-- ===========================================================================
-- Subjects are chosen OUTSIDE the caller's policies, from the same helper
-- arrays those policies read, and then VERIFIED as the actor: a subject the
-- model picked wrongly is a STOP, never a verdict. Each subject becomes one
-- call of appointment_conflicts with that appointment's own practitioner,
-- clinic, room and window, so the subject is always one of its own rows:
--   pos   an appointment at the actor's own clinic, for a patient the actor
--         reads through patients. Preferred: the same practitioner as neg.
--   neg   an appointment the actor's appointments policies do not return:
--         chosen outside the actor's clinics and outside the actor's work.
--   pair  ONE call covering both, when pos and neg share a practitioner in
--         the same week: the closest such pair in time, so the call stays
--         small. Without one, pos and neg are chosen separately.
--   ct    when one exists: an appointment the actor reads whose patient the
--         actor's patients read does not return (a care-team-only patient).
--   sr    when one exists: a shared-resource booking at the actor's clinic
--         whose patient the actor does not read through patients.
--
-- ===========================================================================
-- THE ARMS
-- ===========================================================================
--   0   the transaction is READ ONLY and REPEATABLE READ. A guard on the
--       harness, counted and said so.
--   L1  THE INSTRUMENT: auth.uid() is the chosen actor. A pooler leftover in
--       `request.jwt.claim.sub` would make every read belong to someone else.
--   0 AND L1 CANNOT FAIL ON ANY DATABASE THIS FILE REACHES: the file sets the
--   transaction mode itself, and a wrong identity STOPs before the arms run.
--   They are counted so the profile shows the harness held. Of the 14 arms,
--   the 12 below are the ones a database can make FAIL.
--   A1  appointment_conflicts is SECURITY INVOKER. It is what lets the
--       caller's policies decide the name at all.
--   A2  appointment_conflict_rows is SECURITY DEFINER, owned by postgres, with
--       search_path = public (0060's rule).
--   A3  appointment_conflict_rows returns exactly (id, starts_at, ends_at,
--       room, kind): no name column. appointment_conflicts still returns
--       (id, patient_name, starts_at, ends_at, room, kind).
--   A4  EXECUTE: authenticated holds it on both; anon, patient and
--       service_role on neither. Read with has_function_privilege (SR-52).
--   S1  THE SET, against the rows function: over every call, the actor's
--       appointment_conflicts rows equal appointment_conflict_rows' rows, as
--       a multiset. A name computed as a FILTER instead of in the select list
--       drops rows here, and a dropped row is a double booking.
--   S2  THE SET, against 0059's predicate written out in this file and run
--       outside the caller's policies: same calls, same multiset. It shares
--       no code with the migration, so it catches a rows function that
--       drifted from 0059 IN A WAY THESE CALLS REACH. It is not a proof of
--       the whole body: a drift that only matters for a row these few calls
--       do not return (an unconfirmed pedido, a no_show) passes it. The body
--       itself is pinned by its sha256 at promotion, in the apply document.
--   N1  POSITIVE CONTROL: the pos row is returned with a non-NULL name, and it
--       is the name the actor reads through patients for that appointment.
--   N2  NEGATIVE: the neg row is returned, and its name is NULL, which the
--       app renders as the placeholder.
--   N3  ONE CALL, BOTH ANSWERS: in the pair call the pos row is named and the
--       neg row is NULL. VACUOUS when no practitioner furnishes a pair.
--   C1  EVERY ROW: across all calls, each name equals the ruling's answer,
--       computed here from the actor's own reads: the appointment is
--       readable, then patients, then 0090. Prints named / NULL counts.
--   D1  ON PURPOSE, the one place the migration is stricter than the
--       ruling's words: a row the actor reads whose patient neither patients
--       nor 0090 returns gets NULL. VACUOUS when the calls hold none.
--   E1  SHARED RESOURCE: a row the actor reads whose patient patients does
--       not return but 0090 names carries 0090's name. VACUOUS when none.
--
-- WHAT NO ARM HERE MEASURES, so a green run is not read as covering it:
--   * RECEPTION, ADMIN AND OWNER. The actor is a therapist. The migration
--     reads the same policies for every role, and the rehearsal compared five
--     identities (three therapists, reception, owner), but this file does not.
--   * THE TENANT CONJUNCT of the rows function. Production holds one tenant.
--
-- IT PRINTS COUNTS AND VERDICTS AND NOTHING ELSE. No name, no patient id and
-- no appointment id reaches the transcript: every subject is held in a psql
-- variable with \gset and used, never echoed, and every name comparison is
-- made in SQL and returned as a boolean or a count.
--
-- IT IMPERSONATES, IT DOES NOT LOG IN. set_config on request.jwt.claims (flat
-- claims: tenant_id, user_role, sub) then SET LOCAL ROLE authenticated, which
-- is what packages/db/tests/rls-harness.ts does. The claims are set BEFORE the
-- role change: set_config(..., true) is transaction-local and survives it, so
-- the helpers resolve identically on both sides.
--
-- ONE READ ONLY REPEATABLE READ transaction: the server refuses every write,
-- and S2 compares reads taken by two statements in one snapshot.
--
-- THE WINDOW. Subjects are chosen among appointments starting within
-- :window_days (default 90) of now, in either direction. Raise it to widen
-- the choice; it changes the meaning of no arm.
--
-- USAGE
--     psql ... -f scripts/db/behaviour-conflict-name-readonly.sql
--     psql ... -v actor_id=<uuid> -f scripts/db/behaviour-conflict-name-readonly.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?window_days}
\else
\set window_days 90
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo ''
\echo '=== CONFLICT NAMES (ruled 0096) BEHAVIOUR CHECK. READ ONLY. 14 arms, profile printed last ==='

/* THE MIGRATION IS APPLIED, OR NOTHING BELOW MEANS ANYTHING. */
SELECT (to_regprocedure('public.appointment_conflict_rows(uuid,uuid,text,timestamptz,timestamptz,uuid[])') IS NOT NULL
        AND to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])') IS NOT NULL
        AND to_regprocedure('public.shared_resource_appointment_patient_names()') IS NOT NULL)::text AS fns_present \gset
\if :fns_present
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: appointment_conflict_rows, appointment_conflicts or shared_resource_appointment_patient_names is missing. The ruled-0096 migration is not applied here. Nothing was checked.';
  END $stop$;
\endif

/* THE ACTOR. An active, non-resource therapist holding a clinic, with at
 * least one blocking appointment in the window that their appointments
 * policies do not return and that is not their own work (the NEGATIVE's
 * candidate), and at least one they read for a patient they have treated (the
 * POSITIVE's). Both are then verified as the actor. The two optional subjects
 * (ct, sr) are not guaranteed; their arms print VACUOUS without them. An actor
 * passed with -v actor_id is used as given, after the checks below. */
\if :{?actor_id}
\else
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
           FROM public.appointments a
          WHERE a.tenant_id = u.tenant_id
            AND a.status NOT IN ('cancelled', 'no_show')
            AND a.practitioner_id   IS DISTINCT FROM u.id
            AND a.practitioner_2_id IS DISTINCT FROM u.id
            AND a.created_by        IS DISTINCT FROM u.id
            AND a.starts_at >= now() - (:'window_days' || ' days')::interval
            AND a.starts_at <  now() + (:'window_days' || ' days')::interval
            /* not an unconfirmed pedido, spelled out: is_unconfirmed_pedido
             * reads jwt_tenant_id(), and no claims are set yet. */
            AND (a.status <> 'scheduled'
                 OR (a.origin <> 'patient_portal'
                     AND NOT EXISTS (SELECT 1 FROM public.staff_notifications sn
                                      WHERE sn.appointment_id = a.id
                                        AND sn.kind = 'appointment_request')))
            AND NOT EXISTS (SELECT 1 FROM public.staff_locations sl2
                             WHERE sl2.user_id = u.id AND sl2.tenant_id = u.tenant_id
                               AND sl2.location_id = a.location_id))
   AND EXISTS (
         SELECT 1
           FROM public.appointments b
          WHERE b.tenant_id = u.tenant_id
            AND b.status NOT IN ('cancelled', 'no_show')
            AND b.starts_at >= now() - (:'window_days' || ' days')::interval
            AND b.starts_at <  now() + (:'window_days' || ' days')::interval
            AND (b.status <> 'scheduled'
                 OR (b.origin <> 'patient_portal'
                     AND NOT EXISTS (SELECT 1 FROM public.staff_notifications sn
                                      WHERE sn.appointment_id = b.id
                                        AND sn.kind = 'appointment_request')))
            AND EXISTS (SELECT 1 FROM public.staff_locations sl3
                         WHERE sl3.user_id = u.id AND sl3.tenant_id = u.tenant_id
                           AND sl3.location_id = b.location_id)
            /* viewer_treated_patient_ids(), spelled out for the same reason */
            AND EXISTS (SELECT 1 FROM public.appointments t
                         WHERE t.tenant_id = u.tenant_id
                           AND (t.practitioner_id = u.id OR t.practitioner_2_id = u.id)
                           AND (t.patient_id = b.patient_id OR t.patient_2_id = b.patient_id)))
 ORDER BY u.id
 LIMIT 1
) AS actor_id
\gset
\endif

\if :{?actor_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: no active therapist holds a clinic AND has, inside the window, both a booking their appointments policies do not return and a booking they read for a patient they treated. There is no negative and positive pair to measure. Nothing was checked.';
  END $stop$;
\endif

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

/* THE CLAIMS, FLAT, SET BEFORE THE ROLE CHANGE. */
SELECT set_config('request.jwt.claims',
       json_build_object('tenant_id', :'actor_tenant', 'user_role', 'therapist', 'sub', :'actor_id')::text,
       true) IS NOT NULL AS claims_set \gset

/* THE IDENTITY CHECK, BEFORE ANYTHING IS CHOSEN. auth.uid() prefers the
 * `request.jwt.claim.sub` GUC over the claims blob, and auth.jwt() prefers
 * `request.jwt.claim`, so a session leftover would make the helpers answer for
 * someone else. Compared in SQL and branched with \if: psql does not
 * interpolate `:'var'` inside a dollar-quoted block. */
SELECT (coalesce((SELECT auth.uid()) = :'actor_id'::uuid, false)
        AND coalesce((SELECT public.jwt_tenant_id())::text = :'actor_tenant', false)
        AND coalesce((SELECT public.jwt_role()) = 'therapist', false))::text AS identity_matches \gset
\if :identity_matches
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the session is not the identity this file set: auth.uid(), jwt_tenant_id() or jwt_role() answers for someone else. Something has set request.jwt.claim.sub or request.jwt.claim on this session. Nothing was checked. Reconnect, or RESET both.';
  END $stop$;
\endif

/* THE SUBJECTS AND THE CALLS, chosen outside the caller's policies from the
 * helper arrays those policies read. MATERIALIZED so each helper is evaluated
 * once. Only a JSON list of call parameters and two ids leave this statement,
 * into psql variables that are never echoed. */
WITH v AS MATERIALIZED (
  SELECT coalesce(public.viewer_location_ids(),              '{}'::uuid[]) AS loc,
         coalesce(public.viewer_treated_patient_ids(),       '{}'::uuid[]) AS treated,
         coalesce(public.viewer_care_team_patient_ids(),     '{}'::uuid[]) AS care,
         coalesce(public.shared_resource_practitioner_ids(), '{}'::uuid[]) AS sr
), blocking AS MATERIALIZED (
  SELECT a.id, a.patient_id, a.practitioner_id, a.practitioner_2_id, a.created_by,
         a.location_id, a.room, a.starts_at, a.ends_at
    FROM public.appointments a
   WHERE a.tenant_id = :'actor_tenant'::uuid
     AND a.status NOT IN ('cancelled', 'no_show')
     AND a.starts_at >= now() - (:'window_days' || ' days')::interval
     AND a.starts_at <  now() + (:'window_days' || ' days')::interval
     AND NOT public.is_unconfirmed_pedido(a.id)
), cls AS MATERIALIZED (
  SELECT b.*,
         coalesce(b.location_id = ANY (v.loc), false)                       AS at_own_loc,
         (b.practitioner_id   IS NOT DISTINCT FROM :'actor_id'::uuid
       OR b.practitioner_2_id IS NOT DISTINCT FROM :'actor_id'::uuid
       OR b.created_by        IS NOT DISTINCT FROM :'actor_id'::uuid)       AS own_work,
         coalesce(b.patient_id = ANY (v.treated), false)                    AS treated,
         coalesce(b.patient_id = ANY (v.care), false)                       AS care,
         (coalesce(b.practitioner_id = ANY (v.sr), false)
       OR coalesce(b.practitioner_2_id = ANY (v.sr), false))                AS sr_held,
         EXISTS (SELECT 1 FROM public.patients p
                  WHERE p.id = b.patient_id AND p.created_by = :'actor_id'::uuid) AS patient_by_actor
    FROM blocking b CROSS JOIN v
), neg AS (
  SELECT * FROM cls WHERE NOT at_own_loc AND NOT own_work
), pos AS (
  SELECT * FROM cls WHERE at_own_loc AND treated
), paired AS (
  /* Same practitioner, same week: the pair call spans at most a week of one
   * practitioner's diary, so it stays small; the closest pair wins. */
  SELECT n.id AS neg_id, p.id AS pos_id
    FROM neg n
    JOIN pos p ON p.practitioner_id = n.practitioner_id
              AND date_trunc('week', p.starts_at) = date_trunc('week', n.starts_at)
   ORDER BY abs(extract(epoch FROM (p.starts_at - n.starts_at))), n.id, p.id
   LIMIT 1
), pick AS (
  SELECT coalesce((SELECT neg_id FROM paired), (SELECT id FROM neg ORDER BY id LIMIT 1)) AS neg_id,
         coalesce((SELECT pos_id FROM paired), (SELECT id FROM pos ORDER BY id LIMIT 1)) AS pos_id,
         (SELECT id FROM cls
           WHERE at_own_loc AND care AND NOT treated AND NOT sr_held AND NOT patient_by_actor
           ORDER BY id LIMIT 1) AS ct_id,
         (SELECT id FROM cls
           WHERE at_own_loc AND sr_held AND NOT treated AND NOT patient_by_actor
           ORDER BY id LIMIT 1) AS sr_id,
         (SELECT count(*) FROM paired) = 1 AS has_pair
), calls AS (
  SELECT 'pos' AS n, c.practitioner_id AS prac, c.location_id AS loc, c.room, c.starts_at AS s, c.ends_at AS e
    FROM cls c JOIN pick k ON c.id = k.pos_id
  UNION ALL
  SELECT 'neg', c.practitioner_id, c.location_id, c.room, c.starts_at, c.ends_at
    FROM cls c JOIN pick k ON c.id = k.neg_id
  UNION ALL
  SELECT 'pair', p.practitioner_id, p.location_id, NULL::text,
         least(p.starts_at, n.starts_at), greatest(p.ends_at, n.ends_at)
    FROM pick k JOIN cls p ON p.id = k.pos_id JOIN cls n ON n.id = k.neg_id
   WHERE k.has_pair
  UNION ALL
  SELECT 'ct', c.practitioner_id, c.location_id, c.room, c.starts_at, c.ends_at
    FROM cls c JOIN pick k ON c.id = k.ct_id
  UNION ALL
  SELECT 'sr', c.practitioner_id, c.location_id, c.room, c.starts_at, c.ends_at
    FROM cls c JOIN pick k ON c.id = k.sr_id
)
SELECT (SELECT neg_id FROM pick) AS neg_appt,
       (SELECT pos_id FROM pick) AS pos_appt,
       (SELECT has_pair FROM pick)::text AS has_pair,
       (SELECT count(*) FROM calls)::int AS n_calls,
       (SELECT json_agg(json_build_object('n', n, 'prac', prac, 'loc', loc, 'room', room, 's', s, 'e', e))
          FROM calls)::text AS calls_json
\gset

\if :{?neg_appt}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the chosen actor has no blocking appointment their appointments policies do not return that is not their own work, so N2 has no subject. Nothing was checked. This can only happen for an actor passed with -v actor_id.';
  END $stop$;
\endif
\if :{?pos_appt}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the chosen actor has no blocking appointment at their own clinic for a patient they treated, so N1 has no subject and the negative would be unguarded. Nothing was checked. This can only happen for an actor passed with -v actor_id; the default selector guarantees this one.';
  END $stop$;
\endif

/* THE ARMS THAT READ THE CATALOGUE. No role change needed. */
SELECT (NOT p.prosecdef)::text AS a1_invoker
  FROM pg_proc p
 WHERE p.oid = to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])') \gset
SELECT (p.prosecdef
        AND pg_get_userbyid(p.proowner) = 'postgres'
        AND coalesce('search_path=public' = ANY (p.proconfig), false))::text AS a2_definer
  FROM pg_proc p
 WHERE p.oid = to_regprocedure('public.appointment_conflict_rows(uuid,uuid,text,timestamptz,timestamptz,uuid[])') \gset
SELECT (SELECT string_agg(t.nm, ',' ORDER BY t.ord)
          FROM pg_proc p, unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS t(nm, md, ord)
         WHERE p.oid = to_regprocedure('public.appointment_conflict_rows(uuid,uuid,text,timestamptz,timestamptz,uuid[])')
           AND t.md = 't') AS rows_cols,
       (SELECT string_agg(t.nm, ',' ORDER BY t.ord)
          FROM pg_proc p, unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS t(nm, md, ord)
         WHERE p.oid = to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])')
           AND t.md = 't') AS conflicts_cols \gset
SELECT count(*) FILTER (WHERE r.rolname = 'authenticated' AND has_function_privilege(r.rolname, f.oid, 'EXECUTE'))::int AS exec_auth,
       count(*) FILTER (WHERE r.rolname <> 'authenticated' AND has_function_privilege(r.rolname, f.oid, 'EXECUTE'))::int AS exec_other
  FROM (VALUES (to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])')::oid),
               (to_regprocedure('public.appointment_conflict_rows(uuid,uuid,text,timestamptz,timestamptz,uuid[])')::oid)) AS f(oid)
 CROSS JOIN pg_roles r
 WHERE r.rolname IN ('authenticated', 'anon', 'patient', 'service_role') \gset

/* BECOME THE ACTOR. */
SET LOCAL ROLE authenticated;

SELECT coalesce((SELECT auth.uid())::text, '') AS seen_uid \gset

/* THE SUBJECTS, VERIFIED AS THE ACTOR. pos must be readable WITH its patient's
 * name; neg must not be readable at all. Either failing means the model that
 * chose them is wrong for this actor, which is a STOP and never a verdict. */
SELECT (SELECT count(*) FROM public.appointments WHERE id = :'pos_appt')::int AS sees_pos,
       (SELECT count(*) FROM public.appointments WHERE id = :'neg_appt')::int AS sees_neg,
       ((SELECT p.full_name FROM public.appointments a JOIN public.patients p ON p.id = a.patient_id
          WHERE a.id = :'pos_appt') IS NOT NULL)::text AS pos_name_read \gset

RESET ROLE;
\if :pos_name_read
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the positive subject is not readable with its patient''s name as the actor, so N1 would prove nothing. Nothing was checked. THIS IS ABOUT THIS ACTOR. Re-run with -v actor_id=<another therapist>.';
  END $stop$;
\endif
SELECT (:sees_neg = 0)::text AS neg_unreadable \gset
\if :neg_unreadable
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the negative subject IS readable by the actor, so it is not a negative. Nothing was checked. The appointments policies admit more than this file modelled; read them before anything else.';
  END $stop$;
\endif
SET LOCAL ROLE authenticated;

/* THE CALLS, AS THE ACTOR. Every name comparison is made here and leaves as a
 * count or a boolean. `own_read` and `sr_read` are the actor's own reads: the
 * ruling's answer is computed from them, independently of the function. */
WITH calls AS (
  SELECT * FROM json_to_recordset(:'calls_json'::json)
    AS c(n text, prac uuid, loc uuid, room text, s timestamptz, e timestamptz)
), got AS MATERIALIZED (
  SELECT c.n, f.id, f.patient_name, f.starts_at, f.ends_at, f.room, f.kind
    FROM calls c
   CROSS JOIN LATERAL public.appointment_conflicts(c.prac, c.loc, c.room, c.s, c.e, NULL::uuid[]) f
), raw AS MATERIALIZED (
  SELECT c.n, f.id, f.starts_at, f.ends_at, f.room, f.kind
    FROM calls c
   CROSS JOIN LATERAL public.appointment_conflict_rows(c.prac, c.loc, c.room, c.s, c.e, NULL::uuid[]) f
), srn AS MATERIALIZED (
  /* 0090's names, read ONCE as the actor rather than once per row. */
  SELECT sn.appointment_id, sn.patient_name
    FROM public.shared_resource_appointment_patient_names() sn
), cls AS MATERIALIZED (
  SELECT g.*,
         EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = g.id) AS readable,
         (SELECT p.full_name FROM public.appointments a
            JOIN public.patients p ON p.id = a.patient_id
           WHERE a.id = g.id) AS own_read,
         (SELECT srn.patient_name FROM srn WHERE srn.appointment_id = g.id) AS sr_read
    FROM got g
)
SELECT (SELECT count(*) FROM (SELECT n, id, starts_at, ends_at, room, kind FROM got
                              EXCEPT ALL SELECT n, id, starts_at, ends_at, room, kind FROM raw) x)::int AS s1_extra,
       (SELECT count(*) FROM (SELECT n, id, starts_at, ends_at, room, kind FROM raw
                              EXCEPT ALL SELECT n, id, starts_at, ends_at, room, kind FROM got) x)::int AS s1_missing,
       (SELECT count(*) FROM raw)::int AS raw_rows,
       (SELECT md5(coalesce(string_agg(format('%s|%s|%s|%s|%s|%s', n, id, starts_at, ends_at, room, kind), ';'
                                       ORDER BY n, id, kind), '')) FROM got) AS got_md5,
       count(*)::int                                                     AS got_rows,
       count(*) FILTER (WHERE patient_name IS NOT NULL)::int             AS named,
       count(*) FILTER (WHERE patient_name IS NULL)::int                 AS nulled,
       count(*) FILTER (WHERE NOT readable)::int                         AS unreadable,
       count(*) FILTER (WHERE patient_name IS DISTINCT FROM
                              CASE WHEN readable THEN coalesce(own_read, sr_read) END)::int AS c1_wrong,
       count(*) FILTER (WHERE readable AND own_read IS NULL AND sr_read IS NULL)::int AS d1_total,
       count(*) FILTER (WHERE readable AND own_read IS NULL AND sr_read IS NULL
                          AND patient_name IS NOT NULL)::int                         AS d1_named,
       count(*) FILTER (WHERE readable AND own_read IS NULL AND sr_read IS NOT NULL)::int AS e1_total,
       count(*) FILTER (WHERE readable AND own_read IS NULL AND sr_read IS NOT NULL
                          AND patient_name IS DISTINCT FROM sr_read)::int            AS e1_wrong,
       coalesce(bool_or(n = 'pos' AND id = :'pos_appt'::uuid), false)::text          AS n1_present,
       coalesce(bool_and(patient_name IS NOT NULL AND patient_name = own_read)
                  FILTER (WHERE n = 'pos' AND id = :'pos_appt'::uuid), false)::text  AS n1_named,
       coalesce(bool_or(n = 'neg' AND id = :'neg_appt'::uuid), false)::text          AS n2_present,
       coalesce(bool_and(patient_name IS NULL)
                  FILTER (WHERE n = 'neg' AND id = :'neg_appt'::uuid), false)::text  AS n2_null,
       (coalesce(bool_or(n = 'pair' AND id = :'pos_appt'::uuid), false)
         AND coalesce(bool_or(n = 'pair' AND id = :'neg_appt'::uuid), false))::text AS n3_both,
       coalesce(bool_and(CASE WHEN id = :'pos_appt'::uuid
                              THEN patient_name IS NOT NULL AND patient_name = own_read
                              ELSE patient_name IS NULL END)
                  FILTER (WHERE n = 'pair' AND id IN (:'pos_appt'::uuid, :'neg_appt'::uuid)), false)::text AS n3_right
  FROM cls
\gset

RESET ROLE;

/* S2's comparand: 0059's two arms, written out here and run outside the
 * caller's policies, over the same calls. The claims are still set, so
 * is_unconfirmed_pedido reads the actor's tenant exactly as the function does. */
WITH calls AS (
  SELECT * FROM json_to_recordset(:'calls_json'::json)
    AS c(n text, prac uuid, loc uuid, room text, s timestamptz, e timestamptz)
), ref AS (
  SELECT c.n, a.id, a.starts_at, a.ends_at, a.room, 'therapist'::text AS kind
    FROM calls c
    JOIN public.appointments a ON a.practitioner_id = c.prac
   WHERE a.tenant_id = :'actor_tenant'::uuid
     AND a.status NOT IN ('cancelled', 'no_show')
     AND NOT public.is_unconfirmed_pedido(a.id)
     AND a.starts_at < c.e
     AND a.ends_at > c.s
  UNION ALL
  SELECT c.n, a.id, a.starts_at, a.ends_at, a.room, 'room'::text
    FROM calls c
    JOIN public.appointments a ON a.location_id = c.loc
   WHERE c.room IS NOT NULL
     AND btrim(c.room) <> ''
     AND a.tenant_id = :'actor_tenant'::uuid
     AND a.status NOT IN ('cancelled', 'no_show')
     AND NOT public.is_unconfirmed_pedido(a.id)
     AND a.starts_at < c.e
     AND a.ends_at > c.s
     AND lower(a.room) = lower(btrim(c.room))
)
SELECT count(*)::int AS ref_rows,
       md5(coalesce(string_agg(format('%s|%s|%s|%s|%s|%s', n, id, starts_at, ends_at, room, kind), ';'
                               ORDER BY n, id, kind), '')) AS ref_md5
  FROM ref \gset

WITH r(n, "check", observed, expected, verdict) AS (VALUES
  (0, '0. this transaction is READ ONLY and REPEATABLE READ',
      current_setting('transaction_read_only') || ' / ' || current_setting('transaction_isolation'),
      'on / repeatable read',
      CASE WHEN current_setting('transaction_read_only') = 'on'
            AND current_setting('transaction_isolation') = 'repeatable read' THEN 'OK' ELSE 'FAIL' END),
  (1, 'L1. INSTRUMENT: the session IS the chosen actor',
      CASE WHEN :'seen_uid' = :'actor_id' THEN 'auth.uid() is the chosen actor' ELSE 'auth.uid() is SOMEBODY ELSE' END,
      'the chosen actor',
      CASE WHEN :'seen_uid' = :'actor_id' THEN 'OK' ELSE 'FAIL' END),
  (2, 'A1. appointment_conflicts is SECURITY INVOKER',
      CASE WHEN :'a1_invoker' = 'true' THEN 'invoker' ELSE 'definer' END, 'invoker',
      CASE WHEN :'a1_invoker' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (3, 'A2. appointment_conflict_rows is SECURITY DEFINER, owned by postgres, search_path public',
      :'a2_definer', 'true',
      CASE WHEN :'a2_definer' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (4, 'A3. the rows function has no name column; appointment_conflicts keeps its return type',
      :'rows_cols' || ' / ' || :'conflicts_cols',
      'id,starts_at,ends_at,room,kind / id,patient_name,starts_at,ends_at,room,kind',
      CASE WHEN :'rows_cols' = 'id,starts_at,ends_at,room,kind'
            AND :'conflicts_cols' = 'id,patient_name,starts_at,ends_at,room,kind' THEN 'OK' ELSE 'FAIL' END),
  (5, 'A4. EXECUTE: authenticated on both; anon, patient, service_role on neither',
      'authenticated ' || :'exec_auth' || ' of 2, others ' || :'exec_other' || ' of 6',
      'authenticated 2 of 2, others 0 of 6',
      CASE WHEN :exec_auth = 2 AND :exec_other = 0 THEN 'OK' ELSE 'FAIL' END),
  (6, 'S1. SET: the actor''s appointment_conflicts rows equal appointment_conflict_rows, every call',
      :'got_rows' || ' rows over ' || :'n_calls' || ' calls, ' || :'s1_extra' || ' extra, ' || :'s1_missing' || ' missing',
      :'raw_rows' || ' rows, 0 extra, 0 missing',
      CASE WHEN :s1_extra <> 0 OR :s1_missing <> 0 OR :got_rows <> :raw_rows THEN 'FAIL'
           WHEN :raw_rows = 0 THEN 'VACUOUS' ELSE 'OK' END),
  (7, 'S2. SET: the same rows as 0059''s predicate written out, outside the caller''s policies',
      :'got_rows' || ' rows, ' || CASE WHEN :'got_md5' = :'ref_md5' THEN 'same multiset' ELSE 'DIFFERENT multiset' END,
      :'ref_rows' || ' rows, same multiset',
      CASE WHEN :got_rows <> :ref_rows OR :'got_md5' <> :'ref_md5' THEN 'FAIL'
           WHEN :ref_rows = 0 THEN 'VACUOUS' ELSE 'OK' END),
  (8, 'N1. CONTROL: a row at the actor''s own clinic carries the name the actor reads through patients',
      CASE WHEN :'n1_present' <> 'true' THEN 'row NOT returned'
           WHEN :'n1_named' = 'true' THEN 'returned, named, same name' ELSE 'returned, name NULL or different' END,
      'returned, named, same name',
      CASE WHEN :'n1_present' = 'true' AND :'n1_named' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (9, 'N2. NEGATIVE: a row the actor''s appointments policies do not return comes back with a NULL name',
      CASE WHEN :'n2_present' <> 'true' THEN 'row NOT returned'
           WHEN :'n2_null' = 'true' THEN 'returned, name NULL' ELSE 'returned, NAMED' END,
      'returned, name NULL',
      CASE WHEN :'n2_present' = 'true' AND :'n2_null' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (10, 'N3. ONE CALL, same practitioner: the row the actor reads is named, the row it does not is NULL',
      CASE WHEN :'has_pair' <> 'true' THEN 'no practitioner furnishes a pair'
           WHEN :'n3_both' <> 'true' THEN 'a row NOT returned'
           WHEN :'n3_right' = 'true' THEN 'both returned, named / NULL' ELSE 'both returned, WRONG names' END,
      'both returned, named / NULL',
      CASE WHEN :'has_pair' <> 'true' THEN 'VACUOUS'
           WHEN :'n3_both' = 'true' AND :'n3_right' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (11, 'C1. EVERY ROW: the name is the ruling''s answer from the actor''s own reads',
      :'named' || ' named, ' || :'nulled' || ' NULL (' || :'unreadable' || ' not readable), ' || :'c1_wrong' || ' wrong',
      '0 wrong',
      CASE WHEN :c1_wrong <> 0 THEN 'FAIL'
           WHEN :got_rows = 0 THEN 'VACUOUS' ELSE 'OK' END),
  (12, 'D1. ON PURPOSE: readable row, patient not read by patients nor 0090, gets NULL',
      :'d1_named' || ' named of ' || :'d1_total' || ' such rows', '0 named',
      CASE WHEN :d1_named <> 0 THEN 'FAIL'
           WHEN :d1_total = 0 THEN 'VACUOUS' ELSE 'OK' END),
  (13, 'E1. SHARED RESOURCE: readable row, patient not read by patients, carries 0090''s name',
      :'e1_wrong' || ' wrong of ' || :'e1_total' || ' such rows', '0 wrong',
      CASE WHEN :e1_wrong <> 0 THEN 'FAIL'
           WHEN :e1_total = 0 THEN 'VACUOUS' ELSE 'OK' END)
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
