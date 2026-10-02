-- 0097 (the clinical_records write policies follow the permission matrix):
-- PRE-CHECK. READ ONLY. It writes nothing and cannot.
--
-- Renumbered by the fifth renumbering, owner and lead, 2026-09-30: this file
-- was precheck-0099-registo-writes.sql and pinned the migration as 0099.
-- The migration's bytes did not change (a rename changes no byte), so the
-- hash it pins below is the one it pinned before; its own header still says
-- 0099, on purpose (packages/db/migrations-pending/README.md).
--
-- For the apply document (docs/migration-apply-0097.md), which pins this
-- file's sha256 and asserts that every verdict reads OK (20 expected). The
-- shape is 0094's and CARE-02a's (0096): check | observed | expected | verdict,
-- verdict LAST so a stage can match it anchored to the end of the line. The
-- six carries are rows whose `check` column IS the carry's name, and no carry
-- name is a substring of another's or of any other row's `check`.
--
-- 0097 ALTERS THREE POLICIES AND CREATES ONE FUNCTION, AND CHANGES NOTHING
-- ELSE, so this file proves the starting point exactly:
--   0      the transaction is READ ONLY;
--   1-3    each of the three write policies 0097 alters is there, PERMISSIVE,
--          TO authenticated, with the command it has on main and the
--          expression 0045 left it with, pinned by md5 of Postgres 17's
--          rendering (read on the rehearsal built from main's 93 migrations,
--          0000 to 0095, and the held 0096). All three render the SAME text:
--            clinical_records_insert   0045:252-267  WITH CHECK
--            clinical_records_update   0045:270-298  USING and WITH CHECK
--            clinical_records_delete   0045:301-316  USING
--          0097 RESTATES each expression with the therapist arm replaced. A
--          different expression on production means the ALTER would
--          overwrite something this file was not written against: STOP and
--          find out why;
--   4      the two OTHER policies on clinical_records read as 0096 (CARE-02a)
--          and 0010 leave them (clinical_records_select, TO authenticated,
--          with CARE-02a's care-team term; clinical_records_patient_selfscope,
--          TO patient), one md5 over both; the table carries exactly five
--          policies, none RESTRICTIVE, so the post-check's flat count holds;
--   5      the immutability trigger is there exactly as 0001 and 0005 leave
--          it: clinical_records_enforce_immutability, BEFORE UPDATE OR DELETE
--          FOR EACH ROW (tgtype 27), every column, no WHEN clause, enabled,
--          its function's body pinned by md5. 0097 leaves it alone, and the
--          post-check pins the same;
--   6      clinical_therapist_sees_patient, the one function 0097's INSERT
--          arm and its claim function call, is as 0045 left it: SECURITY
--          DEFINER, STABLE, search_path=public, owned by postgres, EXECUTE to
--          authenticated, body pinned by md5;
--   7      row level security is ENABLED on clinical_records;
--   8      0097 is absent from the journal, BY HASH: the sha256 of
--          packages/db/migrations-pending/NEXT-AFTER-0096_clinical_records_write_matrix.sql,
--          076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318.
--          The promotion is a rename and changes no byte, so this is the hash
--          drizzle records for 0097;
--   9      0095 is present, BY HASH (the last migration numbered on main when
--          this file was renumbered; applied to production 2026-09-29);
--   10     the newest applied journal row is 0096's (CARE-02a): its hash and
--          its `when`, passed in with -v prev_hash and -v prev_when, which the
--          apply document reads from the journal and 0096's promoted file on
--          the branch at the sitting. Neither is literal here: 0096's `when` is
--          set at its promotion. 0097 follows it; its own `when` is set above
--          prev_when at promotion (the 0058 skip guard);
--   11     the three helpers every policy calls exist (public.jwt_tenant_id,
--          public.jwt_role, auth.uid);
--   12     the NEW function's name is free: no function in public is called
--          claim_ai_draft_authorship, with any arguments. 0097 creates it
--          with CREATE OR REPLACE, which would silently take over a
--          same-named function somebody else made;
--   13     Q3, THE AT-RISK DRAFT COUNT, WITH ITS CONTROL (owner ruling Q3:
--          the sitting proceeds only when it reads 0). An unsigned registo
--          (status draft) is AT RISK when, after 0097, no therapist could
--          write it any more: an AI draft already in review with no author (a
--          claim before 0097 set no author, and 0097 admits only the author),
--          any other draft with no author except an AI draft still pending
--          review (that one is claimable through the claim function), and an
--          authored draft whose author is neither an active owner of the
--          tenant (the owner arm, unchanged, admits an owner on every
--          registo) nor an active therapist of the tenant who treats or
--          created the patient (W2): a deactivated therapist or owner, a
--          non-therapist such as an admin named on an imported draft, or a
--          therapist with no appointment with the patient who did not create
--          them. The table records a draft's author, not who last typed into
--          it, so "its current writer" is its author: the only therapist the
--          permission matrix ("own, until locked") and 0097 admit.
--          THE CONTROL. The count is one CASE over one row set, and the SAME
--          CASE classifies six planted rows that ride in that row set beside
--          the real drafts and never touch a table: three that must read at
--          risk (no author and not AI, AI in review with no author, an author
--          id that is no user) and three that must not (AI pending review
--          with no author; the lowest-id active owner as author; the
--          lowest-id active therapist with an appointment with a live
--          patient, as that patient's author). The last two are read from the
--          tables, so a database with no active owner or no treating
--          therapist has no subject for them and the verdict reads FAIL (a
--          missing subject is a FAIL, never a pass). OK only when the real
--          drafts read at risk 0 AND the six planted rows read exactly their
--          classes; anything else is FAIL, and stage 1 STOPs before the pick.
--          Row level security cannot turn this count into a quiet 0: the
--          transaction sets row_security = off, so a session that does not
--          bypass it ERRORs on the first read of an RLS table instead of
--          reading a filtered zero;
--   CARRY  journal_rows_before = 94: main's 93 after 0095 (0000 to 0095; the
--          numbering has gaps), then 0096, one row;
--   CARRY  policies_before. 0097 must not move it;
--   CARRY  other_policies_md5: one md5 over every policy in the database
--          EXCEPT the three 0097 alters. The post-check recomputes it;
--          nothing else may move;
--   CARRY  functions_md5: one md5 over every function in public (signature,
--          body, SECURITY DEFINER, volatility, owner, settings). The
--          post-check recomputes it over every function EXCEPT the one 0097
--          creates, and it must not move: 0097 edits no existing function;
--   CARRY  grants_md5: one md5 over every table, column and function ACL in
--          public. The post-check recomputes it without the new function's
--          ACL, and it must not move: 0097 grants nothing on anything else;
--   CARRY  draft_profile: a PROFILE, not a pass. The same classification as
--          verdict 13, over the real drafts only: the unauthored drafts in
--          three counts (AI pending review, AI in review, other), then the
--          authored drafts whose author could not write them after 0097
--          ("author cannot write"). Verdict 13 is the gate; this row prints
--          the four counts so a refusal says which kind is in the way. From
--          0097 on, a therapist claims the first kind through the claim
--          function and writes the other three not at all; the owner writes
--          all four, as before.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v prev_hash=<0096's sha256> -v prev_when=<0096's journal when>
--        -f scripts/db/precheck-0097-registo-writes.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?prev_hash}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_hash is missing (the sha256 of 0096 as promoted). This file refuses to guess.';
  END $missing$;
\endif
\if :{?prev_when}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_when is missing (0096''s journal when). This file refuses to guess.';
  END $missing$;
\endif

BEGIN READ ONLY;
-- Verdict 13's control against a filtered zero: a session that does not
-- bypass row level security ERRORs on its first read of an RLS table here.
SET LOCAL row_security = off;

\echo ''
\echo '=== 0097 REGISTO WRITE MATRIX PRE-CHECK - every verdict must read OK (20 expected) ==='

WITH pol AS (
  SELECT c.relname, p.polname, p.polcmd::text AS cmd, p.polpermissive AS permissive,
         coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '') AS to_roles,
         coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')      AS qual_md5,
         coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-') AS check_md5
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'clinical_records'
), own1 AS (
  -- Verdict 13's control: the lowest-id active owner (a planted draft in their name must read writable).
  SELECT o.tenant_id, o.id
    FROM public.users o JOIN public.roles ro ON ro.id = o.role_id AND ro.slug = 'owner'
   WHERE o.is_active
   ORDER BY o.id LIMIT 1
), treat1 AS (
  -- Verdict 13's control: the lowest-id active therapist with an appointment with a live patient.
  SELECT a.tenant_id, p.id AS patient_id, u.id AS practitioner_id
    FROM public.appointments a
    JOIN public.patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id AND p.deleted_at IS NULL
    JOIN public.users u ON u.id = a.practitioner_id AND u.tenant_id = a.tenant_id AND u.is_active
    JOIN public.roles r ON r.id = u.role_id AND r.slug = 'therapist'
   ORDER BY p.id, u.id LIMIT 1
), d AS (
  -- Every unsigned registo, and beside them the six planted rows of verdict 13's control.
  SELECT 'real'::text AS kind, c.tenant_id, c.patient_id, c.practitioner_id,
         c.source::text AS source, c.ai_review_state::text AS review
    FROM public.clinical_records c
   WHERE c.status = 'draft'
  UNION ALL
  SELECT v.kind, v.tenant_id, v.patient_id, v.practitioner_id, v.source, v.review
    FROM (VALUES
      ('c_other',   '00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, NULL::uuid, 'manual',      NULL::text),
      ('c_review',  '00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, NULL::uuid, 'ai_ingested', 'in_review'),
      ('c_gone',    '00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid,        'manual',      NULL::text),
      ('c_pending', '00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, NULL::uuid, 'ai_ingested', 'pending_review')
    ) AS v(kind, tenant_id, patient_id, practitioner_id, source, review)
  UNION ALL
  SELECT 'c_owner', own1.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid, own1.id, 'manual', NULL::text FROM own1
  UNION ALL
  SELECT 'c_treats', treat1.tenant_id, treat1.patient_id, treat1.practitioner_id, 'manual', NULL::text FROM treat1
), k AS (
  -- ONE classification for the real drafts and the planted rows alike (Q3).
  SELECT d.kind,
         CASE
           WHEN d.practitioner_id IS NULL AND d.source = 'ai_ingested' AND d.review = 'pending_review' THEN 'ai pending'
           WHEN d.practitioner_id IS NULL AND d.source = 'ai_ingested' AND d.review = 'in_review'      THEN 'ai in review'
           WHEN d.practitioner_id IS NULL                                                              THEN 'other'
           WHEN EXISTS (
                  SELECT 1 FROM public.users o
                    JOIN public.roles ro ON ro.id = o.role_id AND ro.slug = 'owner'
                   WHERE o.id = d.practitioner_id AND o.tenant_id = d.tenant_id AND o.is_active)
             OR EXISTS (
                  SELECT 1 FROM public.users u
                    JOIN public.roles r ON r.id = u.role_id AND r.slug = 'therapist'
                   WHERE u.id = d.practitioner_id AND u.tenant_id = d.tenant_id AND u.is_active
                     AND (EXISTS (SELECT 1 FROM public.patients p
                                   WHERE p.id = d.patient_id AND p.tenant_id = d.tenant_id
                                     AND p.created_by = u.id)
                          OR EXISTS (SELECT 1 FROM public.appointments a
                                      WHERE (a.patient_id = d.patient_id OR a.patient_2_id = d.patient_id)
                                        AND a.tenant_id = d.tenant_id
                                        AND (a.practitioner_id = u.id OR a.practitioner_2_id = u.id))))
                                                                                                        THEN 'author writes'
           ELSE 'author cannot write'
         END AS cls
    FROM d
), j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                           AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318')  AS has_0097,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806')  AS has_0095,
    (SELECT hash || ' ' || created_at::text FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC, id DESC LIMIT 1)                                        AS newest_row,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations))    AS newest_ties,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_records_insert')                              AS old_insert,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_records_update')                              AS old_update,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_records_delete')                              AS old_delete,
    (SELECT md5(string_agg(relname || '.' || polname || ':' || cmd || ':' || permissive::text || ':' || to_roles
                           || ':' || qual_md5 || ':' || check_md5, ';' ORDER BY relname, polname))
       FROM pol WHERE polname NOT IN ('clinical_records_insert', 'clinical_records_update',
                                      'clinical_records_delete'))                       AS two_md5,
    (SELECT count(*)::int FROM pol)                                                    AS table_pols,
    (SELECT count(*)::int FROM pol WHERE NOT permissive)                               AS restrictive_pols,
    (SELECT string_agg(tg.tgname || ' type=' || tg.tgtype::text || ' enabled=' || tg.tgenabled::text
                       || ' cols=' || CASE WHEN tg.tgattr::text = '' THEN 'all' ELSE tg.tgattr::text END
                       || ' when=' || CASE WHEN tg.tgqual IS NULL THEN 'none' ELSE 'SET' END
                       || ' fn=' || f.proname || ' ' || md5(f.prosrc), ' ; ' ORDER BY tg.tgname)
       FROM pg_trigger tg JOIN pg_proc f ON f.oid = tg.tgfoid
      WHERE tg.tgrelid = 'public.clinical_records'::regclass AND NOT tg.tgisinternal)  AS triggers,
    (SELECT string_agg(CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END || '/' || p.provolatile::text || '/'
                       || coalesce(array_to_string(p.proconfig, ','), '') || '/' || pg_get_userbyid(p.proowner) || '/'
                       || CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'exec' ELSE 'NOEXEC' END
                       || ' ' || md5(p.prosrc), ' ; ')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'clinical_therapist_sees_patient')    AS sees_shape,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'claim_ai_draft_authorship')          AS new_name_taken,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'clinical_records' AND c.relrowsecurity) AS rls_on,
    (SELECT count(DISTINCT n.nspname || '.' || p.proname)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE (n.nspname = 'public' AND p.proname IN ('jwt_tenant_id', 'jwt_role'))
         OR (n.nspname = 'auth' AND p.proname = 'uid'))                                 AS helpers,
    (SELECT count(*)::int FROM pg_policy)                                              AS policies,
    (SELECT md5(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname))
       FROM pg_policy p
       JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT (n.nspname = 'public' AND c.relname = 'clinical_records'
                 AND p.polname IN ('clinical_records_insert', 'clinical_records_update',
                                   'clinical_records_delete')))                         AS other_md5,
    (SELECT md5(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.prosecdef::text || ':'
                           || p.provolatile::text || ':' || pg_get_userbyid(p.proowner) || ':'
                           || coalesce(array_to_string(p.proconfig, ','), ''),
                           ';' ORDER BY p.oid::regprocedure::text))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public')                                                       AS functions_md5,
    (SELECT md5(
              coalesce((SELECT string_agg(c.relname || ':' || coalesce(c.relacl::text, 'default'), ';' ORDER BY c.relname)
                          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')), '')
              || '|' ||
              coalesce((SELECT string_agg(c.relname || '.' || a.attname || ':' || a.attacl::text, ';' ORDER BY c.relname, a.attname)
                          FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
                          JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND a.attacl IS NOT NULL AND NOT a.attisdropped), '')
              || '|' ||
              coalesce((SELECT string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, 'default'), ';'
                                          ORDER BY p.oid::regprocedure::text)
                          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = 'public'), '')))                             AS grants_md5,
    (SELECT 'ai pending ' || count(*) FILTER (WHERE cls = 'ai pending')
            || ', ai in review ' || count(*) FILTER (WHERE cls = 'ai in review')
            || ', other ' || count(*) FILTER (WHERE cls = 'other')
            || ', author cannot write ' || count(*) FILTER (WHERE cls = 'author cannot write')
       FROM k WHERE kind = 'real')                                                      AS drafts,
    (SELECT count(*)::int FROM k
      WHERE kind = 'real' AND cls IN ('ai in review', 'other', 'author cannot write'))   AS q3_at_risk,
    (SELECT count(*)::int FROM k WHERE kind = 'real')                                  AS q3_drafts,
    (SELECT string_agg(kind || '=' || cls, ', ' ORDER BY kind) FROM k WHERE kind <> 'real') AS q3_control
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. clinical_records_insert is FOR INSERT, PERMISSIVE, TO authenticated, WITH CHECK exactly 0045''s expression',
       coalesce(old_insert, 'absent'),
       'a/true/authenticated - a8e4b05ed583e82dbb0b136d5ff4a627',
       CASE WHEN old_insert = 'a/true/authenticated - a8e4b05ed583e82dbb0b136d5ff4a627' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. clinical_records_update is FOR UPDATE, PERMISSIVE, TO authenticated, USING and WITH CHECK exactly 0045''s expression',
       coalesce(old_update, 'absent'),
       'w/true/authenticated a8e4b05ed583e82dbb0b136d5ff4a627 a8e4b05ed583e82dbb0b136d5ff4a627',
       CASE WHEN old_update = 'w/true/authenticated a8e4b05ed583e82dbb0b136d5ff4a627 a8e4b05ed583e82dbb0b136d5ff4a627'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. clinical_records_delete is FOR DELETE, PERMISSIVE, TO authenticated, USING exactly 0045''s expression',
       coalesce(old_delete, 'absent'),
       'd/true/authenticated a8e4b05ed583e82dbb0b136d5ff4a627 -',
       CASE WHEN old_delete = 'd/true/authenticated a8e4b05ed583e82dbb0b136d5ff4a627 -' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. the two read policies on clinical_records read as 0096 (CARE-02a) and 0010 leave them (one md5), five policies in all, none RESTRICTIVE',
       table_pols::text || ' policies, ' || restrictive_pols::text || ' restrictive, ' || coalesce(two_md5, 'absent'),
       '5 policies, 0 restrictive, ae6ad9a7c3ee236acebd22c1c952afe4',
       CASE WHEN table_pols = 5 AND restrictive_pols = 0 AND two_md5 = 'ae6ad9a7c3ee236acebd22c1c952afe4'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. the immutability trigger is the only one: BEFORE UPDATE OR DELETE FOR EACH ROW, every column, no WHEN, enabled, body pinned',
       coalesce(triggers, 'none'),
       'clinical_records_enforce_immutability type=27 enabled=O cols=all when=none fn=enforce_clinical_record_immutability f0691f60a12af6eeb561ce369c18f0d5',
       CASE WHEN triggers = 'clinical_records_enforce_immutability type=27 enabled=O cols=all when=none fn=enforce_clinical_record_immutability f0691f60a12af6eeb561ce369c18f0d5'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. clinical_therapist_sees_patient is as 0045 left it: DEFINER, STABLE, search_path=public, owner postgres, EXECUTE to authenticated, body pinned',
       coalesce(sees_shape, 'absent'),
       'DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186',
       CASE WHEN sees_shape = 'DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. row level security is ENABLED on clinical_records', rls_on::text, '1',
       CASE WHEN rls_on = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. 0097 is absent from the journal, by hash', has_0097::text, '0',
       CASE WHEN has_0097 = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. 0095 is present in the journal, by hash', has_0095::text, '1',
       CASE WHEN has_0095 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. the newest applied journal row is 0096''s (CARE-02a), by hash and when, and no other row shares its when',
       coalesce(newest_row, 'absent') || ', ' || newest_ties::text || ' at that when',
       lower(:'prev_hash') || ' ' || :'prev_when' || ', 1 at that when',
       CASE WHEN newest_row = lower(:'prev_hash') || ' ' || :'prev_when' AND newest_ties = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '94',
       CASE WHEN journal_rows = 94 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'policies_before', policies::text, '> 0',
       CASE WHEN policies > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'other_policies_md5', coalesce(other_md5, 'absent'), '32 hex characters',
       CASE WHEN other_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'functions_md5', coalesce(functions_md5, 'absent'), '32 hex characters',
       CASE WHEN functions_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'grants_md5', coalesce(grants_md5, 'absent'), '32 hex characters',
       CASE WHEN grants_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'draft_profile', coalesce(drafts, 'absent'), 'four counts, read (a profile, not a pass)',
       CASE WHEN drafts ~ '^ai pending [0-9]+, ai in review [0-9]+, other [0-9]+, author cannot write [0-9]+$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. the three helpers the policies call exist (jwt_tenant_id, jwt_role, auth.uid)', helpers::text, '3',
       CASE WHEN helpers = 3 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. the new function''s name is free: no function in public is called claim_ai_draft_authorship',
       new_name_taken::text || ' found', '0 found',
       CASE WHEN new_name_taken = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '13. Q3: no unsigned registo is left that its author could not write after 0097 (at risk 0), and six planted rows prove the count',
       'at risk ' || q3_at_risk::text || ' of ' || q3_drafts::text || ' drafts; control ' || coalesce(q3_control, 'absent'),
       'at risk 0; control c_gone=author cannot write, c_other=other, c_owner=author writes, c_pending=ai pending, c_review=ai in review, c_treats=author writes',
       CASE WHEN q3_at_risk = 0
             AND q3_control = 'c_gone=author cannot write, c_other=other, c_owner=author writes, c_pending=ai pending, c_review=ai in review, c_treats=author writes'
            THEN 'OK' ELSE 'FAIL' END FROM j;

ROLLBACK;
