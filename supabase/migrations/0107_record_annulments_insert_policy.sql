-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0107_record_annulments_insert_policy.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ====================================================================== */
/* AN ANNULMENT IS WRITTEN BY THE OWNER, OR BY A THERAPIST WHO AUTHORED   */
/* THE REGISTO OR TREATS OR CREATED ITS PATIENT, IN THEIR OWN NAME, FOR A */
/* SIGNED REGISTO OF THEIR TENANT.                                        */
/*                                                                        */
/* Ruled by strategy, dispatch S-1012-A (2026-10-12), and its ruling of   */
/* 2026-10-13 on the therapist arm. Tier C. Authored now and HELD: this   */
/* lane never applies it; GREEN applies it later.                         */
/*                                                                        */
/* PENDING, AND IT FOLLOWS 0105. This file is parked in                   */
/* packages/db/migrations-pending and carries no number in its name.      */
/* After 0105 a number is given when a migration is authored (CLAUDE.md,  */
/* the number table); on 2026-10-12 the next free one is 0106. See the    */
/* README in that folder for the promotion recipe; the body below is      */
/* final.                                                                 */
/*                                                                        */
/* AT PROMOTION its journal `when` MUST BE STRICTLY GREATER THAN 0105's.  */
/* A `when` that is equal or lower makes drizzle skip the file in         */
/* silence, which is why scripts/check-journal.mjs refuses one.           */
/* ====================================================================== */


/* ====================================================================== */
/* 1. WHAT THIS FILE MAKES TRUE                                           */
/* ====================================================================== */
/* After this file the INSERT policy of public.record_annulments,         */
/* record_annulments_tenant_insert (0035, TO authenticated), admits a new */
/* row only when ALL of these hold:                                       */
/*                                                                        */
/*   A1  the row is in the tenant of the JWT (0035's term, unchanged);    */
/*   A2  the row names the caller: annulled_by_user_id = auth.uid(). A    */
/*       row that names another member of staff, or nobody, is refused;   */
/*   A3  the registo it names exists in the SAME tenant and is SIGNED,    */
/*       the one status the application annuls (annulRecord,              */
/*       apps/web/lib/clinical/records.ts, refuses every other status     */
/*       with not_signed);                                                */
/*   A4  the caller is the owner, or is a therapist AND either the        */
/*       registo's author (clinical_records.practitioner_id =             */
/*       auth.uid()) or a therapist of the registo's patient              */
/*       (clinical_therapist_sees_patient(patient_id), 0045: they         */
/*       created the patient, or have an appointment with them as first   */
/*       or second practitioner). It is the therapist arm of              */
/*       clinical_records_select as 0045 wrote it, which the application  */
/*       states as therapistRegistoWriteScope                             */
/*       (apps/web/lib/patients/scope.ts), and the same two tests 0097    */
/*       uses: the author for clinical_records_update and                 */
/*       clinical_records_delete, the patient for                         */
/*       clinical_records_insert.                                         */
/*                                                                        */
/* An admin and a receptionist match no arm of A4, as on every write      */
/* policy of clinical_records. A therapist who neither authored the       */
/* registo nor treats or created its patient matches none either; being   */
/* on the patient's care team (0091, 0096) is a reading tie and is not    */
/* one of the two. A refusal is SQLSTATE 42501, the row level security    */
/* violation; nothing is written.                                         */
/*                                                                        */
/* THE OWNER'S RULING OF 2026-09-14 (Q-SR62-P4-1, docs/DECISIONS.md): a   */
/* therapist may annul a registo another practitioner authored when the   */
/* patient is theirs. A4's second therapist term is that ruling.          */
/*                                                                        */
/* THE REGISTO IS READ AS THE CALLER. The EXISTS in A3 runs under the     */
/* caller's own clinical_records_select (0045, as 0096 leaves it). The    */
/* owner reads every registo of the tenant, and a therapist reads every   */
/* registo they authored and every registo of a patient they treat or     */
/* created (its first two therapist terms), so every caller A4 admits     */
/* reads the row A3 asks for. The tenant is still compared explicitly, so */
/* A3 does not rest on that policy alone.                                 */


/* ====================================================================== */
/* 2. WHY AN ALTER POLICY, AND WHY IT IS LAST                             */
/* ====================================================================== */
/* ALTER POLICY ... WITH CHECK replaces only the expression: the name,    */
/* the command, PERMISSIVE and TO authenticated stay as 0035 left them,   */
/* and the policy count does not move on any table. It is the 0096 and    */
/* 0097 shape. The name keeps the word `tenant` from 0035; the pre-check  */
/* and the post-check pin the policy by its expression, never by its      */
/* name.                                                                  */
/*                                                                        */
/* IDEMPOTENT: an ALTER POLICY that sets the same expression twice leaves */
/* the catalogue as it was after the first.                               */
/*                                                                        */
/* CLOSED HOURS ONLY. Measured on the build lane's local stack on         */
/* 2026-10-12 (Postgres 17.6): an ALTER POLICY run as postgres takes      */
/* ACCESS EXCLUSIVE on public.record_annulments AND on every table the    */
/* platform's supautils.policy_grants setting names (the login, storage   */
/* and realtime tables, 23 of them there), until the COMMIT, and ACCESS   */
/* SHARE on public.clinical_records, which its expression reads. The      */
/* ACCESS EXCLUSIVE set is the one a CREATE POLICY and a DROP POLICY      */
/* take, measured the same day. So the statement is the last in the       */
/* file, and this file is held to the standing rule for a migration that  */
/* creates a policy. Production's setting has not been read.              */
/*                                                                        */
/* The two bounds below make a lock this transaction cannot take in 5     */
/* seconds a clean failure with nothing applied.                          */


/* ====================================================================== */
/* 3. THE HELPERS: NO NEW FUNCTION                                        */
/* ====================================================================== */
/* Every term is a function that exists and that `authenticated` may      */
/* execute:                                                               */
/*                                                                        */
/*   public.jwt_tenant_id()   0001, SECURITY DEFINER since 0012           */
/*   public.jwt_role()        0001                                        */
/*   auth.uid()               the platform's                              */
/*   public.clinical_therapist_sees_patient(uuid)                         */
/*                            0045, SECURITY DEFINER, STABLE, owned by    */
/*                            postgres (0060); EXECUTE for authenticated  */
/*                            and for no other role (0045, 0079). No      */
/*                            migration since 0045 replaces its body.     */
/*                                                                        */
/* So the SECURITY DEFINER count does not move and no count GATE-CHANGE   */
/* follows this file. Each nullary call is wrapped, `(select f())`, so    */
/* it is evaluated once per statement (an InitPlan), as                   */
/* packages/db/tests/rls-nullary-wrap.db.test.ts requires of a policy.    */
/* clinical_therapist_sees_patient takes the registo's patient, a column  */
/* of the row the EXISTS reads, so it is called bare, as 0045, 0096 and   */
/* 0097 call it. It reads patients and appointments as its owner, with    */
/* the tenant of the JWT in both reads, so it answers the same for a      */
/* caller whose own reads of those two tables are narrower.               */


/* ====================================================================== */
/* 4. EVERY WRITER AND READER OF THE TABLE, READ AGAINST THE POLICY       */
/* ====================================================================== */
/* Read on origin/main at 5d4e8091.                                       */
/*                                                                        */
/* THE ONE APPLICATION WRITER                                             */
/*   apps/web/lib/clinical/records.ts, annulRecord (:1094-1137), called   */
/*   by annulRecordAction (apps/web/app/patients/[id]/actions.ts:47-66)   */
/*   after the capability clinical_records:author (the owner and          */
/*   therapists hold it) and the delete password. It runs under           */
/*   runScoped (SET LOCAL ROLE authenticated and the JWT claims), so      */
/*   this policy applies to it. Its INSERT (:1120-1125) sets tenant_id    */
/*   from the context and annulled_by_user_id = ctx.userId: A1 and A2     */
/*   hold for every caller. It refuses a registo that is not signed       */
/*   before the INSERT (:1109): A3 holds. It reads the registo first      */
/*   under therapistRegistoWriteScope (:1102-1107, scope.ts:144-148),     */
/*   which is A4's therapist arm word for word, and answers not_found     */
/*   to a therapist outside it before any INSERT.                         */
/*     - the owner, any signed registo of the tenant: ADMITTED.           */
/*     - a therapist, a signed registo they authored: ADMITTED.           */
/*     - a therapist, a signed registo of a patient they treat or         */
/*       created: ADMITTED.                                               */
/*   No caller annulRecord lets through to its INSERT is refused by this  */
/*   policy. therapistPatientScope reads patients and appointments as     */
/*   the caller, and the helper of A4 reads them as its owner, so the     */
/*   policy is never the narrower of the two.                             */
/*                                                                        */
/* NOT UNDER THIS POLICY, so unchanged by this file:                      */
/*   No other application code writes the table: none in apps/api,        */
/*     apps/portal, apps/admin, the importer (packages/db/src/migration)  */
/*     or a seed. public.merge_patients does not name it.                 */
/*   scripts/import/cleanup-test-patients.sql (:435) deletes rows of the  */
/*     test patients it is given; it is owner-run and carries no SET      */
/*     ROLE.                                                              */
/*   The DB-gated suites of apps/web that seed an annulment do it on the  */
/*     owning connection, which row level security does not bind.         */
/*                                                                        */
/* THE READERS read through record_annulments_tenant_select, which this   */
/* file does not touch: listRecords (records.ts:178-180),                 */
/* listFichaRecords (ficha-groups.ts:69-71), the registo report           */
/* (report/load.ts:122-125) and the episode export                        */
/* (report/episode-export.ts:146-150). Every row the table holds today    */
/* stays, and stays readable as before: a policy for INSERT decides new   */
/* rows only.                                                             */


/* ====================================================================== */
/* 5. WHAT THIS FILE DOES NOT DO                                          */
/* ====================================================================== */
/* - It creates and drops no policy, and adds none for UPDATE or DELETE:  */
/*   the table stays append-only by its policy set, as 0035 made it.      */
/* - It changes no grant. `authenticated`, `service_role` and `anon`      */
/*   hold what 0035 gave them.                                            */
/* - It does not touch record_annulments_tenant_select, or any policy of  */
/*   any other table.                                                     */
/* - It creates, replaces and drops no function, and changes no ACL of    */
/*   one.                                                                 */
/* - It adds no column, constraint, index or trigger, and it does not     */
/*   touch clinical_records or clinical_records_enforce_immutability.     */
/* - It writes no row and backfills nothing.                              */
/* - It needs no application change: annulRecord and the Anular control   */
/*   stay as they are.                                                    */


/* ====================================================================== */
/* 6. WHAT MOVES AT PROMOTION                                             */
/* ====================================================================== */
/* Nothing but the rename, the journal entry and the mirror into          */
/* supabase/migrations. No function is created, so                        */
/* packages/db/scripts/check-security-definer-owner.mjs keeps its count.  */
/* THE DB-GATED ARMS FLIP BY THEMSELVES.                                  */
/*   packages/db/tests/record-annulments-insert-policy.db.test.ts and     */
/*   apps/web/lib/clinical/annul-record.db.test.ts ask the schema whether */
/*   this file is applied, to decide which arms run, and THROW on a       */
/*   database that lacks it once the repository has it promoted. Neither  */
/*   needs an edit at promotion.                                          */


/* ====================================================================== */
/* 7. THE STATEMENTS                                                      */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint

/* The WITH CHECK of record_annulments_tenant_insert: A1 to A4 of         */
/* section 1.                                                             */
ALTER POLICY "record_annulments_tenant_insert" ON public.record_annulments
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND annulled_by_user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.clinical_records r
       WHERE r.id = record_annulments.record_id
         AND r.tenant_id = record_annulments.tenant_id
         AND r.status = 'signed'
         AND (
           (select public.jwt_role()) = 'owner'
           OR (
             (select public.jwt_role()) = 'therapist'
             AND (
               r.practitioner_id = (select auth.uid())
               OR public.clinical_therapist_sees_patient(r.patient_id)
             )
           )
         )
    )
  );--> statement-breakpoint
