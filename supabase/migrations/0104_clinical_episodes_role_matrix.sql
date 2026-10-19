-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0104_clinical_episodes_role_matrix.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ====================================================================== */
/* THE clinical_episodes POLICIES FOLLOW THE ROLES, ONE POLICY PER        */
/* COMMAND. AN EPISODE IS READ ON THE BASIS THE PATIENT'S REGISTOS ARE    */
/* READ ON; A THERAPIST OPENS ONE IN THEIR OWN NAME FOR A PATIENT THEY    */
/* TREAT OR CREATED; NO STAFF SESSION DELETES ONE.                        */
/*                                                                        */
/* Ruled by strategy, dispatch S-1008-B (2026-10-08), which gave it the   */
/* number 0104. Tier C. Authored now and HELD: this lane never applies    */
/* it; GREEN applies it later.                                            */
/*                                                                        */
/* PENDING, AND IT FOLLOWS 0103. This file is parked in                   */
/* packages/db/migrations-pending and carries no number in its name. It   */
/* must follow 0103, the migration before it. See the README in that      */
/* folder for the promotion recipe; the body below is final.              */
/*                                                                        */
/* AT PROMOTION its journal `when` MUST BE STRICTLY GREATER THAN 0103's.  */
/* A `when` that is equal or lower makes drizzle skip the file in         */
/* silence, which is why scripts/check-journal.mjs refuses one.           */
/* ====================================================================== */


/* ====================================================================== */
/* 1. WHAT THIS FILE MAKES TRUE                                           */
/* ====================================================================== */
/* After this file the table carries three staff policies, each TO        */
/* authenticated, each keyed on the tenant of the JWT first:              */
/*                                                                        */
/*   E1  clinical_episodes_select (USING). Who reads an episode:          */
/*       - the owner: every episode of the tenant;                        */
/*       - an admin: the episodes of a patient linked to one of the       */
/*         admin's clinics, clinical_admin_sees_patient(patient_id)       */
/*         (0045). It is the admin arm of clinical_records_select, term   */
/*         for term, so an admin reads an episode exactly where the       */
/*         admin reads that patient's registos;                           */
/*       - a receptionist: the same clinic test. Strategy's words:        */
/*         "reception gets a read arm, own clinic only, no write";        */
/*       - a therapist: the episodes of a patient they treat or created,  */
/*         clinical_therapist_sees_patient(patient_id) (0045), or whose   */
/*         care team they are on at their own clinics,                    */
/*         viewer_care_team_patient_ids_at_my_clinics() (0096). Those     */
/*         are the two patient-level terms of the therapist arm of        */
/*         clinical_records_select.                                       */
/*   E2  clinical_episodes_insert (WITH CHECK). Who opens one:            */
/*       - the owner: any episode of the tenant, in any practitioner's    */
/*         name;                                                          */
/*       - a therapist: an episode in their OWN name                      */
/*         (primary_practitioner_id = auth.uid()) for a patient they      */
/*         treat or created. It is the therapist arm of                   */
/*         clinical_records_insert with the episode's own column.         */
/*   E3  clinical_episodes_update (USING and WITH CHECK, one              */
/*       expression). Who changes one:                                    */
/*       - the owner: any episode of the tenant;                          */
/*       - a therapist: an episode of a patient they treat or created,    */
/*         and the changed row is still such a patient's.                 */
/*                                                                        */
/* An admin and a receptionist match no arm of E2 or E3: they read and    */
/* never write. A therapist on a care team who neither treats nor         */
/* created the patient reads (E1) and does not write (E2, E3), as with    */
/* the registos since 0096.                                               */
/*                                                                        */
/* NO DELETE, FOR ANY STAFF SESSION. There is no DELETE policy, and       */
/* DELETE is revoked from `authenticated` on this table, so a DELETE      */
/* raises 42501 rather than answering "0 rows". 0091 did the same on      */
/* patient_care_team, for the same reason: the row is a record. An        */
/* episode opened by mistake stays; nothing in the application deletes    */
/* an episode.                                                            */
/*                                                                        */
/* clinical_episodes_patient_selfscope (0010, TO patient) is not          */
/* touched, and SELECT, INSERT and UPDATE stay granted to                 */
/* `authenticated`: the policies above decide the rows.                   */


/* ====================================================================== */
/* 2. WHY ONE DROP AND THREE CREATES, AND NOT AN ALTER                    */
/* ====================================================================== */
/* The table has had one staff policy since 0001,                         */
/* clinical_episodes_tenant_isolation, FOR ALL. ALTER POLICY cannot       */
/* change the command a policy is for, and a FOR ALL policy has one       */
/* USING expression for SELECT, UPDATE and DELETE alike. E1 and E3 are    */
/* different expressions and there is no DELETE at all, so one policy     */
/* cannot say this. That policy is dropped and three are created, one     */
/* per command. The policy count on this table goes from 2 to 4; on       */
/* every other table it does not move.                                    */
/*                                                                        */
/* THE DROP AND THE THREE CREATES COMMIT TOGETHER OR NOT AT ALL.          */
/* drizzle-kit migrate runs the pending set in one transaction            */
/* (scripts/migration-timeouts.test.mjs says how), so no session ever     */
/* reads the table between them.                                          */
/*                                                                        */
/* NOT IDEMPOTENT, ON PURPOSE. A second run fails at the DROP POLICY,     */
/* which names a policy that is no longer there, and changes nothing.     */
/* The pre-check pins the two policies the table carries today by md5,    */
/* so a table that moved before the sitting STOPs it.                     */


/* ====================================================================== */
/* 3. THE HELPERS: NO NEW FUNCTION                                        */
/* ====================================================================== */
/* Every term is a function that exists and that `authenticated` may      */
/* execute:                                                               */
/*                                                                        */
/*   public.jwt_tenant_id()   0001, SECURITY DEFINER since 0012           */
/*   public.jwt_role()        0001                                        */
/*   auth.uid()               the platform's                              */
/*   public.clinical_admin_sees_patient(uuid)      0045:120-159           */
/*   public.clinical_therapist_sees_patient(uuid)  0045:170-192           */
/*   public.viewer_care_team_patient_ids_at_my_clinics()  0096:302-338    */
/*                                                                        */
/* The last three are SECURITY DEFINER, STABLE and owned by postgres      */
/* (0060, 0096); the pre-check pins each one's body by md5.               */
/*                                                                        */
/* So the SECURITY DEFINER count does not move and no count               */
/* GATE-CHANGE follows this file.                                         */
/*                                                                        */
/* NULLARY HELPERS ARE WRAPPED, ONE-ARGUMENT HELPERS ARE NOT.             */
/* `(select f())` is evaluated once per statement (an InitPlan), which    */
/* packages/db/tests/rls-nullary-wrap.db.test.ts requires of every        */
/* policy. The two one-argument helpers take the row's patient_id, so     */
/* they run per row, exactly as they do in clinical_records_select.       */
/*                                                                        */
/* WHAT "OWN CLINIC" MEANS FOR AN EPISODE. The table has no clinic        */
/* column; an episode's only tie to a clinic is its patient. So the       */
/* test is per PATIENT, on 0045's basis, the one 0096 section 2 reads     */
/* in full: an appointment of the patient (first patient slot) at one     */
/* of the caller's clinics, or, only when the patient has no              */
/* appointment with a location, the patient's primary location among      */
/* them. A patient seen at two clinics is linked to both, and the         */
/* staff of each read all of that patient's episodes. A member of staff   */
/* with no clinic assignment is linked to none, and that arm admits       */
/* them to nothing.                                                       */
/*                                                                        */
/* WHAT AN EPISODE ROW HOLDS: ids, dates, a status and a title. The       */
/* application builds every new title from a closed list of               */
/* specialties and the day (apps/web/lib/clinical/episode-title.ts);      */
/* the importer titled each episode with the specialty its file was       */
/* named for. That rule stays after this file: a title never carries      */
/* clinical text.                                                         */


/* ====================================================================== */
/* 4. EVERY APP READER AND WRITER, READ AGAINST THE NEW POLICIES          */
/* ====================================================================== */
/* Read on origin/main at bf0000a1. Every staff reader and writer runs    */
/* under withTenantContext (packages/db/src/client.ts: SET LOCAL ROLE     */
/* authenticated and the JWT claims), so these policies apply to it.      */
/*                                                                        */
/* apps/web/lib/clinical/episodes.ts                                      */
/*   insertOpenEpisode (:139-148), INSERT ... RETURNING, with             */
/*     primary_practitioner_id = ctx.userId (:145). Its callers have      */
/*     already asked the narrow write scope for the patient               */
/*     (therapistPatientScope, the same test as                           */
/*     clinical_therapist_sees_patient). ADMITTED by E2. A RETURNING      */
/*     also puts the new row to the SELECT policy, and E1 admits it on    */
/*     the same patient term. The owner reaches it through                */
/*     createDraftRecord: ADMITTED by the owner arm.                      */
/*   findOpenEpisodeOfSpecialty (:222-239), the reuse decision (R31).     */
/*     E1's therapist arm is per PATIENT, never per practitioner, so a    */
/*     therapist who treats the patient reads a colleague's open          */
/*     episode of that patient and reuses it. The read set contains       */
/*     the write set.                                                     */
/*   listOpenAppEpisodes (:303-320): the same read, after the same        */
/*     narrow scope.                                                      */
/*   getEpisodeDetail (:353-367; owner, admin, therapist): the episode    */
/*     where E1 admits it; otherwise no row, and the page is a clean      */
/*     not-found.                                                         */
/* apps/web/lib/clinical/ficha-groups.ts                                  */
/*   listFichaRecords (:59-63), the Registos tab, LEFT JOINs each         */
/*     registo's episode for its title. Every registo it returns is of    */
/*     a patient the viewer reads registos of at patient level            */
/*     (therapistPatientReadScope, :39; the admin arm of                  */
/*     clinical_records_select), which is E1's basis, so each registo     */
/*     comes back with its episode.                                       */
/* apps/web/lib/clinical/records.ts                                       */
/*   getRecordDetail: the same join, the same scope.                      */
/*   listEpisodesForPicker: the open episodes E1 admits.                  */
/*   assertEpisodeIsThePatients: an episode the caller does not read      */
/*     is no row, and no row is a refusal (episode_mismatch). It fails    */
/*     closed.                                                            */
/* apps/web/lib/clinical/report/episode-export.ts                         */
/*   readEpisodeExportRows (:87-98), the existence read before an         */
/*     episode's PDF: the Registos tab's own reach.                       */
/* apps/web/lib/patients/actions.ts (hardDeletePatient),                  */
/* apps/web/lib/patients/queries.ts (getPatientHardDeleteBlockers) and    */
/* apps/web/lib/admin/staff.ts (deleteStaffMember)                        */
/*     the patient hard delete, its preflight and the staff removal       */
/*     each COUNT episodes, and each count is the caller's own read.      */
/*     The database refuses the DELETE of a patient or a user an          */
/*     episode still names, whoever asks: the two foreign keys of 0000    */
/*     on patient_id and primary_practitioner_id are checked without      */
/*     row level security. Both actions name that refusal                 */
/*     (has_references, has_activity).                                    */
/* packages/db/src/migration/upsert.ts                                    */
/*   importEpisode and the bulk insert (:614-617, :870-878, :882-885):    */
/*     the Fisiozero importer inserts and updates episodes in the         */
/*     ORIGINAL therapist's name. It runs with OWNER claims               */
/*     (packages/db/scripts/import-core.ts:336-337), so the owner arms    */
/*     of E2 and E3 admit it, and E1 admits its RETURNING and its         */
/*     integrity read (reconciliation.ts:186-189).                        */
/*                                                                        */
/* NOT UNDER THESE POLICIES, so unchanged by this file:                   */
/*   public.merge_patients (0005:173-175, SECURITY DEFINER, owner         */
/*     postgres since 0060:90) re-points an episode's patient_id as       */
/*     its owner, and counts what it moved.                               */
/*   packages/db/seed/episodes-dev.ts and                                 */
/*     apps/web/e2e/seed/seed-e2e.mjs are not staff sessions.             */
/*   The owner-run scripts under scripts/ carry no SET ROLE. The          */
/*     pre-check reads whether the sitting's own session reads this       */
/*     table past its policies, and says so in a verdict.                 */
/*   No reader exists in apps/portal or apps/api, and the patient         */
/*     policy is not touched.                                             */


/* ====================================================================== */
/* 5. THE LOCKS, AND WHY THE CREATE POLICY STATEMENTS ARE LAST            */
/* ====================================================================== */
/* CLOSED HOURS ONLY. Strategy's standing ruling: "any migration that     */
/* creates a policy is closed-hours only, never eligible for R9."         */
/* Measured on a throwaway on 2026-10-03 (CLAUDE.md): a CREATE POLICY     */
/* run as postgres takes ACCESS EXCLUSIVE on every table the              */
/* platform's supautils.policy_grants setting names, until the COMMIT.    */
/* So the three CREATE POLICY statements are the last three.              */
/*                                                                        */
/* The REVOKE rewrites a catalogue row and takes no table lock. The       */
/* DROP POLICY and each CREATE POLICY take ACCESS EXCLUSIVE on            */
/* public.clinical_episodes until the COMMIT, so every read of the        */
/* table waits for it. Whether a DROP POLICY also takes the platform's    */
/* locks has not been measured; it stands directly before the creates,    */
/* so if it does it adds no earlier lock than they would.                 */
/*                                                                        */
/* The two bounds below make a lock this transaction cannot take in 5     */
/* seconds a clean failure with nothing applied.                          */


/* ====================================================================== */
/* 6. WHAT THIS FILE DOES NOT DO                                          */
/* ====================================================================== */
/* - It creates, replaces and drops no function, and changes no ACL of    */
/*   one.                                                                 */
/* - It changes no policy on any other table, and not                     */
/*   clinical_episodes_patient_selfscope.                                 */
/* - It changes no grant but one: DELETE on this table, from              */
/*   `authenticated`. `patient`, `anon` and `service_role` hold what      */
/*   they held.                                                           */
/* - It adds no column, constraint, index or trigger.                     */
/* - It writes no row and backfills nothing.                              */


/* ====================================================================== */
/* 7. WHAT MOVES AT PROMOTION                                             */
/* ====================================================================== */
/* Nothing but the rename, the journal entry and the mirror into          */
/* supabase/migrations. No function is created, so                        */
/* packages/db/scripts/check-security-definer-owner.mjs keeps its         */
/* count.                                                                 */
/* THE DB-GATED ARMS FLIP BY THEMSELVES.                                  */
/*   packages/db/tests/clinical-episodes-role-matrix.db.test.ts and the   */
/*   apps/web suites that read episodes ask the schema whether this       */
/*   file is applied, name the side in their titles, and THROW on a       */
/*   database that holds half of it, or on one that lacks it once the     */
/*   repository has it promoted. None needs an edit at promotion.         */


/* ====================================================================== */
/* 8. THE STATEMENTS                                                      */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint

/* No DELETE for a staff session: without the privilege a DELETE raises   */
/* 42501. Section 1.                                                      */
REVOKE DELETE ON public.clinical_episodes FROM authenticated;--> statement-breakpoint

/* 0001's one staff policy, FOR ALL. Section 2.                           */
DROP POLICY "clinical_episodes_tenant_isolation" ON public.clinical_episodes;--> statement-breakpoint

/* E1. Who reads an episode. The owner; an admin or a receptionist, for a */
/* patient linked to one of their clinics; a therapist, for a patient     */
/* they treat or created, or whose care team they are on at their own     */
/* clinics.                                                               */
CREATE POLICY "clinical_episodes_select" ON public.clinical_episodes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'admin'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'reception'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          public.clinical_therapist_sees_patient(patient_id)
          OR patient_id = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids_at_my_clinics() ), '{}'::uuid[]))
        )
      )
    )
  );--> statement-breakpoint

/* E2. Who opens an episode. The owner, in any practitioner's name; a     */
/* therapist, in their own name, for a patient they treat or created.     */
CREATE POLICY "clinical_episodes_insert" ON public.clinical_episodes
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND primary_practitioner_id = (select auth.uid())
        AND public.clinical_therapist_sees_patient(patient_id)
      )
    )
  );--> statement-breakpoint

/* E3. Who changes an episode. The owner; a therapist, for a patient they */
/* treat or created, before and after the change.                         */
CREATE POLICY "clinical_episodes_update" ON public.clinical_episodes
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND public.clinical_therapist_sees_patient(patient_id)
      )
    )
  )
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND public.clinical_therapist_sees_patient(patient_id)
      )
    )
  );--> statement-breakpoint
