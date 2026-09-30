-- CARE-02a (0096 v2) BEHAVIOUR CHECK. READ ONLY. Run BEFORE and AFTER 0096 is applied.
--
-- 0096 lets a therapist on a patient's live care team read that patient's
-- ficha (patients) and registos (clinical_records) ONLY WHEN THE PATIENT IS
-- LINKED TO ONE OF THE THERAPIST'S OWN CLINICS (the owner's ruling of
-- 2026-09-27, "limit to their clinic only"), lets a therapist write their own
-- booking's care-team row, and lets a therapist read the care teams they are on
-- at their own clinics, plus their own rows. This file proves what real staff
-- sessions can READ and may WRITE on the database it is run against, by
-- impersonation (flat claims tenant_id, user_role, sub, then SET LOCAL ROLE
-- authenticated), inside ONE READ ONLY REPEATABLE READ transaction.
--
-- "LINKED" IS 0045's ADMIN BASIS, read from the tables here: an appointment of
-- the patient (first slot, patient_id) at a location the actor has a
-- staff_locations row for; or, ONLY when the patient has no appointment with a
-- location, the patient's primary_location_id is such a location. Arm I1 proves
-- this file's reading of it agrees with 0045's own clinical_admin_sees_patient
-- called as each actor, and arm H1 proves 0096's helper agrees with both.
--
-- ===========================================================================
-- THE ACTORS AND THE PATIENT ARE PASSED, NEVER PICKED
-- ===========================================================================
--   psql "$DB" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v patient_id=<P> -v t1_id=<T1> -v t2_id=<T2> -v t3_id=<T3>
--        -v t4_id=<T4 or none> -v n_id=<N or none>
--        -f scripts/db/behaviour-care02a-readonly.sql
--   T1  ASSIGNED ONLY, AT P's CLINIC: a therapist on P's live care team, linked
--       to P, with no appointment with P, who did not create P. The subject.
--   T2  TREATING: a therapist with an appointment with P who authored at least
--       one of P's registos. The positive control.
--   T3  NOT ASSIGNED: a therapist not on P's live team, with no appointment with
--       P, who did not create P and authored none of P's registos. The negative.
--   T4  ASSIGNED ONLY, AT ANOTHER CLINIC: a therapist on P's live care team who
--       is NOT linked to P (installed only at clinics P has no link to), with no
--       appointment with P, who did not create P and authored none of P's
--       registos. THE CLINIC LIMIT'S OWN ARM: reads 0 of P, 0 registos, and of
--       P's team only its own row.
--   N   A NON-THERAPIST ON THE TEAM: an active ADMIN or RECEPTION user on P's
--       live team and linked to P, so 0096's helper DOES name P for them. The
--       care-team term sits inside the therapist role guard, so N must read
--       exactly what its own role's arm admits and not one row more (arm N1).
--       Which role N has decides what N1 can catch: a RECEPTION N reads no
--       registo of P by its own arm, so it catches the care-team term leaking
--       out of the guard on clinical_records_select; an ADMIN N reads no
--       care-team row by its own arm, so it catches the same leak on
--       patient_care_team_select (the care-team term or the own-row term). On
--       patients_select no role can catch it: for an admin or a receptionist
--       linked to P, patients_select's own location arm already admits P
--       (viewer_visible_patient_ids is a superset of 0045's basis), and the
--       owner reads everything. That leak is caught by the post-check's md5.
-- T4 AND N MAY BE PASSED AS THE WORD none (-v t4_id=none, -v n_id=none), for a
-- database that holds no such person. Their arms then read VACUOUS, never OK,
-- and the SUMMARY row says so; the caller asserts the profile it expects.
-- Leaving either variable OUT is a STOP, like the other four: "not passed" has
-- to be typed.
-- On a rehearsal they are the SYNTHETIC principals the rehearsal fixture loads;
-- this file creates nobody, and cannot, because the transaction is READ ONLY.
-- On production they are real staff ids the apply document names. Every id is
-- verified against the tables here; an actor that is not what its slot says is
-- a MISSING SUBJECT, and a missing subject is a FAIL (arms S0 to S5) that turns
-- every later arm to FAIL, never a pass and never a silent skip.
--
-- IT MUST BE RUN FROM A FILE (-f). It reads ITSELF with \ir, once per actor, so
-- that one ACTOR line and one set of measurements serve every actor
-- (scripts/behaviour-checks-print-actor.test.mjs requires exactly one ACTOR line
-- per file). The variable c02a_pass says which half is running; do not pass it.
--
-- IT RUNS ON A DATABASE WITHOUT 0096 TOO. 0096 creates
-- viewer_care_team_patient_ids_at_my_clinics(); this file asks to_regprocedure
-- for it and calls it only when it exists, so the BEFORE run measures instead of
-- dying with 42883. Arm H1 reads FAIL while it is absent.
--
-- ===========================================================================
-- HOW A READ ONLY FILE MEASURES WRITES
-- ===========================================================================
-- It cannot run an UPDATE, not even inside a savepoint that is rolled back: in
-- a READ ONLY transaction the server refuses the statement before it reads a
-- row. So, as 0094's behaviour check does, it reads from pg_policy the
-- expression Postgres applies to a command for `authenticated` (every
-- PERMISSIVE policy OR'ed, every RESTRICTIVE one AND'ed, FOR ALL included; an
-- INSERT uses WITH CHECK) and evaluates it WITH THE ACTOR'S CLAIMS SET, OUTSIDE
-- row level security (row_security off, so a connection that does not bypass
-- it STOPs with an error rather than reading a filtered count), over the
-- subject rows, and over CANDIDATE NEW ROWS for an INSERT. Every zero a write
-- arm asserts has a control in the same run that must read 1 through the same
-- machinery (W2, W4's T2, W5's T2), so a broken instrument reads FAIL, not OK.
-- The in-action proof (T1's UPDATE of T2's registo touching 0 rows inside a
-- rolled-back savepoint, and a therapist's own booking row written through
-- ON CONFLICT ... RETURNING) is the rehearsal's, on a throwaway.
--
-- ===========================================================================
-- THE VERDICT CONTRACT. THREE VALUES, AND A PROFILE.
-- ===========================================================================
-- Every arm prints OK, VACUOUS or FAIL, and the last row prints
--     N OK / M VACUOUS / K FAIL
-- A population that is empty reads VACUOUS, never OK. A missing subject is a
-- FAIL. A zero that another arm's control would green is a FAIL: every negative
-- arm names its control and reads FAIL when that control is not met. Arms S0 to
-- S5 and I1 are the subjects and the instrument; every arm after them reads
-- FAIL when any of those is not OK (an S4 or S5 that reads VACUOUS because the
-- slot was passed as none does not count against the others).
--
-- THE PROFILES, measured on the v2 rehearsal fixture (one tenant, two clinics;
-- T1, T2, T3 at P's clinic, T4 at the other; N a receptionist at P's clinic):
--   WITH 0096 applied:     32 OK / 0 VACUOUS / 0 FAIL.
--   WITHOUT 0096:          17 OK / 0 VACUOUS / 15 FAIL, failing on
--                          H1 P1 P4 P5 R1 R4 C1 C2 C3 C4 C5 N1 W5 W6 W8.
--   WITH v1 OF 0096 (no clinic limit, never applied outside a throwaway):
--                          26 OK / 0 VACUOUS / 6 FAIL, failing on
--                          H1 P4 P5 R4 C4 C5.
-- With -v t4_id=none the four T4 arms (S4 P5 R4 C5) read VACUOUS; with
-- -v n_id=none the two N arms (S5 N1) do. On production, C2 reads VACUOUS when
-- T2 is not on P's live team (its expected read of P's team is then only T2's
-- own rows of P, often none). The apply document states the profile it
-- expects, and why.
--
-- THE ARMS
--   0   the transaction is READ ONLY and REPEATABLE READ.
--   S0  the subjects exist: P is a live (not soft-deleted) patient, a registo
--       of P authored by T2 exists (the write subject, chosen, never printed),
--       and the actor ids passed are distinct.
--   S1  T1 is an active therapist of P's tenant, on P's live team, linked to P,
--       with no appointment with P, and did not create P.
--   S2  T2 is an active therapist of P's tenant with an appointment with P.
--   S3  T3 is an active therapist of P's tenant, not on P's live team, with no
--       appointment with P, did not create P and authored no registo of P.
--   S4  T4 is an active therapist of P's tenant, on P's live team, NOT linked
--       to P, with no appointment with P, did not create P and authored no
--       registo of P. VACUOUS when passed as none.
--   S5  N is an active admin or receptionist of P's tenant (not a shared
--       resource), on P's live team and linked to P. VACUOUS when none.
--   I1  THE INSTRUMENT: for each actor, auth.uid() is the actor; the two 0091
--       and 0074 helpers the policies call place P exactly as the tables do
--       (viewer_care_team_patient_ids: on the live team;
--       viewer_treated_patient_ids: an appointment); and 0045's
--       clinical_admin_sees_patient(P), called as the actor, agrees with this
--       file's reading of "linked". Calling them as the actor also proves
--       `authenticated` holds EXECUTE.
--   H1  0096's HELPER: viewer_care_team_patient_ids_at_my_clinics() exists,
--       and for each actor it names P exactly when the actor is on P's live
--       team AND linked to P. FAIL while it is absent (before 0096).
--   P1  patients, T1: reads P. 0 WITHOUT 0096: this is the ficha.
--   P2  patients, T2: reads P. The control for P3.
--   P3  patients, T3: does not read P.
--   P4  patients, every therapist actor: reads EXACTLY its tenant's patients
--       that it created, treated, or is on the live team of AND linked to; no
--       row more, no row fewer. The comparand is built from the tables, not
--       from the helpers.
--   P5  patients, T4: does not read P. THE CLINIC LIMIT. Control P1.
--   R1  registos, T1: reads T2's registo and every registo of P.
--   R2  registos, T2: the same. The control for R3.
--   R3  registos, T3: reads none of P's registos.
--   R4  registos, T4: reads none of P's registos. THE CLINIC LIMIT. Control R1.
--   C1  care team, T1: reads every row of P's team (a team it is on, at its
--       clinic).
--   C2  care team, T2: reads every row of P's team when on it and linked, else
--       only its own rows of P. VACUOUS when that expectation is empty.
--   C3  care team, T3: reads only its own rows of P (none, unless it holds a
--       removed row there). The control is C1.
--   C4  care team, every therapist actor: reads EXACTLY the rows of its tenant
--       that are its own or belong to a patient whose live team it is on AND
--       that it is linked to.
--   C5  care team, T4: of P's team, reads its own rows and NONE of the other
--       members'. THE CLINIC LIMIT (the own-row term stays, section 5 (a) of
--       the migration). Control C1.
--   N1  N reads, of P, P's registos and P's team, exactly what its OWN role's
--       arm admits: an admin reads no care-team row, a receptionist reads no
--       registo, whatever 0096's helper says about them. Control: the helper
--       term is live for a therapist (R1 for a receptionist, C1 for an admin).
--   W1  registos, T1 writes NOTHING of T2's: UPDATE 0, DELETE 0, and an INSERT
--       of that registo's row (T2's authorship, for P) is refused. 0096 adds a
--       SELECT arm only; clinical_therapist_sees_patient is not widened.
--   W2  CONTROL for W1 and W3: T2 is admitted by the same three expressions for
--       its own registo: 1, 1, 1.
--   W3  registos, T3 and T4 write nothing of T2's: 0, 0, 0 each.
--   W4  patients UPDATE and DELETE of P: T1 0 and 0, T2 1 and 1 (its control),
--       T3 0 and 0, T4 0 and 0. 0096 does not touch either policy.
--   W5  care team, own row for P in the writer's shape: the INSERT check, and
--       the SELECT policy on the new row (the writer uses ON CONFLICT and
--       RETURNING, which apply it). T1, T3 and T4 refused (none treats P), T2
--       admitted by both. 0 for T2 WITHOUT 0096.
--   W6  care team, every therapist actor: a row for ANOTHER user, and its own
--       row under a tenant id no tenant has, are both refused. The control is
--       W5's T2.
--   W7  care team UPDATE of P's rows: 0 for every therapist. The update policy
--       is unchanged: owner and reception only.
--   W8  care team, an OWN row for P whose assigned_by is NOT the actor (another
--       user, or NULL) is refused for every therapist actor, T2 included, who
--       treats P and is admitted for the same row naming itself (W5). v1's
--       behaviour check had no such arm, and a mutation dropping
--       `assigned_by = auth.uid()` survived it.
--
-- WHAT NO ARM HERE MEASURES, stated so a green run is not read as covering it:
--   * The SELECT policy's own-row term (user_id = auth.uid()) as the thing that
--     lets a therapist's FIRST booking row through: on data where T2 is already
--     on P's team, W5's SELECT half is admitted by the team term as well. The
--     rehearsal proves the term in action (a therapist not on the team books P
--     and writes its row; with the term removed the same write is refused).
--   * The other tables (attachments, clinical_episodes, appointment_notes,
--     patient_note_revisions, guest_clinical_intakes): 0096 does not touch
--     them, and the pre-check and post-check pin their thirteen policies.
--   * The care-team term leaking out of the therapist guard on patients_select:
--     no staff role can see it (see N above); the post-check's md5 does.
--   * A patient linked to the actor's clinic only as the SECOND participant of
--     an appointment: 0096 does not count that link, by design (migration
--     section 2), and no subject here needs it.
--
-- IT PRINTS ONE ACTOR LINE PER ACTOR, THEN COUNTS AND VERDICTS, AND NOTHING
-- ELSE. No name, no contact detail, no patient id and no registo id reaches the
-- transcript: every subject is chosen into a psql variable and used, never
-- echoed. Each ACTOR line reads
--     ACTOR id <uuid> | role <slug> | chosen passed in with -v <slot>_id
-- once per actor, before any verdict row, so whoever reads the transcript can
-- tell by comparing ids which accounts the run acted as. It is a staff id,
-- never a name. A slot passed as none prints no ACTOR line.

\set ON_ERROR_STOP on

-- ===========================================================================
-- DRIVER, FIRST HALF: inputs, the transaction, the shared subjects and the
-- write expressions, then one pass per actor (this same file, below).
-- ===========================================================================
\if :{?c02a_pass}
\else
\pset pager off
\timing off

\if :{?patient_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: pass the patient with -v patient_id=<P>. Nothing was checked.';
  END $stop$;
\endif
\if :{?t1_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: pass the assigned-only therapist at P''s clinic with -v t1_id=<T1>. Nothing was checked.';
  END $stop$;
\endif
\if :{?t2_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: pass the treating therapist with -v t2_id=<T2>. Nothing was checked.';
  END $stop$;
\endif
\if :{?t3_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: pass the unassigned therapist with -v t3_id=<T3>. Nothing was checked.';
  END $stop$;
\endif
\if :{?t4_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: pass the assigned therapist at another clinic with -v t4_id=<T4>, or -v t4_id=none. Nothing was checked.';
  END $stop$;
\endif
\if :{?n_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: pass the non-therapist on P''s team with -v n_id=<N>, or -v n_id=none. Nothing was checked.';
  END $stop$;
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo ''
\echo '=== CARE-02a (0096 v2) BEHAVIOUR CHECK. READ ONLY. 32 arms, up to five actors, profile printed last ==='

-- Every read outside the actors' sessions is unfiltered, or it ERRORs: a
-- connection subject to row level security STOPs here rather than reading a
-- filtered comparand.
SET LOCAL row_security = off;

-- A tenant id no tenant has, for W6's phantom row and for a missing patient.
\set nil_id 00000000-0000-0000-0000-000000000000
SELECT (NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = :'nil_id'::uuid))::text AS nil_is_free \gset
\if :nil_is_free
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: a tenant has the id this file uses for a tenant that does not exist. Nothing was checked.';
  END $stop$;
\endif

-- THE TWO OPTIONAL SLOTS. The word none, typed, and nothing else, skips one.
SELECT (lower(:'t4_id') = 'none')::text AS t4_none,
       (lower(:'n_id') = 'none')::text AS n_none \gset

-- THE PATIENT. Normalised from the table; a missing or soft-deleted patient is
-- S0's FAIL, and the run goes on under the nil tenant so a profile is printed.
SELECT (SELECT p.id::text FROM public.patients p WHERE p.id = :'patient_id'::uuid AND p.deleted_at IS NULL) AS patient_checked,
       (SELECT p.tenant_id::text FROM public.patients p WHERE p.id = :'patient_id'::uuid AND p.deleted_at IS NULL) AS tenant_checked \gset
\if :{?patient_checked}
\set patient_ok true
\set patient_id :patient_checked
\set tenant :tenant_checked
\else
\set patient_ok false
\set tenant :nil_id
\endif

-- THE WRITE SUBJECT: one registo of P authored by T2, chosen, never printed.
SELECT (SELECT c.id::text FROM public.clinical_records c
         WHERE c.tenant_id = :'tenant'::uuid AND c.patient_id = :'patient_id'::uuid
           AND c.practitioner_id = :'t2_id'::uuid
         ORDER BY c.id LIMIT 1) AS reg_checked \gset
\if :{?reg_checked}
\set reg_ok true
\set reg_id :reg_checked
\else
\set reg_ok false
\set reg_id :nil_id
\endif

-- DISTINCT over the ids actually passed (a slot passed as none is left out).
SELECT (count(DISTINCT lower(x)) = count(*))::text AS distinct_ok
  FROM unnest(ARRAY[:'t1_id', :'t2_id', :'t3_id', :'t4_id', :'n_id']) AS x
 WHERE lower(x) <> 'none' \gset
SELECT (SELECT count(*)::int FROM public.clinical_records c
         WHERE c.tenant_id = :'tenant'::uuid AND c.patient_id = :'patient_id'::uuid) AS rec_total,
       (SELECT count(*)::int FROM public.patient_care_team ct
         WHERE ct.tenant_id = :'tenant'::uuid AND ct.patient_id = :'patient_id'::uuid) AS team_total \gset

-- IS 0096's HELPER HERE? Asked, never assumed: a call to a function that does
-- not exist raises 42883 and would end the BEFORE run.
SELECT (to_regprocedure('public.viewer_care_team_patient_ids_at_my_clinics()') IS NOT NULL)::text AS clinic_helper \gset

-- THE EFFECTIVE EXPRESSIONS, read from the catalogue: for each table and
-- command, every PERMISSIVE policy that applies to authenticated (or PUBLIC)
-- OR'ed, AND every RESTRICTIVE one. No policy at all reads `false`, which is
-- what row level security does with a command nobody is permitted.
WITH p AS (
  SELECT c.relname AS tbl, pol.polcmd::text AS cmd, pol.polpermissive AS perm,
         pg_get_expr(pol.polqual, pol.polrelid) AS q,
         pg_get_expr(coalesce(pol.polwithcheck, pol.polqual), pol.polrelid) AS wc
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('patients', 'clinical_records', 'patient_care_team')
     AND (0::oid = ANY (pol.polroles) OR 'authenticated'::regrole::oid = ANY (pol.polroles))
), k(tbl, cmd, use_check) AS (
  VALUES ('clinical_records', 'w', false), ('clinical_records', 'd', false), ('clinical_records', 'a', true),
         ('patients', 'w', false), ('patients', 'd', false),
         ('patient_care_team', 'a', true), ('patient_care_team', 'r', false), ('patient_care_team', 'w', false)
), e AS (
  SELECT k.tbl, k.cmd,
         '(' || coalesce((SELECT string_agg('(' || x.expr || ')', ' OR ' ORDER BY x.expr)
                            FROM (SELECT CASE WHEN k.use_check THEN p.wc ELSE p.q END AS expr, p.perm
                                    FROM p WHERE p.tbl = k.tbl AND p.cmd IN (k.cmd, '*')) x
                           WHERE x.perm AND x.expr IS NOT NULL), 'false')
      || ') AND (' ||
         coalesce((SELECT string_agg('(' || x.expr || ')', ' AND ' ORDER BY x.expr)
                     FROM (SELECT CASE WHEN k.use_check THEN p.wc ELSE p.q END AS expr, p.perm
                             FROM p WHERE p.tbl = k.tbl AND p.cmd IN (k.cmd, '*')) x
                    WHERE NOT x.perm AND x.expr IS NOT NULL), 'true')
      || ')' AS expr
    FROM k
)
SELECT max(expr) FILTER (WHERE tbl = 'clinical_records'  AND cmd = 'w') AS e_rec_upd,
       max(expr) FILTER (WHERE tbl = 'clinical_records'  AND cmd = 'd') AS e_rec_del,
       max(expr) FILTER (WHERE tbl = 'clinical_records'  AND cmd = 'a') AS e_rec_ins,
       max(expr) FILTER (WHERE tbl = 'patients'          AND cmd = 'w') AS e_pat_upd,
       max(expr) FILTER (WHERE tbl = 'patients'          AND cmd = 'd') AS e_pat_del,
       max(expr) FILTER (WHERE tbl = 'patient_care_team' AND cmd = 'a') AS e_pct_ins,
       max(expr) FILTER (WHERE tbl = 'patient_care_team' AND cmd = 'r') AS e_pct_sel,
       max(expr) FILTER (WHERE tbl = 'patient_care_team' AND cmd = 'w') AS e_pct_upd
  FROM e \gset

-- ONE PASS PER ACTOR. Each sets the slot's prefix, the raw id, the id of the
-- OTHER user its W6 and W8 candidates name, and how the actor was chosen, then
-- reads this file again with c02a_pass set. A slot passed as none gets its
-- measurements as fixed zeros instead (the defaults block below), which no
-- verdict reads as OK.
\set c02a_pass on

\set c02a_slot t1_
\set actor_raw :t1_id
\set other_raw :t2_id
\set actor_source 'passed in with -v t1_id'
\ir behaviour-care02a-readonly.sql

\set c02a_slot t2_
\set actor_raw :t2_id
\set other_raw :t3_id
\set actor_source 'passed in with -v t2_id'
\ir behaviour-care02a-readonly.sql

\set c02a_slot t3_
\set actor_raw :t3_id
\set other_raw :t1_id
\set actor_source 'passed in with -v t3_id'
\ir behaviour-care02a-readonly.sql

\set c02a_slot t4_
\if :t4_none
\set c02a_skip on
\ir behaviour-care02a-readonly.sql
\unset c02a_skip
\else
\set actor_raw :t4_id
\set other_raw :t1_id
\set actor_source 'passed in with -v t4_id'
\ir behaviour-care02a-readonly.sql
\endif

\set c02a_slot n_
\if :n_none
\set c02a_skip on
\ir behaviour-care02a-readonly.sql
\unset c02a_skip
\else
\set actor_raw :n_id
\set other_raw :t2_id
\set actor_source 'passed in with -v n_id'
\ir behaviour-care02a-readonly.sql
\endif

\unset c02a_pass
\endif

-- ===========================================================================
-- A SKIPPED SLOT. Runs only when the driver reads this file for a slot passed
-- as none: every measurement the verdicts read, as a fixed value under the
-- slot's prefix. Its S arm reads VACUOUS; the multi-actor arms read these
-- zeros as "refused" and "nothing read", which is what an absent actor does.
-- ===========================================================================
\if :{?c02a_skip}
SELECT 'false' AS is_ther, 'false' AS is_staff_nt, 'false' AS on_team, 'false' AS treats,
       'false' AS created_p, 0 AS authored_p, 'false' AS linked, 'none' AS role_now,
       0 AS pat_all_exp, 0 AS rec_p_exp, 0 AS pct_p_exp, 0 AS pct_all_exp, 0 AS pct_p_own,
       0 AS pat_role_exp, 0 AS rec_role_exp, 0 AS pct_role_exp,
       'true' AS uid_ok, 'false' AS h_care, 'false' AS h_treat, 'false' AS adm_basis, 'false' AS h_clinic,
       0 AS pat_read, 0 AS pat_all_read, 0 AS rec_read, 0 AS rec_p_read,
       0 AS pct_p_read, 0 AS pct_all_read, 0 AS pct_p_others_read,
       0 AS w_rec_u, 0 AS w_rec_d, 0 AS w_rec_i, 0 AS w_pat_u, 0 AS w_pat_d, 0 AS w_pct_u,
       0 AS w_pct_own, 0 AS w_pct_own_sel, 0 AS w_pct_other, 0 AS w_pct_phantom,
       0 AS w_pct_by_other, 0 AS w_pct_by_null
\gset :c02a_slot
\elif :{?c02a_pass}

-- ===========================================================================
-- ONE ACTOR'S PASS. Runs only when this file is read by the driver above.
-- Every measurement is stored under the slot's prefix (t1_ to t4_, or n_).
-- ===========================================================================

-- THE ACTOR. Normalised from the table where it exists, so an upper-case uuid
-- cannot trip the identity STOP; an id that is no staff user is S1 to S5's FAIL.
SELECT coalesce((SELECT u.id::text FROM public.users u WHERE u.id = :'actor_raw'::uuid),
                lower(:'actor_raw')) AS actor_checked \gset
\set actor_id :actor_checked
SELECT coalesce((SELECT r.slug FROM public.users u JOIN public.roles r ON r.id = u.role_id
                  WHERE u.id = :'actor_id'::uuid), 'NO ROLE') AS actor_role \gset

-- THE ACTOR LINE. The id is the normalised one above and the role is the slug
-- just read, which is also the role the claims below carry.
\echo 'ACTOR id' :actor_id '| role' :actor_role '| chosen' :actor_source

-- THE FACTS, outside row level security, from the tables themselves. `linked`
-- is 0045's admin basis for P and this actor, written against the tables. The
-- last three columns are what N's OWN role's arm admits of P, its registos and
-- its team (patients_select's admin and reception arm reads 0073's set: no
-- location assignment at all, or P reached by the actor's clinics in either
-- slot of an appointment or by its primary location), with no care-team term.
WITH my_locs AS (
  SELECT sl.location_id FROM public.staff_locations sl
   WHERE sl.tenant_id = :'tenant'::uuid AND sl.user_id = :'actor_id'::uuid
), f AS (
  SELECT
    EXISTS (SELECT 1 FROM public.users u JOIN public.roles r ON r.id = u.role_id AND r.slug = 'therapist'
             WHERE u.id = :'actor_id'::uuid AND u.tenant_id = :'tenant'::uuid
               AND u.is_active AND NOT u.is_shared_resource) AS is_ther,
    EXISTS (SELECT 1 FROM public.users u JOIN public.roles r ON r.id = u.role_id AND r.slug IN ('admin', 'reception')
             WHERE u.id = :'actor_id'::uuid AND u.tenant_id = :'tenant'::uuid
               AND u.is_active AND NOT u.is_shared_resource) AS is_staff_nt,
    EXISTS (SELECT 1 FROM public.patient_care_team ct
             WHERE ct.tenant_id = :'tenant'::uuid AND ct.patient_id = :'patient_id'::uuid
               AND ct.user_id = :'actor_id'::uuid AND ct.removed_at IS NULL) AS on_team,
    EXISTS (SELECT 1 FROM public.appointments a
             WHERE a.tenant_id = :'tenant'::uuid
               AND (a.patient_id = :'patient_id'::uuid OR a.patient_2_id = :'patient_id'::uuid)
               AND (a.practitioner_id = :'actor_id'::uuid OR a.practitioner_2_id = :'actor_id'::uuid)) AS treats,
    EXISTS (SELECT 1 FROM public.patients p
             WHERE p.id = :'patient_id'::uuid AND p.created_by = :'actor_id'::uuid) AS created_p,
    (SELECT count(*)::int FROM public.clinical_records c
      WHERE c.tenant_id = :'tenant'::uuid AND c.patient_id = :'patient_id'::uuid
        AND c.practitioner_id = :'actor_id'::uuid) AS authored_p,
    (EXISTS (SELECT 1 FROM public.appointments a
              WHERE a.tenant_id = :'tenant'::uuid AND a.patient_id = :'patient_id'::uuid
                AND a.location_id IN (SELECT location_id FROM my_locs))
     OR (NOT EXISTS (SELECT 1 FROM public.appointments a2
                      WHERE a2.tenant_id = :'tenant'::uuid AND a2.patient_id = :'patient_id'::uuid
                        AND a2.location_id IS NOT NULL)
         AND EXISTS (SELECT 1 FROM public.patients p
                      WHERE p.tenant_id = :'tenant'::uuid AND p.id = :'patient_id'::uuid
                        AND p.primary_location_id IN (SELECT location_id FROM my_locs)))) AS linked,
    (NOT EXISTS (SELECT 1 FROM my_locs)
     OR EXISTS (SELECT 1 FROM public.appointments a
                 WHERE a.tenant_id = :'tenant'::uuid
                   AND (a.patient_id = :'patient_id'::uuid OR a.patient_2_id = :'patient_id'::uuid)
                   AND a.location_id IN (SELECT location_id FROM my_locs))
     OR EXISTS (SELECT 1 FROM public.patients p
                 WHERE p.tenant_id = :'tenant'::uuid AND p.id = :'patient_id'::uuid
                   AND p.primary_location_id IN (SELECT location_id FROM my_locs))) AS p_visible
)
SELECT is_ther::text AS is_ther, is_staff_nt::text AS is_staff_nt, on_team::text AS on_team,
       treats::text AS treats, created_p::text AS created_p, authored_p, linked::text AS linked,
       :'actor_role' AS role_now,
       CASE WHEN :'actor_role' = 'owner' THEN 1
            WHEN :'actor_role' IN ('admin', 'reception') THEN (created_p OR p_visible)::int
            ELSE created_p::int END AS pat_role_exp,
       CASE WHEN :'actor_role' = 'owner' THEN :rec_total
            WHEN :'actor_role' = 'admin' AND linked THEN :rec_total
            ELSE 0 END AS rec_role_exp,
       CASE WHEN :'actor_role' IN ('owner', 'reception') THEN :team_total ELSE 0 END AS pct_role_exp
  FROM f
\gset :c02a_slot

-- THE COMPARANDS, outside row level security, from the ruled rule written
-- against the tables and NOT through the helpers: a therapist reads the
-- patients it created, treated (either slot of an appointment where it holds
-- either practitioner slot) or is on the live team of AND linked to; the
-- registos of those patients and its own; the care-team rows that are its own
-- or belong to a patient whose live team it is on and is linked to.
WITH my_locs AS (
  SELECT sl.location_id FROM public.staff_locations sl
   WHERE sl.tenant_id = :'tenant'::uuid AND sl.user_id = :'actor_id'::uuid
), teams AS (
  SELECT ct.patient_id FROM public.patient_care_team ct
   WHERE ct.tenant_id = :'tenant'::uuid AND ct.user_id = :'actor_id'::uuid AND ct.removed_at IS NULL
), teams_here AS (
  SELECT t.patient_id FROM teams t
   WHERE EXISTS (SELECT 1 FROM public.appointments a
                  WHERE a.tenant_id = :'tenant'::uuid AND a.patient_id = t.patient_id
                    AND a.location_id IN (SELECT location_id FROM my_locs))
      OR (NOT EXISTS (SELECT 1 FROM public.appointments a2
                       WHERE a2.tenant_id = :'tenant'::uuid AND a2.patient_id = t.patient_id
                         AND a2.location_id IS NOT NULL)
          AND EXISTS (SELECT 1 FROM public.patients p
                       WHERE p.tenant_id = :'tenant'::uuid AND p.id = t.patient_id
                         AND p.primary_location_id IN (SELECT location_id FROM my_locs)))
), mine AS (
  SELECT p.id FROM public.patients p
   WHERE p.tenant_id = :'tenant'::uuid AND p.created_by = :'actor_id'::uuid
  UNION
  SELECT a.patient_id FROM public.appointments a
   WHERE a.tenant_id = :'tenant'::uuid
     AND (a.practitioner_id = :'actor_id'::uuid OR a.practitioner_2_id = :'actor_id'::uuid)
  UNION
  SELECT a.patient_2_id FROM public.appointments a
   WHERE a.tenant_id = :'tenant'::uuid
     AND (a.practitioner_id = :'actor_id'::uuid OR a.practitioner_2_id = :'actor_id'::uuid)
  UNION
  SELECT patient_id FROM teams_here
)
SELECT (SELECT count(*)::int FROM public.patients p
         WHERE p.tenant_id = :'tenant'::uuid AND p.id IN (SELECT id FROM mine)) AS pat_all_exp,
       (SELECT count(*)::int FROM public.clinical_records c
         WHERE c.tenant_id = :'tenant'::uuid AND c.patient_id = :'patient_id'::uuid
           AND (c.practitioner_id = :'actor_id'::uuid OR c.patient_id IN (SELECT id FROM mine))) AS rec_p_exp,
       (SELECT count(*)::int FROM public.patient_care_team ct
         WHERE ct.tenant_id = :'tenant'::uuid AND ct.patient_id = :'patient_id'::uuid
           AND (ct.user_id = :'actor_id'::uuid OR ct.patient_id IN (SELECT patient_id FROM teams_here))) AS pct_p_exp,
       (SELECT count(*)::int FROM public.patient_care_team ct
         WHERE ct.tenant_id = :'tenant'::uuid
           AND (ct.user_id = :'actor_id'::uuid OR ct.patient_id IN (SELECT patient_id FROM teams_here))) AS pct_all_exp,
       (SELECT count(*)::int FROM public.patient_care_team ct
         WHERE ct.tenant_id = :'tenant'::uuid AND ct.patient_id = :'patient_id'::uuid
           AND ct.user_id = :'actor_id'::uuid) AS pct_p_own
\gset :c02a_slot

-- THE CLAIMS, FLAT, SET BEFORE THE ROLE CHANGE. set_config(..., true) is
-- transaction-local and each pass overwrites the last.
SELECT set_config('request.jwt.claims',
       json_build_object('tenant_id', :'tenant', 'user_role', :'actor_role', 'sub', :'actor_id')::text,
       true) IS NOT NULL AS claims_set \gset

-- THE IDENTITY CHECK, BEFORE ANYTHING IS READ AS THE ACTOR. auth.uid() and
-- auth.jwt() prefer session-level request.jwt.claim.sub / request.jwt.claim
-- GUCs over the blob set above, so a pooler leftover could make the helpers
-- answer for someone else.
SELECT (coalesce((SELECT auth.uid()) = :'actor_id'::uuid, false)
        AND coalesce((SELECT public.jwt_tenant_id())::text = :'tenant', false)
        AND coalesce((SELECT public.jwt_role()) = :'actor_role', false))::text AS identity_matches \gset
\if :identity_matches
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the session is not the identity this file set: auth.uid(), jwt_tenant_id() or jwt_role() answers for someone else. Nothing was checked. Reconnect.';
  END $stop$;
\endif

-- BECOME THE ACTOR. row_security back on first: the actor's reads must be the
-- filtered ones.
SET LOCAL row_security = on;
SET LOCAL ROLE authenticated;

SELECT (coalesce((SELECT auth.uid())::text, '') = :'actor_id')::text AS uid_ok,
       coalesce(:'patient_id'::uuid = ANY (public.viewer_care_team_patient_ids()), false)::text AS h_care,
       coalesce(:'patient_id'::uuid = ANY (public.viewer_treated_patient_ids()), false)::text AS h_treat,
       coalesce(public.clinical_admin_sees_patient(:'patient_id'::uuid), false)::text AS adm_basis,
       (SELECT count(*)::int FROM public.patients WHERE id = :'patient_id'::uuid) AS pat_read,
       (SELECT count(*)::int FROM public.patients) AS pat_all_read,
       (SELECT count(*)::int FROM public.clinical_records WHERE id = :'reg_id'::uuid) AS rec_read,
       (SELECT count(*)::int FROM public.clinical_records WHERE patient_id = :'patient_id'::uuid) AS rec_p_read,
       (SELECT count(*)::int FROM public.patient_care_team WHERE patient_id = :'patient_id'::uuid) AS pct_p_read,
       (SELECT count(*)::int FROM public.patient_care_team) AS pct_all_read,
       (SELECT count(*)::int FROM public.patient_care_team
         WHERE patient_id = :'patient_id'::uuid AND user_id <> :'actor_id'::uuid) AS pct_p_others_read
\gset :c02a_slot

-- 0096's helper, called AS THE ACTOR (so EXECUTE is proven too), and only when
-- it exists.
\if :clinic_helper
SELECT coalesce(:'patient_id'::uuid = ANY (public.viewer_care_team_patient_ids_at_my_clinics()), false)::text AS h_clinic
\gset :c02a_slot
\else
SELECT 'absent' AS h_clinic
\gset :c02a_slot
\endif

RESET ROLE;
SET LOCAL row_security = off;

-- WHAT EACH WRITE ADMITS, WITH THE ACTOR'S CLAIMS, OUTSIDE ROW LEVEL SECURITY.
-- The claims set above still stand; only the role is back. The expressions are
-- the catalogue's own rendering, interpolated as text.
SELECT (SELECT count(*)::int FROM public.clinical_records
         WHERE id = :'reg_id'::uuid AND (:e_rec_upd)) AS w_rec_u,
       (SELECT count(*)::int FROM public.clinical_records
         WHERE id = :'reg_id'::uuid AND (:e_rec_del)) AS w_rec_d,
       (SELECT count(*)::int FROM (SELECT * FROM public.clinical_records WHERE id = :'reg_id'::uuid) AS clinical_records
         WHERE (:e_rec_ins)) AS w_rec_i,
       (SELECT count(*)::int FROM public.patients
         WHERE id = :'patient_id'::uuid AND (:e_pat_upd)) AS w_pat_u,
       (SELECT count(*)::int FROM public.patients
         WHERE id = :'patient_id'::uuid AND (:e_pat_del)) AS w_pat_d,
       (SELECT count(*)::int FROM public.patient_care_team
         WHERE tenant_id = :'tenant'::uuid AND patient_id = :'patient_id'::uuid AND (:e_pct_upd)) AS w_pct_u
\gset :c02a_slot

-- CANDIDATE NEW ROWS for the care-team INSERT: the actor's own row for P (the
-- writer's shape: user_id and assigned_by are the actor), a row naming ANOTHER
-- user, the own row under a tenant id no tenant has, and the own row claiming
-- ANOTHER user or NOBODY (NULL) assigned it. Each is read through a derived
-- table named patient_care_team, so the catalogue's rendering of the
-- expression reads it unchanged.
WITH cand(kind, doc) AS (VALUES
  ('own',      jsonb_build_object('id', :'nil_id', 'tenant_id', :'tenant', 'patient_id', :'patient_id',
                                  'user_id', :'actor_id', 'assigned_by', :'actor_id')),
  ('other',    jsonb_build_object('id', :'nil_id', 'tenant_id', :'tenant', 'patient_id', :'patient_id',
                                  'user_id', lower(:'other_raw'), 'assigned_by', :'actor_id')),
  ('phantom',  jsonb_build_object('id', :'nil_id', 'tenant_id', :'nil_id', 'patient_id', :'patient_id',
                                  'user_id', :'actor_id', 'assigned_by', :'actor_id')),
  ('by_other', jsonb_build_object('id', :'nil_id', 'tenant_id', :'tenant', 'patient_id', :'patient_id',
                                  'user_id', :'actor_id', 'assigned_by', lower(:'other_raw'))),
  ('by_null',  jsonb_build_object('id', :'nil_id', 'tenant_id', :'tenant', 'patient_id', :'patient_id',
                                  'user_id', :'actor_id', 'assigned_by', NULL))
), c AS (
  SELECT cand.kind, nr.*
    FROM cand CROSS JOIN LATERAL jsonb_populate_record(NULL::public.patient_care_team, cand.doc) nr
)
SELECT (SELECT count(*)::int FROM c AS patient_care_team WHERE kind = 'own'      AND (:e_pct_ins)) AS w_pct_own,
       (SELECT count(*)::int FROM c AS patient_care_team WHERE kind = 'own'      AND (:e_pct_sel)) AS w_pct_own_sel,
       (SELECT count(*)::int FROM c AS patient_care_team WHERE kind = 'other'    AND (:e_pct_ins)) AS w_pct_other,
       (SELECT count(*)::int FROM c AS patient_care_team WHERE kind = 'phantom'  AND (:e_pct_ins)) AS w_pct_phantom,
       (SELECT count(*)::int FROM c AS patient_care_team WHERE kind = 'by_other' AND (:e_pct_ins)) AS w_pct_by_other,
       (SELECT count(*)::int FROM c AS patient_care_team WHERE kind = 'by_null'  AND (:e_pct_ins)) AS w_pct_by_null
\gset :c02a_slot

\endif

-- ===========================================================================
-- DRIVER, SECOND HALF: the verdicts. Skipped inside a pass.
-- ===========================================================================
\if :{?c02a_pass}
\else

-- The subjects and the instrument, as booleans every later arm reads.
SELECT (:'patient_ok' = 'true' AND :'reg_ok' = 'true' AND :'distinct_ok' = 'true')::text AS s0_ok,
       (:'t1_is_ther' = 'true' AND :'t1_on_team' = 'true' AND :'t1_linked' = 'true' AND :'t1_treats' = 'false'
        AND :'t1_created_p' = 'false')::text AS s1_ok,
       (:'t2_is_ther' = 'true' AND :'t2_treats' = 'true')::text AS s2_ok,
       (:'t3_is_ther' = 'true' AND :'t3_on_team' = 'false' AND :'t3_treats' = 'false'
        AND :'t3_created_p' = 'false' AND :t3_authored_p = 0)::text AS s3_ok,
       (:'t4_is_ther' = 'true' AND :'t4_on_team' = 'true' AND :'t4_linked' = 'false' AND :'t4_treats' = 'false'
        AND :'t4_created_p' = 'false' AND :t4_authored_p = 0)::text AS s4_ok,
       (:'n_is_staff_nt' = 'true' AND :'n_on_team' = 'true' AND :'n_linked' = 'true')::text AS s5_ok,
       (:'t1_uid_ok' = 'true' AND :'t2_uid_ok' = 'true' AND :'t3_uid_ok' = 'true'
        AND :'t4_uid_ok' = 'true' AND :'n_uid_ok' = 'true'
        AND :'t1_h_care' = :'t1_on_team' AND :'t1_h_treat' = :'t1_treats' AND :'t1_adm_basis' = :'t1_linked'
        AND :'t2_h_care' = :'t2_on_team' AND :'t2_h_treat' = :'t2_treats' AND :'t2_adm_basis' = :'t2_linked'
        AND :'t3_h_care' = :'t3_on_team' AND :'t3_h_treat' = :'t3_treats' AND :'t3_adm_basis' = :'t3_linked'
        AND :'t4_h_care' = :'t4_on_team' AND :'t4_h_treat' = :'t4_treats' AND :'t4_adm_basis' = :'t4_linked'
        AND :'n_h_care' = :'n_on_team' AND :'n_h_treat' = :'n_treats' AND :'n_adm_basis' = :'n_linked')::text AS i1_ok \gset
SELECT (:'s0_ok' = 'true' AND :'s1_ok' = 'true' AND :'s2_ok' = 'true' AND :'s3_ok' = 'true'
        AND (:'t4_none' = 'true' OR :'s4_ok' = 'true') AND (:'n_none' = 'true' OR :'s5_ok' = 'true')
        AND :'i1_ok' = 'true')::text AS all_ok \gset
-- The control N1 names depends on N's role: a receptionist's zero is a
-- registo, whose control is R1; an admin's zero is a care-team row, whose
-- control is C1.
SELECT (CASE WHEN :'n_role_now' = 'reception' THEN :t1_rec_p_read = :rec_total AND :rec_total >= 1
             WHEN :'n_role_now' = 'admin' THEN :t1_pct_p_read = :team_total AND :team_total >= 1
             ELSE false END)::text AS n1_control \gset

WITH r(n, "check", observed, expected, verdict) AS (VALUES
  (0, '0. this transaction is READ ONLY and REPEATABLE READ',
      current_setting('transaction_read_only') || ' / ' || current_setting('transaction_isolation'),
      'on / repeatable read',
      CASE WHEN current_setting('transaction_read_only') = 'on'
            AND current_setting('transaction_isolation') = 'repeatable read' THEN 'OK' ELSE 'FAIL' END),
  (1, 'S0. the subjects exist: P live, a registo of P by T2, the actors passed are distinct',
      'P ' || CASE WHEN :'patient_ok' = 'true' THEN 'live' ELSE 'MISSING' END
      || ', T2 registo ' || CASE WHEN :'reg_ok' = 'true' THEN 'found' ELSE 'MISSING' END
      || ', actors ' || CASE WHEN :'distinct_ok' = 'true' THEN 'distinct' ELSE 'NOT DISTINCT' END,
      'P live, T2 registo found, actors distinct',
      CASE WHEN :'s0_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (2, 'S1. T1 is an active therapist on P''s live team, linked to P, with no appointment with P, who did not create P',
      'therapist ' || :'t1_is_ther' || ', on team ' || :'t1_on_team' || ', linked ' || :'t1_linked'
      || ', treats ' || :'t1_treats' || ', created ' || :'t1_created_p',
      'therapist true, on team true, linked true, treats false, created false',
      CASE WHEN :'s1_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (3, 'S2. T2 is an active therapist with an appointment with P',
      'therapist ' || :'t2_is_ther' || ', treats ' || :'t2_treats' || ', on team ' || :'t2_on_team'
      || ', linked ' || :'t2_linked',
      'therapist true, treats true',
      CASE WHEN :'s2_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (4, 'S3. T3 is an active therapist, not on P''s live team, no appointment with P, did not create P, authored none of P''s registos',
      'therapist ' || :'t3_is_ther' || ', on team ' || :'t3_on_team' || ', treats ' || :'t3_treats'
      || ', created ' || :'t3_created_p' || ', authored ' || :'t3_authored_p',
      'therapist true, on team false, treats false, created false, authored 0',
      CASE WHEN :'s3_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (5, 'S4. T4 is an active therapist on P''s live team, NOT linked to P, no appointment with P, did not create P, authored none of P''s registos',
      CASE WHEN :'t4_none' = 'true' THEN 'not passed (none)'
           ELSE 'therapist ' || :'t4_is_ther' || ', on team ' || :'t4_on_team' || ', linked ' || :'t4_linked'
                || ', treats ' || :'t4_treats' || ', created ' || :'t4_created_p' || ', authored ' || :'t4_authored_p' END,
      'therapist true, on team true, linked false, treats false, created false, authored 0',
      CASE WHEN :'t4_none' = 'true' THEN 'VACUOUS' WHEN :'s4_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (6, 'S5. N is an active admin or receptionist on P''s live team, linked to P',
      CASE WHEN :'n_none' = 'true' THEN 'not passed (none)'
           ELSE 'role ' || :'n_role_now' || ', admin or reception ' || :'n_is_staff_nt'
                || ', on team ' || :'n_on_team' || ', linked ' || :'n_linked' END,
      'admin or reception true, on team true, linked true',
      CASE WHEN :'n_none' = 'true' THEN 'VACUOUS' WHEN :'s5_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (7, 'I1. INSTRUMENT: each session is its actor; 0091''s and 0074''s helpers place P as the tables do; 0045''s clinical_admin_sees_patient agrees with this file''s "linked"',
      'T1 care ' || :'t1_h_care' || ' treated ' || :'t1_h_treat' || ' 0045 ' || :'t1_adm_basis'
      || '; T2 care ' || :'t2_h_care' || ' treated ' || :'t2_h_treat' || ' 0045 ' || :'t2_adm_basis'
      || '; T3 care ' || :'t3_h_care' || ' treated ' || :'t3_h_treat' || ' 0045 ' || :'t3_adm_basis'
      || '; T4 care ' || :'t4_h_care' || ' treated ' || :'t4_h_treat' || ' 0045 ' || :'t4_adm_basis'
      || '; N care ' || :'n_h_care' || ' treated ' || :'n_h_treat' || ' 0045 ' || :'n_adm_basis'
      || CASE WHEN :'t1_uid_ok' = 'true' AND :'t2_uid_ok' = 'true' AND :'t3_uid_ok' = 'true'
               AND :'t4_uid_ok' = 'true' AND :'n_uid_ok' = 'true'
              THEN '; uid ok' ELSE '; uid IS SOMEBODY ELSE' END,
      'T1 care ' || :'t1_on_team' || ' treated ' || :'t1_treats' || ' 0045 ' || :'t1_linked'
      || '; T2 care ' || :'t2_on_team' || ' treated ' || :'t2_treats' || ' 0045 ' || :'t2_linked'
      || '; T3 care ' || :'t3_on_team' || ' treated ' || :'t3_treats' || ' 0045 ' || :'t3_linked'
      || '; T4 care ' || :'t4_on_team' || ' treated ' || :'t4_treats' || ' 0045 ' || :'t4_linked'
      || '; N care ' || :'n_on_team' || ' treated ' || :'n_treats' || ' 0045 ' || :'n_linked' || '; uid ok',
      CASE WHEN :'i1_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (8, 'H1. 0096''s helper exists and names P for each actor exactly when it is on P''s live team AND linked to P',
      CASE WHEN :'clinic_helper' <> 'true' THEN 'absent'
           ELSE 'T1 ' || :'t1_h_clinic' || ', T2 ' || :'t2_h_clinic' || ', T3 ' || :'t3_h_clinic'
                || ', T4 ' || :'t4_h_clinic' || ', N ' || :'n_h_clinic' END,
      'T1 ' || (:'t1_on_team' = 'true' AND :'t1_linked' = 'true')::text
      || ', T2 ' || (:'t2_on_team' = 'true' AND :'t2_linked' = 'true')::text
      || ', T3 ' || (:'t3_on_team' = 'true' AND :'t3_linked' = 'true')::text
      || ', T4 ' || (:'t4_on_team' = 'true' AND :'t4_linked' = 'true')::text
      || ', N ' || (:'n_on_team' = 'true' AND :'n_linked' = 'true')::text,
      CASE WHEN :'all_ok' <> 'true' OR :'clinic_helper' <> 'true' THEN 'FAIL'
           WHEN :'t1_h_clinic' = (:'t1_on_team' = 'true' AND :'t1_linked' = 'true')::text
            AND :'t2_h_clinic' = (:'t2_on_team' = 'true' AND :'t2_linked' = 'true')::text
            AND :'t3_h_clinic' = (:'t3_on_team' = 'true' AND :'t3_linked' = 'true')::text
            AND :'t4_h_clinic' = (:'t4_on_team' = 'true' AND :'t4_linked' = 'true')::text
            AND :'n_h_clinic' = (:'n_on_team' = 'true' AND :'n_linked' = 'true')::text THEN 'OK'
           ELSE 'FAIL' END),
  (9, 'P1. patients, T1 (assigned, at P''s clinic) reads P',
      :'t1_pat_read' || ' read', '1 read',
      CASE WHEN :'all_ok' = 'true' AND :t1_pat_read = 1 THEN 'OK' ELSE 'FAIL' END),
  (10, 'P2. patients, T2 (treating) reads P: the control for P3',
      :'t2_pat_read' || ' read', '1 read',
      CASE WHEN :'all_ok' = 'true' AND :t2_pat_read = 1 THEN 'OK' ELSE 'FAIL' END),
  (11, 'P3. patients, T3 (not assigned) does not read P',
      :'t3_pat_read' || ' read; control P2 ' || :'t2_pat_read', '0 read; control P2 1',
      CASE WHEN :'all_ok' = 'true' AND :t3_pat_read = 0 AND :t2_pat_read = 1 THEN 'OK' ELSE 'FAIL' END),
  (12, 'P4. patients, every therapist actor reads EXACTLY its tenant''s patients it created, treated, or is on the live team of and linked to',
      'T1 ' || :'t1_pat_all_read' || ', T2 ' || :'t2_pat_all_read' || ', T3 ' || :'t3_pat_all_read'
      || ', T4 ' || :'t4_pat_all_read',
      'T1 ' || :'t1_pat_all_exp' || ', T2 ' || :'t2_pat_all_exp' || ', T3 ' || :'t3_pat_all_exp'
      || ', T4 ' || :'t4_pat_all_exp',
      CASE WHEN :'all_ok' <> 'true' THEN 'FAIL'
           WHEN :t1_pat_all_read <> :t1_pat_all_exp OR :t2_pat_all_read <> :t2_pat_all_exp
             OR :t3_pat_all_read <> :t3_pat_all_exp OR :t4_pat_all_read <> :t4_pat_all_exp THEN 'FAIL'
           WHEN :t1_pat_all_exp = 0 AND :t2_pat_all_exp = 0 AND :t3_pat_all_exp = 0 THEN 'VACUOUS'
           ELSE 'OK' END),
  (13, 'P5. patients, T4 (assigned, NOT linked to P) does not read P: the clinic limit',
      CASE WHEN :'t4_none' = 'true' THEN 'not passed (none)'
           ELSE :'t4_pat_read' || ' read; control P1 ' || :'t1_pat_read' END,
      '0 read; control P1 1',
      CASE WHEN :'t4_none' = 'true' THEN 'VACUOUS'
           WHEN :'all_ok' = 'true' AND :t4_pat_read = 0 AND :t1_pat_read = 1 THEN 'OK' ELSE 'FAIL' END),
  (14, 'R1. registos, T1 reads T2''s registo and every registo of P',
      :'t1_rec_read' || ' of the subject, ' || :'t1_rec_p_read' || ' of ' || :'rec_total',
      '1 of the subject, ' || :'rec_total' || ' of ' || :'rec_total',
      CASE WHEN :'all_ok' = 'true' AND :t1_rec_read = 1 AND :t1_rec_p_read = :rec_total
            AND :t1_rec_p_exp = :rec_total THEN 'OK' ELSE 'FAIL' END),
  (15, 'R2. registos, T2 reads its registo and every registo of P: the control for R3',
      :'t2_rec_read' || ' of the subject, ' || :'t2_rec_p_read' || ' of ' || :'rec_total',
      '1 of the subject, ' || :'rec_total' || ' of ' || :'rec_total',
      CASE WHEN :'all_ok' = 'true' AND :t2_rec_read = 1 AND :t2_rec_p_read = :rec_total
            AND :t2_rec_p_exp = :rec_total THEN 'OK' ELSE 'FAIL' END),
  (16, 'R3. registos, T3 reads none of P''s registos',
      :'t3_rec_read' || ' of the subject, ' || :'t3_rec_p_read' || ' of ' || :'rec_total' || '; control R2 ' || :'t2_rec_read',
      '0 of the subject, 0 of ' || :'rec_total' || '; control R2 1',
      CASE WHEN :'all_ok' = 'true' AND :t3_rec_read = 0 AND :t3_rec_p_read = 0 AND :t3_rec_p_exp = 0
            AND :t2_rec_read = 1 THEN 'OK' ELSE 'FAIL' END),
  (17, 'R4. registos, T4 (assigned, NOT linked to P) reads none of P''s registos: the clinic limit',
      CASE WHEN :'t4_none' = 'true' THEN 'not passed (none)'
           ELSE :'t4_rec_read' || ' of the subject, ' || :'t4_rec_p_read' || ' of ' || :'rec_total'
                || '; control R1 ' || :'t1_rec_p_read' || ' of ' || :'rec_total' END,
      '0 of the subject, 0 of ' || :'rec_total' || '; control R1 ' || :'rec_total' || ' of ' || :'rec_total',
      CASE WHEN :'t4_none' = 'true' THEN 'VACUOUS'
           WHEN :'all_ok' = 'true' AND :t4_rec_read = 0 AND :t4_rec_p_read = 0 AND :t4_rec_p_exp = 0
            AND :t1_rec_p_read = :rec_total AND :rec_total >= 1 THEN 'OK' ELSE 'FAIL' END),
  (18, 'C1. care team, T1 reads every row of P''s team (a team it is on, at its clinic)',
      :'t1_pct_p_read' || ' of ' || :'team_total',
      :'team_total' || ' of ' || :'team_total' || ', at least 1',
      CASE WHEN :'all_ok' = 'true' AND :team_total >= 1 AND :t1_pct_p_read = :team_total
            AND :t1_pct_p_exp = :team_total THEN 'OK' ELSE 'FAIL' END),
  (19, 'C2. care team, T2 reads every row of P''s team when on it and linked, else only its own rows of P',
      :'t2_pct_p_read' || ' read (on team ' || :'t2_on_team' || ', linked ' || :'t2_linked' || ')',
      :'t2_pct_p_exp' || ' read',
      CASE WHEN :'all_ok' <> 'true' THEN 'FAIL'
           WHEN :t2_pct_p_read <> :t2_pct_p_exp THEN 'FAIL'
           WHEN :t2_pct_p_exp = 0 THEN 'VACUOUS' ELSE 'OK' END),
  (20, 'C3. care team, T3 reads only its own rows of P',
      :'t3_pct_p_read' || ' read; control C1 ' || :'t1_pct_p_read' || ' of ' || :'team_total',
      :'t3_pct_p_exp' || ' read; control C1 ' || :'team_total' || ' of ' || :'team_total',
      CASE WHEN :'all_ok' = 'true' AND :t3_pct_p_read = :t3_pct_p_exp
            AND :team_total >= 1 AND :t1_pct_p_read = :team_total THEN 'OK' ELSE 'FAIL' END),
  (21, 'C4. care team, every therapist actor reads EXACTLY its own rows and the rows of the teams it is on and linked to',
      'T1 ' || :'t1_pct_all_read' || ', T2 ' || :'t2_pct_all_read' || ', T3 ' || :'t3_pct_all_read'
      || ', T4 ' || :'t4_pct_all_read',
      'T1 ' || :'t1_pct_all_exp' || ', T2 ' || :'t2_pct_all_exp' || ', T3 ' || :'t3_pct_all_exp'
      || ', T4 ' || :'t4_pct_all_exp',
      CASE WHEN :'all_ok' <> 'true' THEN 'FAIL'
           WHEN :t1_pct_all_read <> :t1_pct_all_exp OR :t2_pct_all_read <> :t2_pct_all_exp
             OR :t3_pct_all_read <> :t3_pct_all_exp OR :t4_pct_all_read <> :t4_pct_all_exp THEN 'FAIL'
           WHEN :t1_pct_all_exp = 0 AND :t2_pct_all_exp = 0 AND :t3_pct_all_exp = 0 THEN 'VACUOUS'
           ELSE 'OK' END),
  (22, 'C5. care team, T4 (assigned, NOT linked to P) reads its own rows of P and none of the other members'': the clinic limit',
      CASE WHEN :'t4_none' = 'true' THEN 'not passed (none)'
           ELSE 'read ' || :'t4_pct_p_read' || ' (its own: ' || :'t4_pct_p_own' || '), others ' || :'t4_pct_p_others_read'
                || '; control C1 ' || :'t1_pct_p_read' || ' of ' || :'team_total' END,
      'read ' || :'t4_pct_p_own' || ' (its own: ' || :'t4_pct_p_own' || '), others 0; control C1 '
      || :'team_total' || ' of ' || :'team_total',
      CASE WHEN :'t4_none' = 'true' THEN 'VACUOUS'
           WHEN :'all_ok' = 'true' AND :t4_pct_p_others_read = 0 AND :t4_pct_p_read = :t4_pct_p_own
            AND :t4_pct_p_exp = :t4_pct_p_own AND :t4_pct_p_own >= 1
            AND :team_total > :t4_pct_p_own AND :t1_pct_p_read = :team_total THEN 'OK' ELSE 'FAIL' END),
  (23, 'N1. N (a non-therapist on P''s team, linked to P) reads of P, its registos and its team exactly what its own role admits',
      CASE WHEN :'n_none' = 'true' THEN 'not passed (none)'
           ELSE :'n_role_now' || ': P ' || :'n_pat_read' || ', registos ' || :'n_rec_p_read'
                || ', team ' || :'n_pct_p_read' || '; control ' || CASE WHEN :'n1_control' = 'true' THEN 'met' ELSE 'NOT MET' END END,
      CASE WHEN :'n_none' = 'true' THEN 'VACUOUS when not passed'
           ELSE :'n_role_now' || ': P ' || :'n_pat_role_exp' || ', registos ' || :'n_rec_role_exp'
                || ', team ' || :'n_pct_role_exp' || '; control met' END,
      CASE WHEN :'n_none' = 'true' THEN 'VACUOUS'
           WHEN :'all_ok' = 'true' AND :'n1_control' = 'true'
            AND :n_pat_read = :n_pat_role_exp AND :n_rec_p_read = :n_rec_role_exp
            AND :n_pct_p_read = :n_pct_role_exp THEN 'OK' ELSE 'FAIL' END),
  (24, 'W1. registos, T1 writes nothing of T2''s: UPDATE, DELETE, and an INSERT of that row',
      'U=' || :'t1_w_rec_u' || ' D=' || :'t1_w_rec_d' || ' I=' || :'t1_w_rec_i'
      || '; control W2 ' || :'t2_w_rec_u' || '/' || :'t2_w_rec_d' || '/' || :'t2_w_rec_i',
      'U=0 D=0 I=0; control W2 1/1/1',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_rec_u = 0 AND :t1_w_rec_d = 0 AND :t1_w_rec_i = 0
            AND :t2_w_rec_u = 1 AND :t2_w_rec_d = 1 AND :t2_w_rec_i = 1 THEN 'OK' ELSE 'FAIL' END),
  (25, 'W2. CONTROL: the same three expressions admit T2 for its own registo',
      'U=' || :'t2_w_rec_u' || ' D=' || :'t2_w_rec_d' || ' I=' || :'t2_w_rec_i',
      'U=1 D=1 I=1',
      CASE WHEN :'all_ok' = 'true' AND :t2_w_rec_u = 1 AND :t2_w_rec_d = 1 AND :t2_w_rec_i = 1
           THEN 'OK' ELSE 'FAIL' END),
  (26, 'W3. registos, T3 and T4 write nothing of T2''s',
      'T3 U=' || :'t3_w_rec_u' || ' D=' || :'t3_w_rec_d' || ' I=' || :'t3_w_rec_i'
      || '; T4 U=' || :'t4_w_rec_u' || ' D=' || :'t4_w_rec_d' || ' I=' || :'t4_w_rec_i',
      'T3 U=0 D=0 I=0; T4 U=0 D=0 I=0; control W2 1/1/1',
      CASE WHEN :'all_ok' = 'true' AND :t3_w_rec_u = 0 AND :t3_w_rec_d = 0 AND :t3_w_rec_i = 0
            AND :t4_w_rec_u = 0 AND :t4_w_rec_d = 0 AND :t4_w_rec_i = 0
            AND :t2_w_rec_u = 1 AND :t2_w_rec_d = 1 AND :t2_w_rec_i = 1 THEN 'OK' ELSE 'FAIL' END),
  (27, 'W4. patients UPDATE and DELETE of P: T1, T3 and T4 none, T2 both (the control)',
      'T1 ' || :'t1_w_pat_u' || '/' || :'t1_w_pat_d' || ', T2 ' || :'t2_w_pat_u' || '/' || :'t2_w_pat_d'
      || ', T3 ' || :'t3_w_pat_u' || '/' || :'t3_w_pat_d' || ', T4 ' || :'t4_w_pat_u' || '/' || :'t4_w_pat_d',
      'T1 0/0, T2 1/1, T3 0/0, T4 0/0',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_pat_u = 0 AND :t1_w_pat_d = 0 AND :t2_w_pat_u = 1
            AND :t2_w_pat_d = 1 AND :t3_w_pat_u = 0 AND :t3_w_pat_d = 0
            AND :t4_w_pat_u = 0 AND :t4_w_pat_d = 0 THEN 'OK' ELSE 'FAIL' END),
  (28, 'W5. care team, own row for P in the writer''s shape (INSERT check, and SELECT on the new row): T1, T3, T4 refused, T2 admitted',
      'T1 ' || :'t1_w_pct_own' || ', T2 ' || :'t2_w_pct_own' || ' (select ' || :'t2_w_pct_own_sel' || '), T3 '
      || :'t3_w_pct_own' || ', T4 ' || :'t4_w_pct_own',
      'T1 0, T2 1 (select 1), T3 0, T4 0',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_pct_own = 0 AND :t2_w_pct_own = 1 AND :t2_w_pct_own_sel = 1
            AND :t3_w_pct_own = 0 AND :t4_w_pct_own = 0 THEN 'OK' ELSE 'FAIL' END),
  (29, 'W6. care team, a row for another user and the own row under a tenant that does not exist are refused for every therapist actor',
      'other ' || :'t1_w_pct_other' || '/' || :'t2_w_pct_other' || '/' || :'t3_w_pct_other' || '/' || :'t4_w_pct_other'
      || ', phantom ' || :'t1_w_pct_phantom' || '/' || :'t2_w_pct_phantom' || '/' || :'t3_w_pct_phantom'
      || '/' || :'t4_w_pct_phantom' || '; control W5 T2 ' || :'t2_w_pct_own',
      'other 0/0/0/0, phantom 0/0/0/0; control W5 T2 1',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_pct_other = 0 AND :t2_w_pct_other = 0 AND :t3_w_pct_other = 0
            AND :t4_w_pct_other = 0 AND :t1_w_pct_phantom = 0 AND :t2_w_pct_phantom = 0
            AND :t3_w_pct_phantom = 0 AND :t4_w_pct_phantom = 0
            AND :t2_w_pct_own = 1 THEN 'OK' ELSE 'FAIL' END),
  (30, 'W7. care team UPDATE of P''s rows: none for any therapist',
      'T1 ' || :'t1_w_pct_u' || ', T2 ' || :'t2_w_pct_u' || ', T3 ' || :'t3_w_pct_u' || ', T4 ' || :'t4_w_pct_u'
      || ' of ' || :'team_total',
      'T1 0, T2 0, T3 0, T4 0 of at least 1',
      CASE WHEN :'all_ok' = 'true' AND :team_total >= 1 AND :t1_w_pct_u = 0 AND :t2_w_pct_u = 0
            AND :t3_w_pct_u = 0 AND :t4_w_pct_u = 0 THEN 'OK' ELSE 'FAIL' END),
  (31, 'W8. care team, an own row whose assigned_by is another user or NULL is refused for every therapist actor, T2 included',
      'another assigner ' || :'t1_w_pct_by_other' || '/' || :'t2_w_pct_by_other' || '/' || :'t3_w_pct_by_other'
      || '/' || :'t4_w_pct_by_other' || ', NULL assigner ' || :'t1_w_pct_by_null' || '/' || :'t2_w_pct_by_null'
      || '/' || :'t3_w_pct_by_null' || '/' || :'t4_w_pct_by_null' || '; control W5 T2 ' || :'t2_w_pct_own',
      'another assigner 0/0/0/0, NULL assigner 0/0/0/0; control W5 T2 1',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_pct_by_other = 0 AND :t2_w_pct_by_other = 0
            AND :t3_w_pct_by_other = 0 AND :t4_w_pct_by_other = 0
            AND :t1_w_pct_by_null = 0 AND :t2_w_pct_by_null = 0 AND :t3_w_pct_by_null = 0
            AND :t4_w_pct_by_null = 0 AND :t2_w_pct_own = 1 THEN 'OK' ELSE 'FAIL' END)
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

\endif
