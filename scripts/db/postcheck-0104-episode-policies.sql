-- 0104 POST-CHECK: the clinical_episodes policies follow the roles.
-- READ ONLY. Run inside the block's own `begin read only`, so the server refuses
-- any write this file could contain; it STOPs when it is not. Catalogue facts and
-- counts only: no name, no title and no clinical text of anyone is printed.
--
-- EVERY VERDICT IS OK, VACUOUS OR FAIL, and the SUMMARY row prints the profile:
--     N OK / M VACUOUS / K FAIL
-- The caller asserts the PROFILE, never "no VACUOUS". Twenty-one verdicts. Every
-- one tests FAIL first, then VACUOUS, then OK: a zero comparand may not print OK,
-- and it may never hide a failure. After a correct apply on a database that holds
-- episodes, where each of the four actors reads at least one, it reads
-- 21 OK / 0 VACUOUS / 0 FAIL. A role with no active member of staff, or an actor
-- 0104's read policy admits to no episode, reads VACUOUS in its own verdict (17
-- to 20), never OK; on a table with no row verdict 14 reads VACUOUS as well.
--
-- A FAIL VERDICT ENDS THIS FILE WITH AN ERROR: after the rows are printed, the
-- file reads the profile it printed and raises unless it ends "0 FAIL", so psql
-- exits 3 and the block's own halt fires. The block still asserts the whole
-- profile, with the VACUOUS count the pre-check carried (post_vacuous_expected).
--
-- Runs after `packages/db/scripts/verified-migrate.mjs` has applied
-- 0104_clinical_episodes_role_matrix (sha256
-- eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9): DELETE was
-- revoked from `authenticated` on public.clinical_episodes, ONE policy was
-- dropped, THREE were created, and nothing else moved.
--
-- EXACT, NOT "LOOKS LIKE". Every policy expression is compared by md5 to the text
-- Postgres 17 renders for it; the expected values were read on the build lane's
-- local stack (17.6) with the migration applied. A LIKE would pass `... OR true`;
-- this does not. THE THREE NEW POLICIES, as the migration writes them (its section
-- 8), rendered by Postgres 17 as:
--   clinical_episodes_select   e56c6afdcd453e172d556efe502f338f  (USING)
--   clinical_episodes_insert   24a5332927cf671c59fb4f14556f541f  (WITH CHECK)
--   clinical_episodes_update   b8c39147324b1a181b715370cd6a1125  (USING)
--                              b8c39147324b1a181b715370cd6a1125  (WITH CHECK)
--
-- EVERY CHANGE 0104 MAKES IS ASSERTED, AND EVERYTHING ELSE IS ASSERTED UNCHANGED:
--   0      the transaction is READ ONLY;
--   1      clinical_episodes_select: FOR SELECT, PERMISSIVE, TO authenticated,
--          USING exactly 0104's expression (the owner; an admin or a receptionist,
--          for a patient linked to one of their clinics; a therapist, for a
--          patient they treat or created, or whose care team they are on at their
--          own clinics), no WITH CHECK;
--   2      clinical_episodes_insert: FOR INSERT, PERMISSIVE, TO authenticated,
--          WITH CHECK exactly 0104's expression (the owner; a therapist, in their
--          own name, for a patient they treat or created), no USING;
--   3      clinical_episodes_update: FOR UPDATE, PERMISSIVE, TO authenticated,
--          USING and WITH CHECK exactly 0104's one expression (the owner; a
--          therapist, for a patient they treat or created);
--   4      THE TABLE'S POLICIES ARE THOSE THREE AND THE PATIENT'S: four in all,
--          none RESTRICTIVE, none FOR ALL, none FOR DELETE, none named
--          clinical_episodes_tenant_isolation, and
--          clinical_episodes_patient_selfscope exactly as the pre-check pinned it;
--   5      THE PRIVILEGES ON THE TABLE: `authenticated` holds exactly INSERT,
--          SELECT, UPDATE (no DELETE); `patient` exactly SELECT; `anon` nothing;
--          no column-level grant. CONTROL: the owner still holds all eight;
--   6      the policy count in the database is policies_before + 2;
--   7      every OTHER policy in the database hashes to other_policies_md5.
--          VACUOUS over an empty set;
--   8      every function in `public` hashes to functions_md5, and the SECURITY
--          DEFINER count equals secdef_before, every one owned by `postgres`:
--          0104 creates and changes no function. VACUOUS over an empty set;
--   9      every OTHER privilege on every relation in `public` hashes to
--          relation_acl_md5 (computed, as in the pre-check, without DELETE for
--          `authenticated` on clinical_episodes). VACUOUS over an empty set;
--   10     every column privilege in `public` hashes to column_acl_md5. VACUOUS
--          over an empty set;
--   11     every default privilege in the database hashes to default_acl_md5.
--          VACUOUS over an empty set;
--   12     every trigger in `public` hashes to triggers_md5, the table still has
--          none, and the table count in `public` is tables_before;
--   13     the table is still owned by `postgres`, row level security ENABLED and
--          not FORCED;
--   14     NO ROW MOVED: the table holds episodes_rows rows and they hash to
--          episodes_md5. VACUOUS when the table is empty;
--   15     0104's sha256 is in the journal exactly once, as the newest row, and the
--          journal reads journal_rows_before + 1;
--   16     THE BEHAVIOUR READ IS OF THE SAME FOUR ACTORS AS THE PRE-CHECK'S: the
--          tenant and the four actor ids, picked by the same rule, hash to
--          behaviour_tenant_md5 and behaviour_actors_md5. VACUOUS when no actor
--          was found at all;
--   17-20  THE BEHAVIOUR, ONE VERDICT PER ROLE (owner, admin, reception,
--          therapist). Read as that actor, as `authenticated`, identity checked
--          first: the episodes it reads EQUAL the episodes 0104's read policy
--          admits for it, computed FROM THE TABLES and not through the helper
--          functions. For the owner that is every episode of the tenant; for an
--          admin and a receptionist, the episodes of the patients linked to one of
--          their clinics; for a therapist, the episodes of the patients they treat
--          or created, or whose care team they are on at their own clinics. For
--          the owner, an admin and a therapist those are the patients whose
--          registos the same actor reads at patient level. FAIL when the two
--          counts differ. VACUOUS when the role has no actor, or when both counts
--          are zero: an actor admitted to nothing proves no read.
-- Then, FOR THE RECORD, the policies on the table as the catalogue now describes
-- them.
--
-- NOT A STANDING INVARIANT for 6 to 12 and 14: the next migration that adds a
-- policy, a function, a grant, a trigger or a table, and the first episode a
-- therapist opens, move them. It is an assertion about this apply.
--
-- The carries come from THIS sitting's pre-check transcript; the block passes
-- each one with -v. A missing one STOPs (psql exit 3) before any verdict.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v journal_rows_before=<n> -v policies_before=<n> -v other_policies_md5=<md5>
--        -v functions_md5=<md5> -v secdef_before=<n> -v relation_acl_md5=<md5>
--        -v column_acl_md5=<md5> -v default_acl_md5=<md5> -v triggers_md5=<md5>
--        -v tables_before=<n> -v episodes_rows=<n> -v episodes_md5=<md5>
--        -v behaviour_tenant_md5=<md5> -v behaviour_actors_md5=<md5>
--        -c "begin read only" -f scripts/db/postcheck-0104-episode-policies.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?journal_rows_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v journal_rows_before is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?policies_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v policies_before is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?other_policies_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v other_policies_md5 is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?functions_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v functions_md5 is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?secdef_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v secdef_before is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?relation_acl_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v relation_acl_md5 is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?column_acl_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v column_acl_md5 is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?default_acl_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v default_acl_md5 is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?triggers_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v triggers_md5 is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?tables_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v tables_before is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?episodes_rows}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v episodes_rows is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?episodes_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v episodes_md5 is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?behaviour_tenant_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v behaviour_tenant_md5 is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif
\if :{?behaviour_actors_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v behaviour_actors_md5 is missing. The pre-check prints it; this file refuses to guess.'; END $missing$;
\endif

-- THIS FILE DOES NOT OPEN ITS OWN TRANSACTION, AND REFUSES TO RUN OUTSIDE ONE THAT
-- IS READ ONLY: the behaviour read keeps its answers in transaction-local
-- settings, which a statement run on its own would lose.
DO $readonly$ BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'STOP: this file runs only inside the block''s own "begin read only". Nothing was checked.';
  END IF;
END $readonly$;

-- A session that does not bypass row level security ERRORs on its first read of
-- an RLS table here, instead of reading a filtered zero.
SET LOCAL row_security = off;

-- VERDICTS 16 TO 20, THE BEHAVIOUR READ. The pre-check's own block, statement for
-- statement: one actor per staff role, in the tenant that holds the most
-- episodes. Each actor's claims are set, the identity is checked BEFORE the role
-- changes, the table is counted as `authenticated` with row level security back
-- on, and the role is reset. Nothing is written.
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
\echo '=== 0104 EPISODE POLICIES POST-CHECK: read the SUMMARY row last (21 OK / 0 VACUOUS / 0 FAIL where every actor reads at least one episode) ==='

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
), t AS (
  SELECT
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_episodes_select')                                     AS new_select,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_episodes_insert')                                     AS new_insert,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_episodes_update')                                     AS new_update,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_episodes_patient_selfscope')                          AS patient_pol,
    (SELECT coalesce(string_agg(polname, ',' ORDER BY polname), 'none') FROM pol)               AS table_pol_names,
    (SELECT count(*)::int FROM pol)                                                             AS table_pols,
    (SELECT count(*)::int FROM pol WHERE NOT permissive)                                        AS restrictive_pols,
    (SELECT count(*)::int FROM pol WHERE cmd IN ('*', 'd'))                                     AS all_or_delete_pols,
    (SELECT coalesce(string_agg(v.verb, ',' ORDER BY v.verb), 'none') FROM verbs v
      WHERE has_table_privilege('authenticated', 'public.clinical_episodes', v.verb))            AS auth_privs,
    (SELECT coalesce(string_agg(v.verb, ',' ORDER BY v.verb), 'none') FROM verbs v
      WHERE has_table_privilege('patient', 'public.clinical_episodes', v.verb))                  AS patient_privs,
    (SELECT coalesce(string_agg(v.verb, ',' ORDER BY v.verb), 'none') FROM verbs v
      WHERE has_table_privilege('anon', 'public.clinical_episodes', v.verb))                     AS anon_privs,
    (SELECT count(*)::int FROM verbs v
      WHERE has_table_privilege('postgres', 'public.clinical_episodes', v.verb))                 AS owner_privs,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.clinical_episodes'::regclass AND a.attacl IS NOT NULL AND NOT a.attisdropped) AS column_grants,
    (SELECT count(*)::int FROM pg_policy)                                                       AS policies_now,
    (SELECT count(*)::int FROM pg_policy p
      WHERE NOT (p.polrelid = 'public.clinical_episodes'::regclass
                 AND p.polname <> 'clinical_episodes_patient_selfscope'))                       AS n_other_pol,
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
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres')  AS secdef_not_postgres,
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
    (SELECT count(*)::int FROM pg_attribute att
       JOIN pg_class c ON c.oid = att.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE n.nspname = 'public' AND att.attacl IS NOT NULL)                                   AS n_col_items,
    (SELECT md5(coalesce(string_agg(
              c.oid::regclass::text || '.' || att.attname || ':' || pg_get_userbyid(a.grantor) || ':'
              || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ':'
              || a.privilege_type || ':' || a.is_grantable::text,
              ';' ORDER BY c.oid::regclass::text, att.attname, a.grantee, a.privilege_type), ''))
       FROM pg_attribute att
       JOIN pg_class c ON c.oid = att.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE n.nspname = 'public' AND att.attacl IS NOT NULL)                                   AS col_md5,
    (SELECT count(*)::int FROM def_items)                                                       AS n_def_items,
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
    (SELECT count(*)::int FROM pg_trigger tg
      WHERE tg.tgrelid = 'public.clinical_episodes'::regclass AND NOT tg.tgisinternal)          AS table_triggers,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                    AS n_tables,
    (SELECT pg_get_userbyid(c.relowner) || ' rls=' || c.relrowsecurity::text || ' forced=' || c.relforcerowsecurity::text
       FROM pg_class c WHERE c.oid = 'public.clinical_episodes'::regclass)                       AS table_shape,
    (SELECT count(*)::int FROM public.clinical_episodes)                                        AS episodes_rows,
    (SELECT md5(coalesce(string_agg(md5((e.*)::text), '' ORDER BY e.id), ''))
       FROM public.clinical_episodes e)                                                         AS episodes_md5,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                                   AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9')                                                      AS has_0104,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)                   AS newest_hash,
    (SELECT count(*)::int FROM act WHERE actor IS NOT NULL)                                     AS actors_found,
    md5(coalesce(current_setting('ep0104.tenant', true), ''))                                   AS tenant_md5,
    (SELECT md5(string_agg(role_slug || '=' || coalesce(actor::text, 'none'), ',' ORDER BY role_slug)) FROM act) AS actors_md5
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only')                      AS observed,
         'on'                                                          AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM t
  UNION ALL SELECT 1, '1. clinical_episodes_select: FOR SELECT, PERMISSIVE, TO authenticated, USING exactly 0104''s expression',
         coalesce(new_select, 'absent'), 'r/true/authenticated e56c6afdcd453e172d556efe502f338f -',
         CASE WHEN new_select = 'r/true/authenticated e56c6afdcd453e172d556efe502f338f -' THEN 'OK' ELSE 'FAIL' END FROM t
  UNION ALL SELECT 2, '2. clinical_episodes_insert: FOR INSERT, PERMISSIVE, TO authenticated, WITH CHECK exactly 0104''s expression',
         coalesce(new_insert, 'absent'), 'a/true/authenticated - 24a5332927cf671c59fb4f14556f541f',
         CASE WHEN new_insert = 'a/true/authenticated - 24a5332927cf671c59fb4f14556f541f' THEN 'OK' ELSE 'FAIL' END FROM t
  UNION ALL SELECT 3, '3. clinical_episodes_update: FOR UPDATE, PERMISSIVE, TO authenticated, USING and WITH CHECK exactly 0104''s one expression',
         coalesce(new_update, 'absent'), 'w/true/authenticated b8c39147324b1a181b715370cd6a1125 b8c39147324b1a181b715370cd6a1125',
         CASE WHEN new_update = 'w/true/authenticated b8c39147324b1a181b715370cd6a1125 b8c39147324b1a181b715370cd6a1125' THEN 'OK' ELSE 'FAIL' END FROM t
  UNION ALL SELECT 4, '4. the table carries those three and the patient policy, unchanged: four in all, none RESTRICTIVE, none FOR ALL or FOR DELETE',
         table_pol_names || '; ' || table_pols::text || ' policies, ' || restrictive_pols::text || ' restrictive, '
           || all_or_delete_pols::text || ' for ALL or DELETE; patient ' || coalesce(patient_pol, 'absent'),
         'clinical_episodes_insert,clinical_episodes_patient_selfscope,clinical_episodes_select,clinical_episodes_update; '
           || '4 policies, 0 restrictive, 0 for ALL or DELETE; patient r/true/patient 9b55a6d007d2226e2227be448d8b48a0 -',
         CASE WHEN table_pol_names = 'clinical_episodes_insert,clinical_episodes_patient_selfscope,clinical_episodes_select,clinical_episodes_update'
               AND table_pols = 4 AND restrictive_pols = 0 AND all_or_delete_pols = 0
               AND patient_pol = 'r/true/patient 9b55a6d007d2226e2227be448d8b48a0 -' THEN 'OK' ELSE 'FAIL' END FROM t
  UNION ALL SELECT 5, '5. privileges on the table: authenticated INSERT,SELECT,UPDATE and no DELETE; patient SELECT; anon none; no column grant (control: the owner holds all eight)',
         'authenticated ' || auth_privs || '; patient ' || patient_privs || '; anon ' || anon_privs || '; '
           || column_grants::text || ' column grants; control ' || owner_privs::text,
         'authenticated INSERT,SELECT,UPDATE; patient SELECT; anon none; 0 column grants; control 8',
         CASE WHEN auth_privs = 'INSERT,SELECT,UPDATE' AND patient_privs = 'SELECT' AND anon_privs = 'none'
               AND column_grants = 0 AND owner_privs = 8 THEN 'OK' ELSE 'FAIL' END FROM t
  UNION ALL SELECT 6, '6. the policy count in the database moved by exactly two (one dropped, three created)',
         policies_now::text, (:'policies_before'::int + 2)::text,
         CASE WHEN policies_now = :'policies_before'::int + 2 THEN 'OK' ELSE 'FAIL' END FROM t
  UNION ALL SELECT 7, '7. every OTHER policy in the database is byte-identical (one md5 over all of them)',
         other_pol_md5 || ', over ' || n_other_pol::text || ' policies', :'other_policies_md5' || ', over more than 0 policies',
         CASE WHEN other_pol_md5 <> :'other_policies_md5' THEN 'FAIL' WHEN n_other_pol = 0 THEN 'VACUOUS' ELSE 'OK' END FROM t
  UNION ALL SELECT 8, '8. no function in public changed, and the SECURITY DEFINER count did not move',
         fn_md5 || ', over ' || n_fn::text || ' functions; SECURITY DEFINER ' || secdef::text || ', ' || secdef_not_postgres::text || ' not owned by postgres',
         :'functions_md5' || ', over more than 0 functions; SECURITY DEFINER ' || :'secdef_before' || ', 0 not owned by postgres',
         CASE WHEN fn_md5 <> :'functions_md5' OR secdef <> :'secdef_before'::int OR secdef_not_postgres <> 0 THEN 'FAIL'
              WHEN n_fn = 0 THEN 'VACUOUS' ELSE 'OK' END FROM t
  UNION ALL SELECT 9, '9. every other privilege on every relation in public is unchanged (DELETE for authenticated on this table aside)',
         rel_md5 || ', over ' || n_rel_items::text || ' privileges', :'relation_acl_md5' || ', over more than 0 privileges',
         CASE WHEN rel_md5 <> :'relation_acl_md5' THEN 'FAIL' WHEN n_rel_items = 0 THEN 'VACUOUS' ELSE 'OK' END FROM t
  UNION ALL SELECT 10, '10. every column privilege in public is unchanged',
         col_md5 || ', over ' || n_col_items::text || ' column privileges', :'column_acl_md5' || ', over more than 0 column privileges',
         CASE WHEN col_md5 <> :'column_acl_md5' THEN 'FAIL' WHEN n_col_items = 0 THEN 'VACUOUS' ELSE 'OK' END FROM t
  UNION ALL SELECT 11, '11. every default privilege in the database is unchanged',
         def_md5 || ', over ' || n_def_items::text || ' default privileges', :'default_acl_md5' || ', over more than 0 default privileges',
         CASE WHEN def_md5 <> :'default_acl_md5' THEN 'FAIL' WHEN n_def_items = 0 THEN 'VACUOUS' ELSE 'OK' END FROM t
  UNION ALL SELECT 12, '12. every trigger in public is unchanged, this table still has none, and no table was created or dropped',
         trg_md5 || ', ' || table_triggers::text || ' triggers on the table, ' || n_tables::text || ' tables',
         :'triggers_md5' || ', 0 triggers on the table, ' || :'tables_before' || ' tables',
         CASE WHEN trg_md5 = :'triggers_md5' AND table_triggers = 0 AND n_tables = :'tables_before'::int THEN 'OK' ELSE 'FAIL' END FROM t
  UNION ALL SELECT 13, '13. the table is still owned by postgres, row level security ENABLED and not FORCED',
         coalesce(table_shape, 'absent'), 'postgres rls=true forced=false',
         CASE WHEN table_shape = 'postgres rls=true forced=false' THEN 'OK' ELSE 'FAIL' END FROM t
  UNION ALL SELECT 14, '14. NO ROW MOVED: the table holds the pre-check''s rows, hashing to the pre-check''s md5',
         episodes_rows::text || ' rows, ' || episodes_md5, :'episodes_rows' || ' rows (more than 0), ' || :'episodes_md5',
         CASE WHEN episodes_rows <> :'episodes_rows'::int OR episodes_md5 <> :'episodes_md5' THEN 'FAIL'
              WHEN episodes_rows = 0 THEN 'VACUOUS' ELSE 'OK' END FROM t
  UNION ALL SELECT 15, '15. 0104 is in the journal by hash, once, as the newest row, and the journal moved by exactly one',
         has_0104::text || ' by hash, newest ' || CASE WHEN newest_hash = 'eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9'
                                                       THEN 'is 0104' ELSE 'is NOT 0104' END
           || ', journal ' || journal_rows::text,
         '1 by hash, newest is 0104, journal ' || (:'journal_rows_before'::int + 1)::text,
         CASE WHEN has_0104 = 1 AND newest_hash = 'eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9'
               AND journal_rows = :'journal_rows_before'::int + 1 THEN 'OK' ELSE 'FAIL' END FROM t
  UNION ALL SELECT 16, '16. BEHAVIOUR: the four actors read are the pre-check''s four',
         'tenant ' || tenant_md5 || ', actors ' || coalesce(actors_md5, 'absent') || ', ' || actors_found::text || ' found',
         'tenant ' || :'behaviour_tenant_md5' || ', actors ' || :'behaviour_actors_md5' || ', more than 0 found',
         CASE WHEN tenant_md5 <> :'behaviour_tenant_md5' OR actors_md5 IS DISTINCT FROM :'behaviour_actors_md5' THEN 'FAIL'
              WHEN actors_found = 0 THEN 'VACUOUS' ELSE 'OK' END FROM t
  UNION ALL
  SELECT 17 + array_position(ARRAY['owner', 'admin', 'reception', 'therapist'], a.role_slug) - 1,
         (17 + array_position(ARRAY['owner', 'admin', 'reception', 'therapist'], a.role_slug) - 1)::text
           || '. BEHAVIOUR, ' || a.role_slug || ': the episodes the actor reads are the episodes 0104''s read policy admits for it, from the tables',
         CASE WHEN a.actor IS NULL THEN 'no actor' ELSE 'reads ' || coalesce(a.reads::text, 'nothing read') || ' of ' || a.tenant_total::text END,
         CASE WHEN a.actor IS NULL THEN 'an actor (none reads VACUOUS)' ELSE 'reads ' || a.admitted::text || ' (0 reads VACUOUS)' END,
         CASE WHEN a.actor IS NULL THEN 'VACUOUS'
              WHEN a.reads IS DISTINCT FROM a.admitted THEN 'FAIL'
              WHEN a.admitted = 0 THEN 'VACUOUS'
              ELSE 'OK' END
    FROM admits a
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         set_config('ep0104.profile',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL', true),
         '21 OK / 0 VACUOUS / 0 FAIL where every actor reads at least one episode; never a FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;

\echo ''
\echo '=== FOR THE RECORD: the policies on clinical_episodes as the catalogue now describes them ==='
SELECT p.polname, p.polcmd AS command, p.polpermissive AS permissive,
       array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ',') AS to_roles
  FROM pg_policy p
 WHERE p.polrelid = 'public.clinical_episodes'::regclass
 ORDER BY 1;

-- A FAIL VERDICT IS AN ERROR. The SUMMARY row stored the profile it printed
-- (set_config, transaction-local, allowed in a READ ONLY transaction). Anything
-- but a profile ending "/ 0 FAIL" raises, and psql exits 3.
SELECT coalesce(current_setting('ep0104.profile', true), '') ~ '^[0-9]+ OK / [0-9]+ VACUOUS / 0 FAIL$' AS ep0104_no_fail \gset
\if :ep0104_no_fail
\else
  DO $fail$ BEGIN
    RAISE EXCEPTION 'STOP: the 0104 post-check printed a FAIL verdict, or its profile could not be read back [%]. Read the rows above.', coalesce(current_setting('ep0104.profile', true), 'no profile');
  END $fail$;
\endif
