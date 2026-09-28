-- 0099 REGISTO WRITES BEHAVIOUR CHECK. READ ONLY. Run AFTER 0099 is applied; run
-- before it only with -v subjects_only=on (see "TWO MODES" below).
--
-- 0099 makes the clinical_records write policies follow the permission
-- matrix: a therapist edits and deletes only their own unsigned registos, and
-- files registos only in their own name for a patient they treat or created.
-- This file proves what real staff sessions may WRITE, and still READ, on the
-- database it is run against, by impersonation (flat claims tenant_id,
-- user_role, sub, then SET LOCAL ROLE authenticated), inside ONE READ ONLY
-- REPEATABLE READ transaction.
--
-- ===========================================================================
-- THE ACTORS AND THE PATIENT ARE PASSED, NEVER PICKED
-- ===========================================================================
--   psql "$DB" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v patient_id=<P> -v t1_id=<T1> -v t2_id=<T2> -v t3_id=<T3>
--        -f scripts/db/behaviour-registo-writes-readonly.sql
--   T1  THE AUTHOR: an active therapist who treats or created P and authored
--       an unsigned registo of P (the subject registo R, the lowest such id,
--       chosen here and never printed). The positive control.
--   T2  THE COLLEAGUE: an active therapist with an appointment with P (either
--       slot), who is not R's author. The subject of the narrowing.
--   T3  THE UNRELATED THERAPIST: an active therapist with no appointment with
--       P, who did not create P, authored no registo of P and is not on P's
--       care team (no live patient_care_team row for P: after 0098 a care
--       team member at one of their own clinics reads P's registos, and T3
--       is the actor who reads none).
-- Two further subjects are chosen here, by the lowest id, and never printed:
--   Q   a live patient of the tenant T3 created or has an appointment with,
--       the control for T3's refusal. None: arm N3 reads VACUOUS.
--   A   an unclaimed AI draft of P (source ai_ingested, status draft,
--       ai_review_state pending_review, no author). None: arm A1 reads
--       VACUOUS.
-- On a rehearsal they are the SYNTHETIC principals the rehearsal fixture
-- loads; this file creates nobody, and cannot, because the transaction is
-- READ ONLY. On production they are real staff ids the apply document picks.
-- Every id is verified against the tables here; an actor that is not what its
-- slot says is a MISSING SUBJECT, and a missing subject is a FAIL (arms S0 to
-- S3) that turns every later arm to FAIL, never a pass and never a skip.
--
-- TWO MODES. By default every arm runs. With -v subjects_only=on only arm 0,
-- the subject arms S0 to S3 and the instrument I1 are printed: the apply
-- document runs that mode BEFORE the apply, so a subject that is not what its
-- slot says halts the sitting before anything is applied, and runs every arm
-- AFTER the apply. In the subjects-only mode the profile reads
--     6 OK / 0 VACUOUS / 0 FAIL
-- or the sitting halts.
--
-- IT MUST BE RUN FROM A FILE (-f). It reads ITSELF with \ir, once per actor,
-- so that one ACTOR line and one set of measurements serve every actor
-- (scripts/behaviour-checks-print-actor.test.mjs requires exactly one ACTOR
-- line per file), the shape of behaviour-care02a-readonly.sql. The variable
-- r99_pass says which half is running; do not pass it.
--
-- ===========================================================================
-- HOW A READ ONLY FILE MEASURES WRITES
-- ===========================================================================
-- It cannot run an UPDATE, not even inside a savepoint that is rolled back:
-- in a READ ONLY transaction the server refuses the statement before it reads
-- a row. So, as 0094's and 0098's behaviour checks do, it reads from
-- pg_policy the expression Postgres applies to a command for `authenticated`
-- (every PERMISSIVE policy OR'ed, every RESTRICTIVE one AND'ed, FOR ALL
-- included; an UPDATE is read twice, its USING for the old row and its WITH
-- CHECK for the new one; an INSERT uses WITH CHECK) and evaluates it WITH THE
-- ACTOR'S CLAIMS SET, OUTSIDE row level security (row_security off, so a
-- connection that does not bypass it STOPs with an error rather than reading
-- a filtered count), over the subject rows, over every registo of the tenant
-- (arms X1 and X2), and over CANDIDATE NEW ROWS for an INSERT or the new side
-- of an UPDATE. Every zero a write arm asserts has a control in the same run
-- that must read 1 through the same machinery (T1 on R in U1, U2 and D1; T1
-- and T2 in N1; T3 on Q in N3), so a broken instrument reads FAIL, not OK.
-- The writes in action (the UPDATE that touches 0 rows, the INSERT that is
-- refused with 42501, the review claim through the claim function) are the
-- rehearsal's, on a throwaway.
--
-- ===========================================================================
-- THE VERDICT CONTRACT. THREE VALUES, AND A PROFILE.
-- ===========================================================================
-- Every arm prints OK, VACUOUS or FAIL, and the last row prints
--     N OK / M VACUOUS / K FAIL
-- A population that is empty reads VACUOUS, never OK. A missing subject is a
-- FAIL. Arms S0 to S3 and I1 are the subjects and the instrument; every arm
-- after them reads FAIL when any of those is not OK.
--
-- THE PROFILES WITH 0099 APPLIED, measured on the rehearsal fixture (one
-- tenant with T1, T2, T3 and a fourth therapist on P's care team at one
-- clinic, P with T1's draft and an unclaimed AI draft, Q created by T3, and a
-- second tenant):
--   every arm:             20 OK / 0 VACUOUS / 0 FAIL.
-- With no unclaimed AI draft of P, A1 reads VACUOUS:
--   every arm:             19 OK / 1 VACUOUS / 0 FAIL.
-- With no Q, N3 reads VACUOUS as well. The apply document states the profile
-- it expects, and why. The subjects-only mode reads 6 OK / 0 VACUOUS / 0 FAIL
-- on either side of 0099.
--
-- THE ARMS
--   0   the transaction is READ ONLY and REPEATABLE READ.
--   S0  the subjects exist: P is a live patient, R (an unsigned registo of P
--       authored by T1) exists, and the actor ids passed are distinct.
--   S1  T1 is an active therapist of P's tenant, not a shared resource, who
--       treats or created P and authored R.
--   S2  T2 is an active therapist of P's tenant, not a shared resource, with
--       an appointment with P.
--   S3  T3 is an active therapist of P's tenant, not a shared resource, with
--       no appointment with P, who did not create P, authored no registo of
--       P and has no live patient_care_team row for P.
--   I1  THE INSTRUMENT: for each actor, auth.uid() is the actor;
--       clinical_therapist_sees_patient(P), called AS the actor, agrees with
--       the tables (T1 and T2 true, T3 false); and the three write
--       expressions were read from the catalogue.
--   U1  UPDATE of R, the old row (USING): T1 admitted, T2 and T3 not.
--   U2  UPDATE of R, the new row (WITH CHECK), R unchanged: T1 admitted, T2
--       and T3 not.
--   U3  UPDATE of R, the new row handed to T2 (practitioner_id T2), written
--       by T1: refused. Authorship never moves by an UPDATE. Control: U2's T1.
--   U4  UPDATE of R by T1, the new row naming a patient T1 neither treats
--       nor created (a patient id no patient has): refused. The new row of an
--       UPDATE meets W1's patient test. Control: U2's T1.
--   D1  DELETE of R: T1 admitted, T2 and T3 not.
--   N1  INSERT in the actor's OWN name for P: T1 and T2 admitted (they treat
--       P), T3 not.
--   N2  INSERT in a COLLEAGUE's name for P: T1 naming T2, T2 naming T1 and T3
--       naming T1 all refused. Control: N1's T1 and T2.
--   N3  INSERT in T3's own name for Q: admitted. The control for N1's T3.
--       VACUOUS when T3 treats and created no patient.
--   N4  INSERT in the actor's own name for P under a tenant id no tenant has:
--       refused for every actor. The tenant predicate. Control: N1.
--   X1  every actor: the registos of its tenant its UPDATE admits (USING) are
--       EXACTLY the ones it authored, compared as an md5 over the ordered ids
--       with a comparand written from the tables, not from the policy.
--   X2  the same for DELETE.
--   Z1  the TENANT PREDICATE of UPDATE and DELETE, on any database: T1's own
--       subject registo, with its tenant_id replaced by a tenant id no tenant
--       has, is refused by UPDATE (both sides) and DELETE. T1 is its author, so
--       only the tenant conjunct can refuse it. Control: U1, U2 and D1's T1.
--   A1  the unclaimed AI draft A of P: no actor's UPDATE admits it (USING).
--       After 0099 a therapist takes one only through the claim function,
--       which this READ ONLY file cannot call. VACUOUS when P has none.
--   R1  reads are unchanged: T1 and T2 read R, T3 does not.
--
-- WHAT NO ARM HERE MEASURES, stated so a green run is not read as covering it:
--   * The claim function in action, and the writes themselves (the rehearsal).
--   * The owner arm, which no actor here holds: the pre-check and the
--     post-check pin each policy's whole expression, owner arm included, by
--     md5.
--   * A locked or signed registo: the immutability trigger refuses those
--     whatever the policies admit, and the post-check pins the trigger.
--
-- IT PRINTS ONE ACTOR LINE PER ACTOR, THEN COUNTS AND VERDICTS, AND NOTHING
-- ELSE. No name, no contact detail, no patient id and no registo id reaches
-- the transcript: every subject is chosen into a psql variable and used,
-- never echoed. Each ACTOR line reads
--     ACTOR id <uuid> | role <slug> | chosen passed in with -v <slot>_id
-- once per actor, before any verdict row, so whoever reads the transcript can
-- tell by comparing ids which accounts the run acted as. It is a staff id,
-- never a name.

\set ON_ERROR_STOP on

-- ===========================================================================
-- DRIVER, FIRST HALF: inputs, the transaction, the shared subjects and the
-- write expressions, then one pass per actor (this same file, below).
-- ===========================================================================
\if :{?r99_pass}
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
    RAISE EXCEPTION 'STOP: pass the author with -v t1_id=<T1>. Nothing was checked.';
  END $stop$;
\endif
\if :{?t2_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: pass the colleague who treats P with -v t2_id=<T2>. Nothing was checked.';
  END $stop$;
\endif
\if :{?t3_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: pass the unrelated therapist with -v t3_id=<T3>. Nothing was checked.';
  END $stop$;
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo ''
\echo '=== 0099 REGISTO WRITES BEHAVIOUR CHECK. READ ONLY. 20 arms, three actors, profile printed last ==='

-- Every read outside the actors' sessions is unfiltered, or it ERRORs: a
-- connection subject to row level security STOPs here rather than reading a
-- filtered comparand.
SET LOCAL row_security = off;

-- An id no tenant and no patient has, for N4's phantom row, for U4's moved
-- row and for a missing patient.
\set nil_id 00000000-0000-0000-0000-000000000000
SELECT (NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = :'nil_id'::uuid)
        AND NOT EXISTS (SELECT 1 FROM public.patients WHERE id = :'nil_id'::uuid))::text AS nil_is_free \gset
\if :nil_is_free
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: a tenant or a patient has the id this file uses for one that does not exist. Nothing was checked.';
  END $stop$;
\endif

-- The mode. subjects_only=on prints arm 0, S0 to S3 and I1 only.
\if :{?subjects_only}
\set r99_all false
\echo '=== MODE: subjects and instrument only (arm 0, S0 to S3, I1). The write arms are not printed. ==='
\else
\set r99_all true
\endif

-- THE PATIENT. Normalised from the table; a missing or soft-deleted patient
-- is S0's FAIL, and the run goes on under the nil tenant so a profile prints.
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

-- THE ACTORS' IDS, normalised where they are staff ids, for the subjects.
SELECT coalesce((SELECT u.id::text FROM public.users u WHERE u.id = :'t1_id'::uuid), lower(:'t1_id')) AS t1_norm,
       coalesce((SELECT u.id::text FROM public.users u WHERE u.id = :'t2_id'::uuid), lower(:'t2_id')) AS t2_norm,
       coalesce((SELECT u.id::text FROM public.users u WHERE u.id = :'t3_id'::uuid), lower(:'t3_id')) AS t3_norm \gset

-- THE SUBJECT REGISTO R: the lowest-id UNSIGNED registo of P authored by T1.
SELECT (SELECT c.id::text FROM public.clinical_records c
         WHERE c.tenant_id = :'tenant'::uuid AND c.patient_id = :'patient_id'::uuid
           AND c.practitioner_id = :'t1_norm'::uuid AND c.status = 'draft'
         ORDER BY c.id LIMIT 1) AS reg_checked \gset
\if :{?reg_checked}
\set reg_ok true
\set reg_id :reg_checked
\else
\set reg_ok false
\set reg_id :nil_id
\endif

-- Q: the lowest-id live patient of the tenant T3 created or has an
-- appointment with, in either slot. N3's subject.
SELECT (SELECT x.id::text FROM (
          SELECT p.id FROM public.patients p
           WHERE p.tenant_id = :'tenant'::uuid AND p.deleted_at IS NULL AND p.created_by = :'t3_norm'::uuid
          UNION
          SELECT p.id FROM public.appointments a
            JOIN public.patients p ON p.id IN (a.patient_id, a.patient_2_id) AND p.tenant_id = a.tenant_id
           WHERE a.tenant_id = :'tenant'::uuid AND p.deleted_at IS NULL
             AND (a.practitioner_id = :'t3_norm'::uuid OR a.practitioner_2_id = :'t3_norm'::uuid)) x
         ORDER BY x.id LIMIT 1) AS q_checked \gset
\if :{?q_checked}
\set q_ok true
\set q_id :q_checked
\else
\set q_ok false
\set q_id :nil_id
\endif

-- A: the lowest-id unclaimed AI draft of P. A1's subject.
SELECT (SELECT c.id::text FROM public.clinical_records c
         WHERE c.tenant_id = :'tenant'::uuid AND c.patient_id = :'patient_id'::uuid
           AND c.source = 'ai_ingested' AND c.status = 'draft'
           AND c.ai_review_state = 'pending_review' AND c.practitioner_id IS NULL
         ORDER BY c.id LIMIT 1) AS ai_checked \gset
\if :{?ai_checked}
\set ai_ok true
\set ai_id :ai_checked
\else
\set ai_ok false
\set ai_id :nil_id
\endif

SELECT (count(DISTINCT lower(x)) = 3)::text AS distinct_ok
  FROM unnest(ARRAY[:'t1_id', :'t2_id', :'t3_id']) AS x \gset

-- THE EFFECTIVE EXPRESSIONS, read from the catalogue: for each command, every
-- PERMISSIVE policy on clinical_records that applies to authenticated (or
-- PUBLIC) OR'ed, AND every RESTRICTIVE one. No policy at all reads `false`,
-- which is what row level security does with a command nobody is permitted.
WITH p AS (
  SELECT pol.polcmd::text AS cmd, pol.polpermissive AS perm,
         pg_get_expr(pol.polqual, pol.polrelid) AS q,
         pg_get_expr(coalesce(pol.polwithcheck, pol.polqual), pol.polrelid) AS wc
    FROM pg_policy pol
   WHERE pol.polrelid = 'public.clinical_records'::regclass
     AND (0::oid = ANY (pol.polroles) OR 'authenticated'::regrole::oid = ANY (pol.polroles))
), k(cmd, use_check) AS (
  VALUES ('w', false), ('w', true), ('d', false), ('a', true)
), e AS (
  SELECT k.cmd, k.use_check,
         '(' || coalesce((SELECT string_agg('(' || x.expr || ')', ' OR ' ORDER BY x.expr)
                            FROM (SELECT CASE WHEN k.use_check THEN p.wc ELSE p.q END AS expr, p.perm
                                    FROM p WHERE p.cmd IN (k.cmd, '*')) x
                           WHERE x.perm AND x.expr IS NOT NULL), 'false')
      || ') AND (' ||
         coalesce((SELECT string_agg('(' || x.expr || ')', ' AND ' ORDER BY x.expr)
                     FROM (SELECT CASE WHEN k.use_check THEN p.wc ELSE p.q END AS expr, p.perm
                             FROM p WHERE p.cmd IN (k.cmd, '*')) x
                    WHERE NOT x.perm AND x.expr IS NOT NULL), 'true')
      || ')' AS expr
    FROM k
)
SELECT max(expr) FILTER (WHERE cmd = 'w' AND NOT use_check) AS e_upd,
       max(expr) FILTER (WHERE cmd = 'w' AND use_check)     AS e_upd_chk,
       max(expr) FILTER (WHERE cmd = 'd')                   AS e_del,
       max(expr) FILTER (WHERE cmd = 'a')                   AS e_ins
  FROM e \gset
SELECT (:'e_upd' <> '(false) AND (true)' AND :'e_upd_chk' <> '(false) AND (true)'
        AND :'e_del' <> '(false) AND (true)' AND :'e_ins' <> '(false) AND (true)')::text AS exprs_read \gset

-- ONE PASS PER ACTOR. Each sets the slot's prefix, the raw id, the id of the
-- COLLEAGUE its N2 candidate names, and how the actor was chosen, then reads
-- this file again with r99_pass set.
\set r99_pass on

\set r99_slot t1_
\set actor_raw :t1_id
\set other_raw :t2_id
\set actor_source 'passed in with -v t1_id'
\ir behaviour-registo-writes-readonly.sql

\set r99_slot t2_
\set actor_raw :t2_id
\set other_raw :t1_id
\set actor_source 'passed in with -v t2_id'
\ir behaviour-registo-writes-readonly.sql

\set r99_slot t3_
\set actor_raw :t3_id
\set other_raw :t1_id
\set actor_source 'passed in with -v t3_id'
\ir behaviour-registo-writes-readonly.sql

\unset r99_pass
\endif

-- ===========================================================================
-- ONE ACTOR'S PASS. Runs only when this file is read by the driver above.
-- Every measurement is stored under the slot's prefix (t1_, t2_ or t3_).
-- ===========================================================================
\if :{?r99_pass}

-- THE ACTOR. Normalised from the table where it exists, so an upper-case uuid
-- cannot trip the identity STOP; an id that is no staff user is S1 to S3's FAIL.
SELECT coalesce((SELECT u.id::text FROM public.users u WHERE u.id = :'actor_raw'::uuid),
                lower(:'actor_raw')) AS actor_checked \gset
\set actor_id :actor_checked
SELECT coalesce((SELECT r.slug FROM public.users u JOIN public.roles r ON r.id = u.role_id
                  WHERE u.id = :'actor_id'::uuid), 'NO ROLE') AS actor_role \gset

-- THE ACTOR LINE. The id is the normalised one above and the role is the slug
-- just read, which is also the role the claims below carry.
\echo 'ACTOR id' :actor_id '| role' :actor_role '| chosen' :actor_source

-- THE FACTS, outside row level security, from the tables themselves.
SELECT EXISTS (SELECT 1 FROM public.users u JOIN public.roles r ON r.id = u.role_id AND r.slug = 'therapist'
                WHERE u.id = :'actor_id'::uuid AND u.tenant_id = :'tenant'::uuid
                  AND u.is_active AND NOT u.is_shared_resource)::text AS is_ther,
       EXISTS (SELECT 1 FROM public.appointments a
                WHERE a.tenant_id = :'tenant'::uuid
                  AND (a.patient_id = :'patient_id'::uuid OR a.patient_2_id = :'patient_id'::uuid)
                  AND (a.practitioner_id = :'actor_id'::uuid OR a.practitioner_2_id = :'actor_id'::uuid))::text AS treats,
       EXISTS (SELECT 1 FROM public.patients p
                WHERE p.id = :'patient_id'::uuid AND p.created_by = :'actor_id'::uuid)::text AS created_p,
       EXISTS (SELECT 1 FROM public.patient_care_team ct
                WHERE ct.tenant_id = :'tenant'::uuid AND ct.patient_id = :'patient_id'::uuid
                  AND ct.user_id = :'actor_id'::uuid AND ct.removed_at IS NULL)::text AS care_team,
       (SELECT count(*)::int FROM public.clinical_records c
         WHERE c.tenant_id = :'tenant'::uuid AND c.patient_id = :'patient_id'::uuid
           AND c.practitioner_id = :'actor_id'::uuid) AS authored_p,
       EXISTS (SELECT 1 FROM public.clinical_records c
                WHERE c.id = :'reg_id'::uuid AND c.practitioner_id = :'actor_id'::uuid)::text AS authored_r,
       (SELECT count(*)::int FROM public.clinical_records c
         WHERE c.tenant_id = :'tenant'::uuid AND c.practitioner_id = :'actor_id'::uuid) AS x_auth_n,
       coalesce((SELECT md5(string_agg(c.id::text, ',' ORDER BY c.id)) FROM public.clinical_records c
                  WHERE c.tenant_id = :'tenant'::uuid AND c.practitioner_id = :'actor_id'::uuid), 'none') AS x_auth_md5
\gset :r99_slot

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
       coalesce(public.clinical_therapist_sees_patient(:'patient_id'::uuid), false)::text AS sees_p,
       (SELECT count(*)::int FROM public.clinical_records WHERE id = :'reg_id'::uuid) AS r_read
\gset :r99_slot

RESET ROLE;
SET LOCAL row_security = off;

-- WHAT EACH WRITE ADMITS, WITH THE ACTOR'S CLAIMS, OUTSIDE ROW LEVEL SECURITY.
-- The claims set above still stand; only the role is back. The expressions are
-- the catalogue's own rendering, interpolated as text.
SELECT (SELECT count(*)::int FROM public.clinical_records WHERE id = :'reg_id'::uuid AND (:e_upd))     AS w_u,
       (SELECT count(*)::int FROM public.clinical_records WHERE id = :'reg_id'::uuid AND (:e_upd_chk)) AS w_uc,
       (SELECT count(*)::int FROM public.clinical_records WHERE id = :'reg_id'::uuid AND (:e_del))     AS w_d,
       (SELECT count(*)::int FROM public.clinical_records WHERE id = :'ai_id'::uuid AND (:e_upd))      AS w_ai_u,
       (SELECT count(*)::int FROM public.clinical_records WHERE tenant_id = :'tenant'::uuid AND (:e_upd)) AS x_u_n,
       coalesce((SELECT md5(string_agg(id::text, ',' ORDER BY id)) FROM public.clinical_records
                  WHERE tenant_id = :'tenant'::uuid AND (:e_upd)), 'none')                            AS x_u_md5,
       (SELECT count(*)::int FROM public.clinical_records WHERE tenant_id = :'tenant'::uuid AND (:e_del)) AS x_d_n,
       coalesce((SELECT md5(string_agg(id::text, ',' ORDER BY id)) FROM public.clinical_records
                  WHERE tenant_id = :'tenant'::uuid AND (:e_del)), 'none')                            AS x_d_md5
\gset :r99_slot

-- CANDIDATE NEW ROWS. R handed to the colleague and R moved to a patient id no
-- patient has (the new side of two UPDATEs), and four INSERTs: in the actor's own name for P, in the colleague's name for
-- P, in the actor's own name for Q, and in the actor's own name for P under a
-- tenant id no tenant has. Each is read through a derived table named
-- clinical_records, so the catalogue's rendering reads it unchanged.
WITH cand(kind, doc) AS (VALUES
  ('own_p',   jsonb_build_object('id', :'nil_id', 'tenant_id', :'tenant', 'patient_id', :'patient_id',
                                 'practitioner_id', :'actor_id', 'status', 'draft', 'source', 'manual')),
  ('other_p', jsonb_build_object('id', :'nil_id', 'tenant_id', :'tenant', 'patient_id', :'patient_id',
                                 'practitioner_id', lower(:'other_raw'), 'status', 'draft', 'source', 'manual')),
  ('own_q',   jsonb_build_object('id', :'nil_id', 'tenant_id', :'tenant', 'patient_id', :'q_id',
                                 'practitioner_id', :'actor_id', 'status', 'draft', 'source', 'manual')),
  ('phantom', jsonb_build_object('id', :'nil_id', 'tenant_id', :'nil_id', 'patient_id', :'patient_id',
                                 'practitioner_id', :'actor_id', 'status', 'draft', 'source', 'manual'))
), c AS (
  SELECT cand.kind, nr.*
    FROM cand CROSS JOIN LATERAL jsonb_populate_record(NULL::public.clinical_records, cand.doc) nr
), handed AS (
  SELECT nr.*
    FROM public.clinical_records x
    CROSS JOIN LATERAL jsonb_populate_record(x, jsonb_build_object('practitioner_id', lower(:'other_raw'))) nr
   WHERE x.id = :'reg_id'::uuid
), moved AS (
  SELECT nr.*
    FROM public.clinical_records x
    CROSS JOIN LATERAL jsonb_populate_record(x, jsonb_build_object('patient_id', :'nil_id')) nr
   WHERE x.id = :'reg_id'::uuid
), phantom AS (
  SELECT nr.*
    FROM public.clinical_records x
    CROSS JOIN LATERAL jsonb_populate_record(x, jsonb_build_object('tenant_id', :'nil_id')) nr
   WHERE x.id = :'reg_id'::uuid
)
SELECT (SELECT count(*)::int FROM c AS clinical_records WHERE kind = 'own_p'   AND (:e_ins)) AS w_i_own,
       (SELECT count(*)::int FROM c AS clinical_records WHERE kind = 'other_p' AND (:e_ins)) AS w_i_other,
       (SELECT count(*)::int FROM c AS clinical_records WHERE kind = 'own_q'   AND (:e_ins)) AS w_i_q,
       (SELECT count(*)::int FROM c AS clinical_records WHERE kind = 'phantom' AND (:e_ins)) AS w_i_phantom,
       (SELECT count(*)::int FROM handed AS clinical_records WHERE (:e_upd_chk))            AS w_hand,
       (SELECT count(*)::int FROM moved AS clinical_records WHERE (:e_upd_chk))             AS w_move,
       (SELECT count(*)::int FROM phantom AS clinical_records WHERE (:e_upd))               AS w_ph_u,
       (SELECT count(*)::int FROM phantom AS clinical_records WHERE (:e_upd_chk))           AS w_ph_uc,
       (SELECT count(*)::int FROM phantom AS clinical_records WHERE (:e_del))               AS w_ph_d
\gset :r99_slot

\endif

-- ===========================================================================
-- DRIVER, SECOND HALF: the verdicts. Skipped inside a pass.
-- ===========================================================================
\if :{?r99_pass}
\else

-- The subjects and the instrument, as booleans every later arm reads.
SELECT (:'patient_ok' = 'true' AND :'reg_ok' = 'true' AND :'distinct_ok' = 'true')::text AS s0_ok,
       (:'t1_is_ther' = 'true' AND (:'t1_treats' = 'true' OR :'t1_created_p' = 'true')
        AND :'t1_authored_r' = 'true')::text AS s1_ok,
       (:'t2_is_ther' = 'true' AND :'t2_treats' = 'true' AND :'t2_authored_r' = 'false')::text AS s2_ok,
       (:'t3_is_ther' = 'true' AND :'t3_treats' = 'false' AND :'t3_created_p' = 'false'
        AND :t3_authored_p = 0 AND :'t3_care_team' = 'false')::text AS s3_ok,
       (:'t1_uid_ok' = 'true' AND :'t2_uid_ok' = 'true' AND :'t3_uid_ok' = 'true'
        AND :'t1_sees_p' = (:'t1_treats' = 'true' OR :'t1_created_p' = 'true')::text
        AND :'t2_sees_p' = (:'t2_treats' = 'true' OR :'t2_created_p' = 'true')::text
        AND :'t3_sees_p' = (:'t3_treats' = 'true' OR :'t3_created_p' = 'true')::text
        AND :'exprs_read' = 'true')::text AS i1_ok \gset
SELECT (:'s0_ok' = 'true' AND :'s1_ok' = 'true' AND :'s2_ok' = 'true' AND :'s3_ok' = 'true'
        AND :'i1_ok' = 'true')::text AS all_ok \gset

WITH r(n, "check", observed, expected, verdict) AS (VALUES
  (0, '0. this transaction is READ ONLY and REPEATABLE READ',
      current_setting('transaction_read_only') || ' / ' || current_setting('transaction_isolation'),
      'on / repeatable read',
      CASE WHEN current_setting('transaction_read_only') = 'on'
            AND current_setting('transaction_isolation') = 'repeatable read' THEN 'OK' ELSE 'FAIL' END),
  (1, 'S0. the subjects exist: P live, an unsigned registo of P by T1, the actors passed are distinct',
      'P ' || CASE WHEN :'patient_ok' = 'true' THEN 'live' ELSE 'MISSING' END
      || ', T1 registo ' || CASE WHEN :'reg_ok' = 'true' THEN 'found' ELSE 'MISSING' END
      || ', actors ' || CASE WHEN :'distinct_ok' = 'true' THEN 'distinct' ELSE 'NOT DISTINCT' END,
      'P live, T1 registo found, actors distinct',
      CASE WHEN :'s0_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (2, 'S1. T1 is an active therapist who treats or created P and authored the subject registo',
      'therapist ' || :'t1_is_ther' || ', treats ' || :'t1_treats' || ', created ' || :'t1_created_p'
      || ', author ' || :'t1_authored_r',
      'therapist true, treats or created, author true',
      CASE WHEN :'s1_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (3, 'S2. T2 is an active therapist with an appointment with P, not the subject registo''s author',
      'therapist ' || :'t2_is_ther' || ', treats ' || :'t2_treats' || ', author ' || :'t2_authored_r',
      'therapist true, treats true, author false',
      CASE WHEN :'s2_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (4, 'S3. T3 is an active therapist with no appointment with P, did not create P, authored none of P''s registos, is not on P''s care team',
      'therapist ' || :'t3_is_ther' || ', treats ' || :'t3_treats' || ', created ' || :'t3_created_p'
      || ', authored ' || :'t3_authored_p' || ', care team ' || :'t3_care_team',
      'therapist true, treats false, created false, authored 0, care team false',
      CASE WHEN :'s3_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (5, 'I1. INSTRUMENT: each session is its actor; clinical_therapist_sees_patient(P) as each actor agrees with the tables; the write expressions were read',
      'T1 ' || :'t1_sees_p' || ', T2 ' || :'t2_sees_p' || ', T3 ' || :'t3_sees_p'
      || CASE WHEN :'t1_uid_ok' = 'true' AND :'t2_uid_ok' = 'true' AND :'t3_uid_ok' = 'true'
              THEN '; uid ok' ELSE '; uid IS SOMEBODY ELSE' END
      || CASE WHEN :'exprs_read' = 'true' THEN '; expressions read' ELSE '; an expression is MISSING' END,
      'T1 ' || (:'t1_treats' = 'true' OR :'t1_created_p' = 'true')::text
      || ', T2 ' || (:'t2_treats' = 'true' OR :'t2_created_p' = 'true')::text
      || ', T3 ' || (:'t3_treats' = 'true' OR :'t3_created_p' = 'true')::text || '; uid ok; expressions read',
      CASE WHEN :'i1_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (6, 'U1. UPDATE of the subject registo, the old row: T1 (the author) admitted, T2 and T3 not',
      'T1 ' || :'t1_w_u' || ', T2 ' || :'t2_w_u' || ', T3 ' || :'t3_w_u',
      'T1 1, T2 0, T3 0',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_u = 1 AND :t2_w_u = 0 AND :t3_w_u = 0 THEN 'OK' ELSE 'FAIL' END),
  (7, 'U2. UPDATE of the subject registo, the new row unchanged: T1 admitted, T2 and T3 not',
      'T1 ' || :'t1_w_uc' || ', T2 ' || :'t2_w_uc' || ', T3 ' || :'t3_w_uc',
      'T1 1, T2 0, T3 0',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_uc = 1 AND :t2_w_uc = 0 AND :t3_w_uc = 0 THEN 'OK' ELSE 'FAIL' END),
  (8, 'U3. UPDATE of the subject registo handing it to T2, written by T1: refused; control U2 T1',
      'T1 hands to T2 ' || :'t1_w_hand' || '; control U2 T1 ' || :'t1_w_uc',
      'T1 hands to T2 0; control U2 T1 1',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_hand = 0 AND :t1_w_uc = 1 THEN 'OK' ELSE 'FAIL' END),
  (9, 'U4. UPDATE of the subject registo by T1 whose new row names a patient T1 neither treats nor created (an id no patient has): refused; control U2 T1',
      'T1 moves it ' || :'t1_w_move' || '; control U2 T1 ' || :'t1_w_uc',
      'T1 moves it 0; control U2 T1 1',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_move = 0 AND :t1_w_uc = 1 THEN 'OK' ELSE 'FAIL' END),
  (10, 'D1. DELETE of the subject registo: T1 admitted, T2 and T3 not',
      'T1 ' || :'t1_w_d' || ', T2 ' || :'t2_w_d' || ', T3 ' || :'t3_w_d',
      'T1 1, T2 0, T3 0',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_d = 1 AND :t2_w_d = 0 AND :t3_w_d = 0 THEN 'OK' ELSE 'FAIL' END),
  (11, 'N1. INSERT in the actor''s own name for P: T1 and T2 admitted (they treat P), T3 not',
      'T1 ' || :'t1_w_i_own' || ', T2 ' || :'t2_w_i_own' || ', T3 ' || :'t3_w_i_own',
      'T1 1, T2 1, T3 0',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_i_own = 1 AND :t2_w_i_own = 1 AND :t3_w_i_own = 0 THEN 'OK' ELSE 'FAIL' END),
  (12, 'N2. INSERT in a colleague''s name for P (T1 naming T2, T2 naming T1, T3 naming T1): all refused; control N1',
      'T1 ' || :'t1_w_i_other' || ', T2 ' || :'t2_w_i_other' || ', T3 ' || :'t3_w_i_other'
      || '; control N1 ' || :'t1_w_i_own' || '/' || :'t2_w_i_own',
      'T1 0, T2 0, T3 0; control N1 1/1',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_i_other = 0 AND :t2_w_i_other = 0 AND :t3_w_i_other = 0
            AND :t1_w_i_own = 1 AND :t2_w_i_own = 1 THEN 'OK' ELSE 'FAIL' END),
  (13, 'N3. INSERT in T3''s own name for a patient T3 treats or created: admitted; the control for N1''s T3',
      CASE WHEN :'q_ok' = 'true' THEN 'T3 ' || :'t3_w_i_q' ELSE 'no such patient' END,
      'T3 1',
      CASE WHEN :'all_ok' <> 'true' THEN 'FAIL'
           WHEN :'q_ok' <> 'true' THEN 'VACUOUS'
           WHEN :t3_w_i_q = 1 THEN 'OK' ELSE 'FAIL' END),
  (14, 'N4. INSERT in the actor''s own name for P under a tenant id no tenant has: refused for every actor; control N1',
      'T1 ' || :'t1_w_i_phantom' || ', T2 ' || :'t2_w_i_phantom' || ', T3 ' || :'t3_w_i_phantom',
      'T1 0, T2 0, T3 0',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_i_phantom = 0 AND :t2_w_i_phantom = 0 AND :t3_w_i_phantom = 0
            AND :t1_w_i_own = 1 THEN 'OK' ELSE 'FAIL' END),
  (15, 'X1. every actor: the registos of its tenant its UPDATE admits are EXACTLY the ones it authored',
      'T1 ' || :'t1_x_u_n' || CASE WHEN :'t1_x_u_md5' = :'t1_x_auth_md5' THEN ' same' ELSE ' DIFFERENT' END
      || ', T2 ' || :'t2_x_u_n' || CASE WHEN :'t2_x_u_md5' = :'t2_x_auth_md5' THEN ' same' ELSE ' DIFFERENT' END
      || ', T3 ' || :'t3_x_u_n' || CASE WHEN :'t3_x_u_md5' = :'t3_x_auth_md5' THEN ' same' ELSE ' DIFFERENT' END,
      'T1 ' || :'t1_x_auth_n' || ' same, T2 ' || :'t2_x_auth_n' || ' same, T3 ' || :'t3_x_auth_n' || ' same',
      CASE WHEN :'all_ok' = 'true'
            AND :'t1_x_u_md5' = :'t1_x_auth_md5' AND :'t2_x_u_md5' = :'t2_x_auth_md5' AND :'t3_x_u_md5' = :'t3_x_auth_md5'
            AND :t1_x_u_n = :t1_x_auth_n AND :t2_x_u_n = :t2_x_auth_n AND :t3_x_u_n = :t3_x_auth_n
            AND :t1_x_auth_n >= 1 THEN 'OK' ELSE 'FAIL' END),
  (16, 'X2. every actor: the registos of its tenant its DELETE admits are EXACTLY the ones it authored',
      'T1 ' || :'t1_x_d_n' || CASE WHEN :'t1_x_d_md5' = :'t1_x_auth_md5' THEN ' same' ELSE ' DIFFERENT' END
      || ', T2 ' || :'t2_x_d_n' || CASE WHEN :'t2_x_d_md5' = :'t2_x_auth_md5' THEN ' same' ELSE ' DIFFERENT' END
      || ', T3 ' || :'t3_x_d_n' || CASE WHEN :'t3_x_d_md5' = :'t3_x_auth_md5' THEN ' same' ELSE ' DIFFERENT' END,
      'T1 ' || :'t1_x_auth_n' || ' same, T2 ' || :'t2_x_auth_n' || ' same, T3 ' || :'t3_x_auth_n' || ' same',
      CASE WHEN :'all_ok' = 'true'
            AND :'t1_x_d_md5' = :'t1_x_auth_md5' AND :'t2_x_d_md5' = :'t2_x_auth_md5' AND :'t3_x_d_md5' = :'t3_x_auth_md5'
            AND :t1_x_d_n = :t1_x_auth_n AND :t2_x_d_n = :t2_x_auth_n AND :t3_x_d_n = :t3_x_auth_n
            AND :t1_x_auth_n >= 1 THEN 'OK' ELSE 'FAIL' END),
  (17, 'Z1. the author''s own subject registo under a tenant id no tenant has: UPDATE (both sides) and DELETE refuse it; control U1, U2, D1 T1',
      'U=' || :'t1_w_ph_u' || ' UC=' || :'t1_w_ph_uc' || ' D=' || :'t1_w_ph_d'
      || '; control ' || :'t1_w_u' || '/' || :'t1_w_uc' || '/' || :'t1_w_d',
      'U=0 UC=0 D=0; control 1/1/1',
      CASE WHEN :'all_ok' = 'true' AND :t1_w_ph_u = 0 AND :t1_w_ph_uc = 0 AND :t1_w_ph_d = 0
            AND :t1_w_u = 1 AND :t1_w_uc = 1 AND :t1_w_d = 1 THEN 'OK' ELSE 'FAIL' END),
  (18, 'A1. an unclaimed AI draft of P: no actor''s UPDATE admits it (the claim function is the one way in)',
      CASE WHEN :'ai_ok' = 'true' THEN 'T1 ' || :'t1_w_ai_u' || ', T2 ' || :'t2_w_ai_u' || ', T3 ' || :'t3_w_ai_u'
           ELSE 'no unclaimed AI draft of P' END,
      'T1 0, T2 0, T3 0',
      CASE WHEN :'all_ok' <> 'true' THEN 'FAIL'
           WHEN :'ai_ok' <> 'true' THEN 'VACUOUS'
           WHEN :t1_w_ai_u = 0 AND :t2_w_ai_u = 0 AND :t3_w_ai_u = 0 THEN 'OK' ELSE 'FAIL' END),
  (19, 'R1. reads are unchanged: T1 and T2 read the subject registo, T3 does not',
      'T1 ' || :'t1_r_read' || ', T2 ' || :'t2_r_read' || ', T3 ' || :'t3_r_read',
      'T1 1, T2 1, T3 0',
      CASE WHEN :'all_ok' = 'true' AND :t1_r_read = 1 AND :t2_r_read = 1 AND :t3_r_read = 0 THEN 'OK' ELSE 'FAIL' END)
), shown AS (
  -- The mode: every arm, or arm 0, S0 to S3 and I1 only (-v subjects_only=on).
  SELECT * FROM r WHERE :r99_all OR n <= 5
)
SELECT n, "check", observed, expected, verdict FROM shown
UNION ALL
SELECT 99, 'SUMMARY. the verdict profile this run printed',
       (SELECT count(*) FROM shown WHERE verdict = 'OK')      || ' OK / ' ||
       (SELECT count(*) FROM shown WHERE verdict = 'VACUOUS') || ' VACUOUS / ' ||
       (SELECT count(*) FROM shown WHERE verdict = 'FAIL')    || ' FAIL',
       (SELECT count(*) FROM shown) || ' arms', 'SUMMARY'
ORDER BY 1;

ROLLBACK;

\endif
