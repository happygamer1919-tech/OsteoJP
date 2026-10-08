-- 0104 PRE-CHECK: the clinical_episodes policies follow the roles.
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only: no
-- name, no title and no clinical text of anyone is printed.
--
-- EVERY VERDICT IS OK, VACUOUS OR FAIL, and the SUMMARY row prints the profile:
--     N OK / M VACUOUS / K FAIL
-- The caller asserts the PROFILE, never "no VACUOUS". Fifteen verdicts. Every one
-- tests FAIL first, then VACUOUS, then OK: a zero comparand may not print OK, and
-- it may never hide a failure. On a database at production's position that
-- holds episodes and one active member of staff of each role it reads
-- 15 OK / 0 VACUOUS / 0 FAIL. Where the table holds no episode, or a role has no
-- active member of staff in the tenant read, verdict 14 reads VACUOUS, never OK:
-- 14 OK / 1 VACUOUS / 0 FAIL. Fourteen CARRY rows feed the post-check, and the
-- INFO rows print a profile and are never counted.
--
-- WHAT 0104 DOES (packages/db/migrations-pending/NEXT-AFTER-0103_clinical_episodes_role_matrix.sql,
-- sha256 eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9, to be promoted to
-- packages/db/migrations/0104_clinical_episodes_role_matrix.sql with no byte
-- changed): the two SET LOCAL lines; REVOKE DELETE on public.clinical_episodes
-- from `authenticated`; DROP POLICY clinical_episodes_tenant_isolation; and, as
-- its LAST THREE statements, CREATE POLICY clinical_episodes_select,
-- clinical_episodes_insert and clinical_episodes_update, each TO authenticated.
-- No function, no column, no row.
--
-- SO THIS FILE PROVES THE STARTING POINT EXACTLY:
--   0      the transaction is READ ONLY (the server refuses writes);
--   1      0104 is absent from the journal, by hash. CONTROL: the same count over
--          0103's hash reads 1 (verdict 2's subject), so the count can find a row;
--   2      0103 is present by hash ONCE, it is the NEWEST row by id, and its
--          created_at is 0103's journal when (-v prev_hash, -v prev_when, both
--          passed in by the block from the promoted journal; this file refuses to
--          guess either);
--   3      journal_rows_before: exactly 101 (0000 to 0103; the numbering has gaps);
--   4      the session is `postgres`, the owner of the table and of every policy
--          on it. CONTROL: `authenticated` is NOT a member of it;
--   5      THE SESSION READS THIS TABLE PAST ITS POLICIES: it has BYPASSRLS, or is
--          a superuser, or owns the table while row level security is not FORCED
--          on it. Every count below, and every owner-run script that connects the
--          same way, rests on that; the transaction also sets row_security = off,
--          so a session that does not bypass it ERRORs on its first read instead
--          of reading a filtered zero. CONTROL: the same test reads false for
--          `authenticated`;
--   6      THE TABLE: owned by `postgres`, row level security ENABLED and not
--          FORCED, and no trigger on it. CONTROL: the same trigger read finds
--          clinical_records_enforce_immutability on clinical_records;
--   7      the staff policy 0104 drops is there exactly as 0001 left it:
--          clinical_episodes_tenant_isolation, PERMISSIVE, TO authenticated, its
--          command and its two expressions pinned by md5 of Postgres 17's
--          rendering. A different policy on production means the DROP would
--          remove something this file was not written against: STOP;
--   8      the OTHER policy is as 0010 left it (clinical_episodes_patient_selfscope,
--          FOR SELECT, TO patient, pinned by md5), the table carries exactly two
--          policies, none RESTRICTIVE, and none is named as 0104's three are. The
--          post-check wants this one unchanged and four in all;
--   9      THE PRIVILEGES ON THE TABLE: `authenticated` holds exactly DELETE,
--          INSERT, SELECT, UPDATE; `patient` exactly SELECT; `anon` nothing; no
--          column of the table carries a column-level grant. 0104 takes DELETE
--          from `authenticated` and touches nothing else. CONTROL: the same read
--          finds that `postgres`, the owner, holds all eight;
--   10     EVERY FUNCTION 0104'S POLICIES CALL EXISTS AS THE MIGRATIONS LEFT IT:
--          jwt_tenant_id(), jwt_role(), clinical_admin_sees_patient(uuid),
--          clinical_therapist_sees_patient(uuid) and
--          viewer_care_team_patient_ids_at_my_clinics(), each with its SECURITY
--          DEFINER flag, volatility, search_path, owner, EXECUTE for
--          `authenticated` and body md5; and auth.uid() exists and
--          `authenticated` may execute it. CONTROL: a planted name resolves to
--          nothing;
--   11     secdef_functions_before: 36 SECURITY DEFINER functions in `public`,
--          every one owned by `postgres`. 0104 creates none, so the post-check
--          wants the same number and no count GATE-CHANGE follows the apply;
--   12     THE SERVER IS POSTGRES 17, the version on which every md5 pin of a
--          rendered expression here and in the post-check was read (17.6, the
--          build lane's local stack). CONTROL: server_version_num parses;
--   13     the five roles the checks name exist (`postgres`, `authenticated`,
--          `anon`, `patient`, `service_role`);
--   14     THE BEHAVIOUR READ RAN, AS ONE REAL ACTOR PER STAFF ROLE. In the tenant
--          that holds the most episodes, the lowest-id ACTIVE member of staff of
--          each of the four roles (for an admin and a receptionist, one with a
--          clinic assignment when there is one; for a therapist, one with an
--          appointment when there is one) is impersonated inside this READ ONLY
--          transaction: its claims are set, the identity is checked BEFORE
--          anything is read as it (auth.uid(), jwt_tenant_id() and jwt_role() must
--          answer for that actor, or the file STOPs), the role is set to
--          `authenticated`, the table is counted, and the role is reset. OK when
--          all four actors exist and the tenant holds episodes; VACUOUS when the
--          table is empty or a role has no active member of staff (a missing
--          subject is never a pass). The four counts are INFO rows, and the
--          post-check reads the same four actors again;
--   CARRY  journal_rows_before;
--   CARRY  policies_before: every policy in the database. The post-check wants
--          this number plus 2 (one dropped, three created);
--   CARRY  other_policies_md5: one md5 over every policy in the database EXCEPT
--          the staff policies of public.clinical_episodes (every policy of that
--          table but clinical_episodes_patient_selfscope);
--   CARRY  functions_md5: every function in `public` (signature, SECURITY
--          DEFINER, volatility, owner, settings, body md5, ACL), one md5;
--   CARRY  secdef_before: verdict 11's number;
--   CARRY  relation_acl_md5: every privilege on every relation in `public`, one
--          md5, WITHOUT the one item 0104 removes (DELETE for `authenticated` on
--          clinical_episodes). A NULL relacl reads as acldefault() of the
--          relation's own object type: code 's' for a sequence, 'r' otherwise;
--   CARRY  column_acl_md5: every column privilege in `public`, one md5;
--   CARRY  default_acl_md5: every default privilege in the database, one md5;
--   CARRY  triggers_md5: every trigger in `public` that is not an internal one;
--   CARRY  tables_before: the ordinary and partitioned tables in `public`;
--   CARRY  episodes_rows and episodes_md5: the row count of the table and one md5
--          over every row of it. 0104 writes no row, so the post-check wants both
--          unchanged. The md5 is printed; no row is;
--   CARRY  behaviour_tenant_md5 and behaviour_actors_md5: the md5 of the tenant
--          and of the four actor ids verdict 14 read as (an id is never printed).
--          The post-check picks its actors by the same rule and wants the same
--          two md5s, so both files read as the same four people;
--   INFO   the server version;
--   INFO   what `service_role` holds on the table (0104 leaves it; no migration
--          names it);
--   INFO   THE PROFILE, counts only: episodes by status; named by the import
--          ledger or not; with no practitioner; active admins and active
--          receptionists with no clinic assignment (the clinic arm of 0104's read
--          policy admits such a session to nothing); registos filed in an episode,
--          and how many of those are in an episode of another patient or tenant;
--   INFO   THE BEHAVIOUR, per role, for verdict 14's actor: the episodes it reads
--          now, the episodes of its tenant, and the episodes 0104's read policy
--          admits for it, computed FROM THE TABLES (not through the helper
--          functions): what the post-check will compare its own read to;
--   INFO   idle_in_transaction_session_timeout, as this session reads it;
--   INFO   supautils.policy_grants, read ONCE with current_setting(name, true):
--          each role it names, the COUNT of tables named for that role, and
--          whether auth.users is among them. Those are the tables a CREATE POLICY
--          run by that role locks ACCESS EXCLUSIVE until the COMMIT (measured on a
--          local stack on 2026-10-03). It can never fail this file.
--
-- A MISSING SUBJECT IS A STOP, NEVER A QUIET VERDICT: without the table, the
-- roles, the journal table or a function named in verdict 14's identity check,
-- the statement is an error and psql exits 3 before any verdict prints.
--
-- Run (the stage 1 block builds both values itself):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v prev_hash=<0103's sha256> -v prev_when=<0103's journal when>
--        -f scripts/db/precheck-0104-episode-policies.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?prev_hash}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_hash is missing (the sha256 of 0103 as applied). This file refuses to guess.';
  END $missing$;
\endif
\if :{?prev_when}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_when is missing (0103''s journal when). This file refuses to guess.';
  END $missing$;
\endif

BEGIN READ ONLY;
-- Verdict 5's control against a filtered zero: a session that does not bypass
-- row level security ERRORs on its first read of an RLS table here.
SET LOCAL row_security = off;

-- ONE READ of the platform's policy_grants setting, for the sitting. It decides
-- nothing. set_config(..., true) is transaction-local and is allowed in a READ
-- ONLY transaction.
DO $grants$
DECLARE
  v    text;
  doc  jsonb;
  info text;
BEGIN
  BEGIN
    v := current_setting('supautils.policy_grants', true);
    IF v IS NULL OR btrim(v) = '' THEN
      info := 'not set';
    ELSE
      doc := v::jsonb;
      IF jsonb_typeof(doc) <> 'object' THEN
        info := 'set, JSON but not an object';
      ELSE
        SELECT coalesce(string_agg(e.key || ': ' || CASE WHEN jsonb_typeof(e.value) = 'array' THEN jsonb_array_length(e.value)::text || ' tables' ELSE 'not a list' END
                                   || ', auth.users ' || CASE WHEN jsonb_typeof(e.value) = 'array' AND e.value @> '["auth.users"]'::jsonb THEN 'yes' ELSE 'no' END,
                                   '; ' ORDER BY e.key), 'set, names no role')
          INTO info
          FROM jsonb_each(doc) e;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    info := 'could not be read as JSON or at all (SQLSTATE ' || SQLSTATE || ')';
  END;
  PERFORM set_config('ep0104.policy_grants_info', info, true);
END
$grants$;

-- VERDICT 14, THE BEHAVIOUR READ. One actor per staff role, in the tenant that
-- holds the most episodes. Each actor's claims are set, the identity is checked
-- BEFORE the role changes, the table is counted as `authenticated` with row
-- level security back on, and the role is reset. Nothing is written: SET LOCAL
-- and set_config(..., true) end with the transaction.
DO $behaviour$
DECLARE
  v_tenant uuid;
  v_role   text;
  v_actor  uuid;
  v_reads  integer;
BEGIN
  SELECT e.tenant_id INTO v_tenant
    FROM public.clinical_episodes e
   GROUP BY e.tenant_id
   ORDER BY count(*) DESC, e.tenant_id
   LIMIT 1;
  PERFORM set_config('ep0104.tenant', coalesce(v_tenant::text, ''), true);

  FOREACH v_role IN ARRAY ARRAY['owner', 'admin', 'reception', 'therapist'] LOOP
    v_actor := NULL;
    v_reads := NULL;
    IF v_tenant IS NOT NULL THEN
      SELECT u.id INTO v_actor
        FROM public.users u
        JOIN public.roles r ON r.id = u.role_id AND r.tenant_id = u.tenant_id
       WHERE u.tenant_id = v_tenant AND u.is_active AND r.slug = v_role
       ORDER BY CASE
                  WHEN v_role IN ('admin', 'reception')
                    THEN EXISTS (SELECT 1 FROM public.staff_locations sl
                                  WHERE sl.user_id = u.id AND sl.tenant_id = u.tenant_id)
                  WHEN v_role = 'therapist'
                    THEN EXISTS (SELECT 1 FROM public.appointments a
                                  WHERE a.tenant_id = u.tenant_id
                                    AND (a.practitioner_id = u.id OR a.practitioner_2_id = u.id))
                  ELSE true
                END DESC,
                u.id
       LIMIT 1;
    END IF;
    IF v_actor IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims',
                         json_build_object('tenant_id', v_tenant, 'user_role', v_role, 'sub', v_actor)::text, true);
      -- auth.uid() and auth.jwt() prefer session-level request.jwt.claim.sub and
      -- request.jwt.claim over the blob set above, so a pooler leftover could
      -- make the helpers answer for someone else.
      IF NOT (coalesce((SELECT auth.uid()) = v_actor, false)
              AND coalesce((SELECT public.jwt_tenant_id()) = v_tenant, false)
              AND coalesce((SELECT public.jwt_role()) = v_role, false)) THEN
        RAISE EXCEPTION 'STOP: the session is not the identity this file set for the % actor: auth.uid(), jwt_tenant_id() or jwt_role() answers for someone else. Nothing was read as that actor. Reconnect.', v_role;
      END IF;
      SET LOCAL row_security = on;
      SET LOCAL ROLE authenticated;
      SELECT count(*)::int INTO v_reads FROM public.clinical_episodes;
      RESET ROLE;
      SET LOCAL row_security = off;
    END IF;
    PERFORM set_config('ep0104.actor_' || v_role, coalesce(v_actor::text, ''), true);
    PERFORM set_config('ep0104.reads_' || v_role, coalesce(v_reads::text, ''), true);
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END
$behaviour$;

\echo ''
\echo '=== 0104 EPISODE POLICIES PRE-CHECK: read the SUMMARY row last (15 OK / 0 VACUOUS / 0 FAIL where the table holds episodes and every role has an actor) ==='

WITH pol AS (
  SELECT p.polname::text AS polname, p.polcmd::text AS cmd, p.polpermissive AS permissive,
         coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '') AS to_roles,
         coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')      AS qual_md5,
         coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-') AS check_md5
    FROM pg_policy p
   WHERE p.polrelid = 'public.clinical_episodes'::regclass
), rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public'
), def_items AS (
  SELECT d.defaclrole, d.defaclnamespace, d.defaclobjtype::text AS objtype, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
), verbs (verb) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
), fn_wanted (sig) AS (
  VALUES ('public.jwt_tenant_id()'), ('public.jwt_role()'), ('public.clinical_admin_sees_patient(uuid)'),
         ('public.clinical_therapist_sees_patient(uuid)'), ('public.viewer_care_team_patient_ids_at_my_clinics()')
), fn_shape AS (
  SELECT w.sig,
         CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END || '/' || p.provolatile::text || '/'
           || coalesce(array_to_string(p.proconfig, ','), '') || '/' || pg_get_userbyid(p.proowner) || '/'
           || CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'exec' ELSE 'NOEXEC' END
           || ' ' || md5(p.prosrc) AS shape
    FROM fn_wanted w
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(w.sig)
), act AS (
  -- Verdict 14's actors, as the behaviour block stored them. An empty string is "no actor".
  SELECT v.role_slug,
         nullif(current_setting('ep0104.tenant', true), '')::uuid                    AS tenant,
         nullif(current_setting('ep0104.actor_' || v.role_slug, true), '')::uuid     AS actor,
         nullif(current_setting('ep0104.reads_' || v.role_slug, true), '')::int      AS reads
    FROM (VALUES ('owner'), ('admin'), ('reception'), ('therapist')) v(role_slug)
), linked AS (
  -- A patient linked to one of the actor's clinics, FROM THE TABLES: an
  -- appointment of the patient (first slot) at one of them, or, only when the
  -- patient has no appointment with a location, the primary location among them.
  SELECT a.role_slug, p.id AS patient_id
    FROM act a
    JOIN public.patients p ON p.tenant_id = a.tenant
   WHERE a.actor IS NOT NULL
     AND (EXISTS (SELECT 1
                    FROM public.appointments ap
                    JOIN public.staff_locations sl ON sl.location_id = ap.location_id AND sl.tenant_id = ap.tenant_id
                   WHERE ap.patient_id = p.id AND ap.tenant_id = a.tenant
                     AND ap.location_id IS NOT NULL AND sl.user_id = a.actor)
          OR (NOT EXISTS (SELECT 1 FROM public.appointments ap2
                           WHERE ap2.patient_id = p.id AND ap2.tenant_id = a.tenant AND ap2.location_id IS NOT NULL)
              AND EXISTS (SELECT 1 FROM public.staff_locations sl2
                           WHERE sl2.location_id = p.primary_location_id AND sl2.tenant_id = p.tenant_id
                             AND sl2.user_id = a.actor)))
), admits AS (
  -- What 0104's read policy admits for each actor, FROM THE TABLES.
  SELECT a.role_slug, a.actor, a.reads,
         (SELECT count(*)::int FROM public.clinical_episodes e WHERE e.tenant_id = a.tenant) AS tenant_total,
         (SELECT count(*)::int
            FROM public.clinical_episodes e
           WHERE e.tenant_id = a.tenant
             AND CASE a.role_slug
                   WHEN 'owner' THEN true
                   WHEN 'admin' THEN EXISTS (SELECT 1 FROM linked l WHERE l.role_slug = a.role_slug AND l.patient_id = e.patient_id)
                   WHEN 'reception' THEN EXISTS (SELECT 1 FROM linked l WHERE l.role_slug = a.role_slug AND l.patient_id = e.patient_id)
                   WHEN 'therapist' THEN
                        EXISTS (SELECT 1 FROM public.patients p
                                 WHERE p.id = e.patient_id AND p.tenant_id = a.tenant AND p.created_by = a.actor)
                     OR EXISTS (SELECT 1 FROM public.appointments ap
                                 WHERE (ap.patient_id = e.patient_id OR ap.patient_2_id = e.patient_id)
                                   AND ap.tenant_id = a.tenant
                                   AND (ap.practitioner_id = a.actor OR ap.practitioner_2_id = a.actor))
                     OR (EXISTS (SELECT 1 FROM public.patient_care_team ct
                                  WHERE ct.patient_id = e.patient_id AND ct.tenant_id = a.tenant
                                    AND ct.user_id = a.actor AND ct.removed_at IS NULL)
                         AND EXISTS (SELECT 1 FROM linked l WHERE l.role_slug = a.role_slug AND l.patient_id = e.patient_id))
                   ELSE false
                 END) AS admitted
    FROM act a
), j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                                   AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9')                                                      AS has_0104,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations WHERE hash = :'prev_hash')          AS has_0103,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)                   AS newest_hash,
    (SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)       AS newest_when,
    current_user::text                                                                         AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                       AS auth_in_me,
    (SELECT (r.rolbypassrls OR r.rolsuper
             OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c
      WHERE r.rolname = current_user AND c.oid = 'public.clinical_episodes'::regclass)           AS me_past_rls,
    (SELECT (r.rolbypassrls OR r.rolsuper
             OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c
      WHERE r.rolname = 'authenticated' AND c.oid = 'public.clinical_episodes'::regclass)        AS auth_past_rls,
    (SELECT pg_get_userbyid(c.relowner) || ' rls=' || c.relrowsecurity::text || ' forced=' || c.relforcerowsecurity::text
       FROM pg_class c WHERE c.oid = 'public.clinical_episodes'::regclass)                       AS table_shape,
    (SELECT count(*)::int FROM pg_trigger t
      WHERE t.tgrelid = 'public.clinical_episodes'::regclass AND NOT t.tgisinternal)            AS table_triggers,
    (SELECT count(*)::int FROM pg_trigger t
      WHERE t.tgrelid = 'public.clinical_records'::regclass AND NOT t.tgisinternal
        AND t.tgname = 'clinical_records_enforce_immutability')                                 AS trigger_control,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_episodes_tenant_isolation')                           AS old_staff,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_episodes_patient_selfscope')                          AS patient_pol,
    (SELECT count(*)::int FROM pol)                                                             AS table_pols,
    (SELECT count(*)::int FROM pol WHERE NOT permissive)                                        AS restrictive_pols,
    (SELECT count(*)::int FROM pol
      WHERE polname IN ('clinical_episodes_select', 'clinical_episodes_insert', 'clinical_episodes_update')) AS new_names_taken,
    (SELECT coalesce(string_agg(v.verb, ',' ORDER BY v.verb), 'none') FROM verbs v
      WHERE has_table_privilege('authenticated', 'public.clinical_episodes', v.verb))            AS auth_privs,
    (SELECT coalesce(string_agg(v.verb, ',' ORDER BY v.verb), 'none') FROM verbs v
      WHERE has_table_privilege('patient', 'public.clinical_episodes', v.verb))                  AS patient_privs,
    (SELECT coalesce(string_agg(v.verb, ',' ORDER BY v.verb), 'none') FROM verbs v
      WHERE has_table_privilege('anon', 'public.clinical_episodes', v.verb))                     AS anon_privs,
    (SELECT coalesce(string_agg(v.verb, ',' ORDER BY v.verb), 'none') FROM verbs v
      WHERE has_table_privilege('service_role', 'public.clinical_episodes', v.verb))             AS service_privs,
    (SELECT count(*)::int FROM verbs v
      WHERE has_table_privilege('postgres', 'public.clinical_episodes', v.verb))                 AS owner_privs,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.clinical_episodes'::regclass AND a.attacl IS NOT NULL AND NOT a.attisdropped) AS column_grants,
    (SELECT string_agg(sig || ' ' || coalesce(shape, 'absent'), ' ; ' ORDER BY sig) FROM fn_shape)  AS helper_shapes,
    (to_regprocedure('auth.uid()') IS NOT NULL
      AND coalesce(has_function_privilege('authenticated', to_regprocedure('auth.uid()'), 'EXECUTE'), false)) AS uid_ok,
    (to_regprocedure('public.no_such_function_0104()') IS NULL)                                 AS planted_fn_absent,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres')  AS secdef_not_postgres,
    current_setting('server_version_num')::int                                                  AS server_num,
    current_setting('server_version')                                                           AS server_version,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('postgres', 'authenticated', 'anon', 'patient', 'service_role'))        AS roles_named,
    (SELECT count(*)::int FROM act WHERE actor IS NOT NULL)                                     AS actors_found,
    (SELECT coalesce(string_agg(role_slug, ',' ORDER BY role_slug), 'none') FROM act WHERE actor IS NULL) AS actors_missing,
    (SELECT coalesce(max(tenant_total), 0) FROM admits)                                         AS behaviour_total,
    (SELECT string_agg(role_slug || ' ' || coalesce(reads::text, 'no actor') || ' of ' || tenant_total::text
                       || ', 0104 admits ' || CASE WHEN actor IS NULL THEN 'no actor' ELSE admitted::text END,
                       '; ' ORDER BY role_slug) FROM admits)                                    AS behaviour_info,
    md5(coalesce(current_setting('ep0104.tenant', true), ''))                                   AS tenant_md5,
    (SELECT md5(string_agg(role_slug || '=' || coalesce(actor::text, 'none'), ',' ORDER BY role_slug)) FROM act) AS actors_md5,
    (SELECT count(*)::int FROM pg_policy)                                                       AS policies,
    (SELECT md5(coalesce(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname), ''))
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT (p.polrelid = 'public.clinical_episodes'::regclass
                 AND p.polname <> 'clinical_episodes_patient_selfscope'))                       AS other_pol_md5,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public')                                                               AS n_fn,
    (SELECT md5(coalesce(string_agg(
              p.oid::regprocedure::text || ':' || p.prosecdef::text || ':' || p.provolatile::text || ':'
              || pg_get_userbyid(p.proowner) || ':' || coalesce(array_to_string(p.proconfig, ','), '-') || ':'
              || md5(coalesce(p.prosrc, '')) || ':' || coalesce(p.proacl::text, '-'),
              ';' ORDER BY p.oid::regprocedure::text), ''))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')  AS fn_md5,
    (SELECT count(*)::int FROM rel_items
      WHERE NOT (rel = 'clinical_episodes' AND privilege_type = 'DELETE'
                 AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')))     AS n_rel_items,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || kind || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items
      WHERE NOT (rel = 'clinical_episodes' AND privilege_type = 'DELETE'
                 AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')))     AS rel_md5,
    (SELECT md5(coalesce(string_agg(
              c.oid::regclass::text || '.' || att.attname || ':' || pg_get_userbyid(a.grantor) || ':'
              || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ':'
              || a.privilege_type || ':' || a.is_grantable::text,
              ';' ORDER BY c.oid::regclass::text, att.attname, a.grantee, a.privilege_type), ''))
       FROM pg_attribute att
       JOIN pg_class c ON c.oid = att.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE n.nspname = 'public' AND att.attacl IS NOT NULL)                                   AS col_md5,
    (SELECT md5(coalesce(string_agg(
              pg_get_userbyid(defaclrole) || ':'
              || CASE WHEN defaclnamespace = 0 THEN 'GLOBAL' ELSE defaclnamespace::regnamespace::text END || ':'
              || objtype || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY pg_get_userbyid(defaclrole), defaclnamespace, objtype, grantee, privilege_type), ''))
       FROM def_items)                                                                         AS def_md5,
    (SELECT md5(coalesce(string_agg(
              c.oid::regclass::text || '.' || t.tgname || ':' || t.tgtype::text || ':' || t.tgenabled::text || ':'
              || t.tgfoid::regprocedure::text || ':' || coalesce(t.tgattr::text, '') || ':'
              || coalesce(md5(pg_get_triggerdef(t.oid)), '-'),
              ';' ORDER BY c.oid::regclass::text, t.tgname), ''))
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal)                                        AS trg_md5,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                    AS n_tables,
    (SELECT count(*)::int FROM public.clinical_episodes)                                        AS episodes_rows,
    (SELECT md5(coalesce(string_agg(md5((e.*)::text), '' ORDER BY e.id), ''))
       FROM public.clinical_episodes e)                                                         AS episodes_md5,
    (SELECT 'open ' || count(*) FILTER (WHERE e.status = 'open') || ', closed ' || count(*) FILTER (WHERE e.status = 'closed')
            || '; named by the import ledger ' || count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM public.migration_staging_rows s
                  WHERE s.entity_type = 'clinical_episode' AND s.imported_entity_id = e.id))
            || ', not named ' || count(*) FILTER (WHERE NOT EXISTS (
                 SELECT 1 FROM public.migration_staging_rows s
                  WHERE s.entity_type = 'clinical_episode' AND s.imported_entity_id = e.id))
            || '; with no practitioner ' || count(*) FILTER (WHERE e.primary_practitioner_id IS NULL)
       FROM public.clinical_episodes e)                                                         AS episodes_profile,
    (SELECT 'admins ' || count(*) FILTER (WHERE r.slug = 'admin') || ', receptionists ' || count(*) FILTER (WHERE r.slug = 'reception')
       FROM public.users u JOIN public.roles r ON r.id = u.role_id AND r.tenant_id = u.tenant_id
      WHERE u.is_active AND r.slug IN ('admin', 'reception')
        AND NOT EXISTS (SELECT 1 FROM public.staff_locations sl
                         WHERE sl.user_id = u.id AND sl.tenant_id = u.tenant_id))                AS no_clinic_profile,
    (SELECT 'in an episode ' || count(*) || ', of those in an episode of another patient or tenant '
            || count(*) FILTER (WHERE e.patient_id <> c.patient_id OR e.tenant_id <> c.tenant_id)
       FROM public.clinical_records c JOIN public.clinical_episodes e ON e.id = c.episode_id)   AS registo_profile,
    coalesce(current_setting('ep0104.policy_grants_info', true), 'the read did not run')        AS policy_grants_info,
    coalesce(current_setting('idle_in_transaction_session_timeout', true), 'not readable')      AS idle_in_tx
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only')                      AS observed,
         'on'                                                          AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. 0104 is absent from the journal, by hash (control: the same count finds 0103 once)',
         has_0104::text || '; control ' || has_0103::text, '0; control 1',
         CASE WHEN has_0104 = 0 AND has_0103 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. 0103 is present by hash, once, as the newest row, at its journal when',
         has_0103::text || ' row, newest ' || CASE WHEN newest_hash = :'prev_hash' THEN 'is 0103' ELSE 'is NOT 0103' END
           || ', when ' || coalesce(newest_when, 'none'),
         '1 row, newest is 0103, when ' || :'prev_when',
         CASE WHEN has_0103 = 1 AND newest_hash = :'prev_hash' AND newest_when = :'prev_when' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, 'journal_rows_before', journal_rows::text, '101',
         CASE WHEN journal_rows = 101 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. the session is postgres (control: authenticated is no member of it)',
         me || '; control ' || auth_in_me::text, 'postgres; control false',
         CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. this session reads clinical_episodes past its policies (control: authenticated does not)',
         coalesce(me_past_rls::text, 'unreadable') || '; control ' || coalesce(auth_past_rls::text, 'unreadable'),
         'true; control false',
         CASE WHEN coalesce(me_past_rls, false) AND auth_past_rls IS NOT DISTINCT FROM false THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. the table is owned by postgres, row level security ENABLED and not FORCED, no trigger (control: clinical_records has its trigger)',
         coalesce(table_shape, 'absent') || ', ' || table_triggers::text || ' triggers; control ' || trigger_control::text,
         'postgres rls=true forced=false, 0 triggers; control 1',
         CASE WHEN table_shape = 'postgres rls=true forced=false' AND table_triggers = 0 AND trigger_control = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. the staff policy 0104 drops is exactly as 0001 left it: FOR ALL, PERMISSIVE, TO authenticated, both expressions pinned',
         coalesce(old_staff, 'absent'),
         '*/true/authenticated 11ef341951d0d9b55ccd0acbb8d6a2e0 11ef341951d0d9b55ccd0acbb8d6a2e0',
         CASE WHEN old_staff = '*/true/authenticated 11ef341951d0d9b55ccd0acbb8d6a2e0 11ef341951d0d9b55ccd0acbb8d6a2e0'
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. the patient policy is exactly as 0010 left it; two policies on the table, none RESTRICTIVE, none named as 0104''s three',
         coalesce(patient_pol, 'absent') || '; ' || table_pols::text || ' policies, ' || restrictive_pols::text
           || ' restrictive, ' || new_names_taken::text || ' of 0104''s names taken',
         'r/true/patient 9b55a6d007d2226e2227be448d8b48a0 -; 2 policies, 0 restrictive, 0 of 0104''s names taken',
         CASE WHEN patient_pol = 'r/true/patient 9b55a6d007d2226e2227be448d8b48a0 -'
               AND table_pols = 2 AND restrictive_pols = 0 AND new_names_taken = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, '9. privileges on the table: authenticated DELETE,INSERT,SELECT,UPDATE; patient SELECT; anon none; no column grant (control: the owner holds all eight)',
         'authenticated ' || auth_privs || '; patient ' || patient_privs || '; anon ' || anon_privs || '; '
           || column_grants::text || ' column grants; control ' || owner_privs::text,
         'authenticated DELETE,INSERT,SELECT,UPDATE; patient SELECT; anon none; 0 column grants; control 8',
         CASE WHEN auth_privs = 'DELETE,INSERT,SELECT,UPDATE' AND patient_privs = 'SELECT' AND anon_privs = 'none'
               AND column_grants = 0 AND owner_privs = 8 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, '10. every function 0104''s policies call is as the migrations left it, and auth.uid() is executable (control: a planted name)',
         coalesce(helper_shapes, 'absent') || ' ; auth.uid() ' || uid_ok::text || '; control ' || planted_fn_absent::text,
         'public.clinical_admin_sees_patient(uuid) DEFINER/s/search_path=public/postgres/exec 278de3a836486f3950e9513baf5429b3 ; '
           || 'public.clinical_therapist_sees_patient(uuid) DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186 ; '
           || 'public.jwt_role() INVOKER/s//postgres/exec 9c6cc33575ca09119a9453a311c730a8 ; '
           || 'public.jwt_tenant_id() DEFINER/s/search_path=""/postgres/exec 1b33f5cc21935543ecd4802e403e2f4b ; '
           || 'public.viewer_care_team_patient_ids_at_my_clinics() DEFINER/s/search_path=public/postgres/exec 9539ec380f391d56af0d89c7998156db'
           || ' ; auth.uid() true; control true',
         CASE WHEN helper_shapes =
                   'public.clinical_admin_sees_patient(uuid) DEFINER/s/search_path=public/postgres/exec 278de3a836486f3950e9513baf5429b3 ; '
                || 'public.clinical_therapist_sees_patient(uuid) DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186 ; '
                || 'public.jwt_role() INVOKER/s//postgres/exec 9c6cc33575ca09119a9453a311c730a8 ; '
                || 'public.jwt_tenant_id() DEFINER/s/search_path=""/postgres/exec 1b33f5cc21935543ecd4802e403e2f4b ; '
                || 'public.viewer_care_team_patient_ids_at_my_clinics() DEFINER/s/search_path=public/postgres/exec 9539ec380f391d56af0d89c7998156db'
               AND uid_ok AND planted_fn_absent THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, 'secdef_functions_before', secdef::text || ', ' || secdef_not_postgres::text || ' not owned by postgres',
         '36, 0 not owned by postgres',
         CASE WHEN secdef = 36 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 12, '12. the server is Postgres 17, where every md5 pin of a rendered expression was read (control: the number parses)',
         server_num::text, '170000 to 179999',
         CASE WHEN server_num BETWEEN 170000 AND 179999 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 13, '13. the five roles the checks name exist', roles_named::text, '5',
         CASE WHEN roles_named = 5 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 14, '14. BEHAVIOUR: the table was read as one active actor of each staff role, identity checked first',
         actors_found::text || ' of 4 actors, missing ' || actors_missing || '; episodes in that tenant ' || behaviour_total::text,
         '4 of 4 actors, missing none; episodes in that tenant more than 0 (a missing actor or an empty table reads VACUOUS)',
         CASE WHEN actors_found = 4 AND behaviour_total > 0 THEN 'OK' ELSE 'VACUOUS' END FROM j
  UNION ALL SELECT 20, 'policies_before', policies::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 21, 'other_policies_md5', other_pol_md5, '32 hex characters',
         CASE WHEN other_pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 22, 'functions_md5', fn_md5, '32 hex characters, over ' || n_fn::text || ' functions in public',
         CASE WHEN fn_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 23, 'secdef_before', secdef::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 24, 'relation_acl_md5', rel_md5, '32 hex characters, over ' || n_rel_items::text || ' privileges',
         CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 25, 'column_acl_md5', col_md5, '32 hex characters',
         CASE WHEN col_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 26, 'default_acl_md5', def_md5, '32 hex characters',
         CASE WHEN def_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 27, 'triggers_md5', trg_md5, '32 hex characters',
         CASE WHEN trg_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 28, 'tables_before', n_tables::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 29, 'episodes_rows', episodes_rows::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 30, 'episodes_md5', episodes_md5, '32 hex characters, over ' || episodes_rows::text || ' rows',
         CASE WHEN episodes_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 31, 'behaviour_tenant_md5', tenant_md5, '32 hex characters',
         CASE WHEN tenant_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 32, 'behaviour_actors_md5', coalesce(actors_md5, 'absent'), '32 hex characters',
         CASE WHEN actors_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 40, 'INFO the server version', server_version, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 41, 'INFO what service_role holds on the table (0104 leaves it)', service_privs, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 42, 'INFO episodes: by status, by origin, with no practitioner (counts)', coalesce(episodes_profile, 'none'), 'a profile', 'INFO' FROM j
  UNION ALL SELECT 43, 'INFO active admins and receptionists with no clinic assignment (counts)', coalesce(no_clinic_profile, 'none'), 'a profile', 'INFO' FROM j
  UNION ALL SELECT 44, 'INFO registos filed in an episode (counts)', coalesce(registo_profile, 'none'), 'a profile', 'INFO' FROM j
  UNION ALL SELECT 45, 'INFO behaviour, per role: episodes the actor reads now, of its tenant''s, and what 0104''s read policy admits (from the tables)',
         coalesce(behaviour_info, 'none'), 'a profile', 'INFO' FROM j
  UNION ALL SELECT 46, 'INFO idle_in_transaction_session_timeout (0 is no limit)', idle_in_tx, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 47, 'INFO supautils.policy_grants, per role: tables named, and whether auth.users is one', policy_grants_info, 'a profile, never a verdict', 'INFO' FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         '15 OK / 0 VACUOUS / 0 FAIL; or 14 OK / 1 VACUOUS / 0 FAIL where the table is empty or a role has no actor', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;

\echo ''
\echo '=== FOR THE RECORD: the policies on clinical_episodes as the catalogue describes them ==='
SELECT p.polname, p.polcmd AS command, p.polpermissive AS permissive,
       array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ',') AS to_roles
  FROM pg_policy p
 WHERE p.polrelid = 'public.clinical_episodes'::regclass
 ORDER BY 1;

ROLLBACK;
