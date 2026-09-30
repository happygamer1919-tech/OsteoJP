/* ====================================================================== */
/* 0099: THE clinical_records WRITE POLICIES FOLLOW THE PERMISSION        */
/* MATRIX. A THERAPIST EDITS AND DELETES ONLY THEIR OWN UNSIGNED          */
/* REGISTOS, AND FILES REGISTOS ONLY IN THEIR OWN NAME FOR A PATIENT      */
/* THEY TREAT OR CREATED.                                                 */
/*                                                                        */
/* Ruled onto the Tier C list by the owner on 2026-09-27, in his words    */
/* "0099 registo fix, SAT-01 from 0100." Recorded in CLAUDE.md, "SOLO's   */
/* record", by #1466 (b8c62fd5 on main).                                  */
/* Authored now and HELD: this lane never applies it; GREEN applies it    */
/* later.                                                                 */
/*                                                                        */
/* RULED NUMBER 0099. NO NUMBER IN THIS FILE NAME YET, BY CONSTRUCTION.   */
/* It must follow 0098 (CARE-02a). The ruled queue after 0093 is 0094,    */
/* 0095, 0096, 0097, 0098, then this file. See                            */
/* packages/db/migrations-pending/README.md for the promotion recipe.     */
/* THE BODY BELOW IS FINAL BUT FOR ONE OPEN OWNER QUESTION, Q4 of         */
/* docs/migration-apply-0099.md: W2's WITH CHECK asks the INSERT's        */
/* patient test as well as the author, one term beyond the acceptance's   */
/* text. The owner rules on Q4 before the PR is armed; a ruling for the   */
/* author alone changes W2, this file's sha256 and every pin on it, and   */
/* the rehearsal runs again.                                              */
/*                                                                        */
/* AT PROMOTION its journal `when` MUST BE STRICTLY GREATER THAN 0098's.  */
/* A `when` that is equal or lower makes drizzle skip the file in         */
/* silence, which is why scripts/check-journal.mjs refuses one.           */
/* Section 6 lists what else moves at promotion; one of those moves is a  */
/* GATE-CHANGE and has to be sequenced.                                   */
/* ====================================================================== */


/* ====================================================================== */
/* 1. WHAT THIS FILE MAKES TRUE                                           */
/* ====================================================================== */
/* The permission matrix in CLAUDE.md gives a therapist "Edit clinical    */
/* records: own, until locked". After this file the three write policies  */
/* of clinical_records say the same, for the role `therapist`:            */
/*                                                                        */
/*   W1  clinical_records_insert (WITH CHECK): the new row is in the      */
/*       caller's own name (practitioner_id = auth.uid()) AND its patient */
/*       is one the caller treats or created                              */
/*       (clinical_therapist_sees_patient(patient_id), 0045). An          */
/*       addendum is an INSERT like any other, so a new version is filed  */
/*       the same way.                                                    */
/*   W2  clinical_records_update: USING, the caller is the registo's      */
/*       author (practitioner_id = auth.uid()); WITH CHECK, the new row   */
/*       is still the caller's own AND its patient is one the caller      */
/*       treats or created, W1's test. So authorship never moves by an    */
/*       UPDATE, and every row a therapist writes, by INSERT or by        */
/*       UPDATE, meets the same rule.                                     */
/*   W3  clinical_records_delete (USING): the caller is the author.       */
/*                                                                        */
/* "UNSIGNED" IS NOT IN THE POLICIES, AND DOES NOT NEED TO BE. A locked   */
/* or signed registo is refused by the BEFORE UPDATE OR DELETE trigger    */
/* clinical_records_enforce_immutability (0001, re-parent-aware since     */
/* 0005), which this file does not touch. The policies decide WHO may     */
/* write a row; the trigger decides WHICH rows can change at all.         */
/*                                                                        */
/* The owner arm of every write policy is byte-identical: an owner writes */
/* any registo of the tenant, as before. Admin and reception still match  */
/* no arm. The SELECT policies are not touched.                           */
/*                                                                        */
/*   C1  ONE NEW FUNCTION, claim_ai_draft_authorship(uuid): the review    */
/*       claim of an AI-ingested draft. Section 4 says why it exists.     */


/* ====================================================================== */
/* 2. THE THREE POLICIES, AND WHERE THEIR CURRENT TEXT LIVES              */
/* ====================================================================== */
/* Every policy statement below is an ALTER POLICY that restates the      */
/* policy's CURRENT expression with the therapist arm replaced. The       */
/* current text is the LAST migration that created or altered the         */
/* policy, measured by grepping packages/db/migrations and the held queue */
/* for each name:                                                         */
/*                                                                        */
/*   clinical_records_insert   0045_clinical_records_location_rls.sql     */
/*                             :252-267                                   */
/*   clinical_records_update   0045:270-298                               */
/*   clinical_records_delete   0045:301-316                               */
/*                                                                        */
/* No migration after 0045 alters any of the three. 0098 alters           */
/* clinical_records_select and says in its section 7 that it changes no   */
/* INSERT, UPDATE or DELETE policy of clinical_records; 0094 to 0097 do   */
/* not name the table's policies. The pre-check pins each one's rendered  */
/* text by md5, so a policy that moved before this file is applied STOPs  */
/* the sitting.                                                           */
/*                                                                        */
/* Only the therapist arm of each expression is written here, as section  */
/* 1 states it. Every other byte is 0045's: the tenant conjunct, the      */
/* owner arm, the role literals, the `(select ...)` InitPlan wrappers.    */
/*                                                                        */
/* WHY ALTER POLICY AND NOT DROP AND CREATE. The policy count does not    */
/* move, which is the 0089, 0092 and 0098 shape. ALTER POLICY ... USING   */
/* (or WITH CHECK) replaces only the expression it names; the command,    */
/* PERMISSIVE and TO authenticated are left as they are, and the          */
/* post-check pins all three.                                             */


/* ====================================================================== */
/* 3. EVERY APP WRITER OF clinical_records, READ AGAINST THE NEW ARMS     */
/* ====================================================================== */
/* Read on origin/main at e0e75cfe, after #1464, which made each UPDATE   */
/* below read back the rows it touched. Every staff writer runs under     */
/* withTenantContext (packages/db/src/client.ts:146-158: SET LOCAL ROLE   */
/* authenticated and the JWT claims), so these policies apply to it.      */
/*                                                                        */
/* apps/web/lib/clinical/records.ts                                       */
/*   :431-442 createDraftRecord INSERT. practitioner_id = ctx.userId; the */
/*            patient comes from the new-registo picker, which offers a   */
/*            therapist only patients they treat or created               */
/*            (listPatients, :364-375, therapistPatientScope, the same    */
/*            test as clinical_therapist_sees_patient). ADMITTED by W1.   */
/*   :509-517 updateRecordData UPDATE, the author's own draft: ADMITTED.  */
/*            Another therapist's draft: 0 rows (W2). Main already        */
/*            refuses 0 rows (not_found, no audit row); the app half      */
/*            names this one not_author.                                  */
/*            W2's WITH CHECK also asks W1's patient test, which every    */
/*            draft a therapist filed met when it was filed. An author    */
/*            who has since stopped treating the patient (every           */
/*            appointment with them deleted) can still delete the draft   */
/*            but no longer save or sign it; the owner can. The apply     */
/*            document's Q4 is that choice, and its pre-check counts      */
/*            such drafts before the sitting.                             */
/*   :554-567 createAddendum INSERT. practitioner_id = ctx.userId, the    */
/*            patient of the registo it supersedes. ADMITTED by W1 for a  */
/*            therapist who treats or created that patient, whoever wrote */
/*            the registo being superseded. The app half asks the same    */
/*            patient test first, so any other caller gets a clean        */
/*            refusal rather than a raw 42501; createDraftRecord too.     */
/*   :613-627 signAndLockRecord UPDATE, the author's own draft: ADMITTED, */
/*            with the same patient test as the save above. Another       */
/*            therapist's draft: 0 rows (W2), which main reports as       */
/*            stale and the app half as not_author.                       */
/*   :691-695 hardDeleteClinicalRecord DELETE, the author's own draft:    */
/*            ADMITTED. Any other draft, including an unclaimed AI draft, */
/*            is 0 rows for a therapist (W3), which main already refuses  */
/*            (not_found); the app half names it not_author. The owner    */
/*            deletes any.                                                */
/*                                                                        */
/* apps/web/lib/clinical/review.ts                                        */
/*   :284-294 claimReviewItem, a patient submission: INSERT in the        */
/*            claimer's own name (:290) for the submission's patient; the */
/*            queue offers a therapist only patients they treat or        */
/*            created (listReviewQueue, :86-90). ADMITTED by W1. The app  */
/*            half asks the patient test first, as createDraftRecord      */
/*            does, so a posted submission id meets it too.               */
/*   :228-243 claimReviewItem, an AI draft: UPDATE of a row the ingestion */
/*            endpoint wrote WITHOUT an author (apps/web/lib/ingestion/   */
/*            store.ts:78-93 sets no practitioner_id). Under W2 no        */
/*            therapist is its author, so the claim would read 0 rows and */
/*            end in not_under_review. THIS IS THE ONE LEGITIMATE PATH    */
/*            THE NEW ARMS WOULD BREAK, and section 4 is its narrow path. */
/*   :377-384 editReviewNarrative, :478-485 saveReviewFicha, and :548-567 */
/*            and :581-590 finalizeReview: UPDATEs of a claimed draft.    */
/*            After the claim the claimer IS the author (section 4), so   */
/*            all ADMITTED for the claimer; for anyone else 0 rows (W2),  */
/*            which main reports as finalized (the two saves) or stale    */
/*            (finalize), and the app half as not_author.                 */
/*                                                                        */
/* NOT UNDER THESE POLICIES, so unchanged by this file:                   */
/*   apps/web/lib/ingestion/store.ts:77-93, the AI ingestion INSERT, runs */
/*     on getDbAdmin() (BYPASSRLS), the sanctioned service_role path.     */
/*   public.merge_patients (0005:117-120, SECURITY DEFINER, owner         */
/*     postgres since 0060:90) re-points patient_id as its owner.         */
/*   The Fisiozero importer (packages/db/src/migration/upsert.ts:620-625, */
/*     :934-937) runs with OWNER claims (packages/db/scripts/             */
/*     import-core.ts:336), so the owner arm admits it as before; an      */
/*     imported registo keeps the original therapist as its author, and   */
/*     that therapist edits an imported draft as its author while they    */
/*     treat the patient (W2's WITH CHECK). The pre-check counts every    */
/*     draft whose author could not, before the sitting.                  */
/*   apps/web/app/consultation/actions.ts, the consultation actions,      */
/*     write a stub patient (:58), the recording consent's audit row      */
/*     (:156) and the consultations row (:381), which                     */
/*     apps/web/lib/consultation/consultation-store.ts:96-193 writes on   */
/*     getDbAdmin(). None of them writes clinical_records.                */
/*   packages/db/seed/episodes-dev.ts:303 is a development seed.          */
/*                                                                        */
/* The owner is admitted by the unchanged owner arm on every path above.  */


/* ====================================================================== */
/* 4. THE CLAIM PATH: WHY A FUNCTION, AND WHAT IT MAY DO                  */
/* ====================================================================== */
/* An AI-ingested draft has no author until a human takes it: the         */
/* ingestion endpoint does not know which therapist will review it. The   */
/* review claim is where a therapist takes it, and after this file an     */
/* UPDATE policy that admits only the author cannot admit that first      */
/* UPDATE: USING reads the OLD row, whose practitioner_id is NULL.        */
/*                                                                        */
/* claim_ai_draft_authorship(p_record_id) makes the caller the author of  */
/* ONE such draft and does nothing else. It sets practitioner_id to       */
/* auth.uid() on the row only when ALL of these hold:                     */
/*   - the row is in the caller's JWT tenant;                             */
/*   - the caller's role is therapist (the owner needs no claim: the      */
/*     owner arm admits every registo);                                   */
/*   - source = 'ai_ingested', status = 'draft' and                       */
/*     ai_review_state = 'pending_review': an unclaimed AI draft;         */
/*   - practitioner_id IS NULL: the draft has no author. An existing      */
/*     author is never replaced, so clinical authorship never moves;      */
/*   - clinical_therapist_sees_patient(patient_id): the caller treats or  */
/*     created the patient, W1's test, so a claim files nothing W1 would  */
/*     refuse as an INSERT.                                               */
/* It returns true when it assigned the row and false otherwise; it never */
/* raises for a row it will not assign. The app calls it inside the same  */
/* transaction as the claim's own UPDATE (review.ts, this PR), which then */
/* runs under W2 as the author and moves ai_review_state as before. A     */
/* failure of that UPDATE rolls the assignment back with it.              */
/*                                                                        */
/* CALLED ON ITS OWN, outside the app's claim, it makes the caller the    */
/* author and leaves the draft pending review. That state is accepted,    */
/* and it is safe: the draft is then the caller's like any other, the     */
/* app's review queue shows an AI draft to a therapist only while it has  */
/* no author or when they are its author (review.ts, listReviewQueue),    */
/* and the author's own claim then proceeds as the author. Another        */
/* therapist's claim of it ends in not_under_review, as every claim of a  */
/* draft with another author does.                                        */
/*                                                                        */
/* WHY SECURITY DEFINER. As the caller it would meet W2 and change        */
/* nothing. It is the narrowest writer that can do this one assignment:   */
/* one column, one direction (NULL to the caller), one state. Owned by    */
/* postgres (0060's rule), search_path pinned to public, EXECUTE for      */
/* authenticated only: revoked from PUBLIC, anon and service_role by      */
/* name, because Supabase's default privileges grant the named roles and  */
/* REVOKE FROM PUBLIC does not touch them (0073's note). Every table it   */
/* reads or writes is filtered on jwt_tenant_id(), as 0045 requires of a  */
/* definer helper. VOLATILE, because it writes.                           */
/*                                                                        */
/* THE IMMUTABILITY TRIGGER STILL FIRES on its UPDATE (a trigger is not   */
/* bypassed by a definer), and passes it, because the row is a draft.     */


/* ====================================================================== */
/* 5. WHAT THIS FILE DOES NOT DO                                          */
/* ====================================================================== */
/* - It changes no SELECT policy: clinical_records_select (as 0098 leaves */
/*   it) and clinical_records_patient_selfscope (0010) are pinned by md5  */
/*   before and after.                                                    */
/* - It changes no owner arm, and no policy on any other table.           */
/* - It edits no existing function: clinical_therapist_sees_patient is    */
/*   called, not changed, and enforce_clinical_record_immutability and    */
/*   its trigger are not touched.                                         */
/* - It creates and drops no policy: the count is flat on every table.    */
/* - It changes no row. The claim function writes only when the app       */
/*   calls it.                                                            */
/* - IDEMPOTENT: an ALTER POLICY that sets the same expression twice      */
/*   leaves the catalogue as it was after the first, and CREATE OR        */
/*   REPLACE with the same body keeps the owner and the ACL; the owner    */
/*   pin, the revoke and the grant converge.                              */


/* ====================================================================== */
/* 6. WHAT MOVES AT PROMOTION, AND ONE MOVE THAT NEEDS SEQUENCING         */
/* ====================================================================== */
/* THE SECURITY DEFINER COUNT GOES 27 -> 28 (26 on main, 27 once 0098 is  */
/* promoted), and it lives in two places that read only                   */
/* packages/db/migrations or a database built from supabase/migrations,   */
/* so neither may move before promotion:                                  */
/*   - packages/db/tests/security-definer-owner.test.ts:                  */
/*     EXPECTED_FUNCTIONS gains claim_ai_draft_authorship, and its        */
/*     owner-pin scan finds the ALTER FUNCTION ... OWNER TO postgres      */
/*     below. An ordinary file; it moves in the promotion PR.             */
/*   - packages/db/scripts/check-security-definer-owner.mjs:              */
/*     EXPECTED_COUNT 27 -> 28. THIS FILE IS A FROZEN GATE                */
/*     (.github/gate-manifest.json), so the change is a GATE-CHANGE PR    */
/*     the owner merges by hand, and rule C forbids that PR carrying the  */
/*     migration. Whichever of the two lands first reddens CI's DB-gated  */
/*     checker step until the other lands. The order is the owner's call, */
/*     as it is for 0098's move.                                          */
/* THE DB-GATED ARMS FLIP BY THEMSELVES.                                  */
/*   packages/db/tests/clinical-records-write-matrix.db.test.ts asks the  */
/*   schema whether this file is applied, runs the arms this file adds    */
/*   only on a database that has it (and skips them on one that does      */
/*   not), and names the side in its title; it THROWS on a database that  */
/*   holds half of this file, or on one that lacks it while the           */
/*   repository has it promoted. packages/db/tests/review-finalize-rls.   */
/*   test.ts claims an AI draft the way the app does, through the         */
/*   function when it exists. Neither needs an edit at promotion.         */


/* ====================================================================== */
/* 7. THE STATEMENTS                                                      */
/* ====================================================================== */

/* W1. 0045's clinical_records_insert WITH CHECK, verbatim but for the    */
/* therapist arm: their own name, for a patient they treat or created.    */
ALTER POLICY "clinical_records_insert" ON public.clinical_records
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND practitioner_id = (select auth.uid())
        AND public.clinical_therapist_sees_patient(patient_id)
      )
    )
  );--> statement-breakpoint

/* W2. 0045's clinical_records_update USING and WITH CHECK, verbatim but  */
/* for the therapist arm: USING, the author; WITH CHECK, the author, for  */
/* a patient they treat or created (W1's arm).                            */
ALTER POLICY "clinical_records_update" ON public.clinical_records
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND practitioner_id = (select auth.uid())
      )
    )
  )
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND practitioner_id = (select auth.uid())
        AND public.clinical_therapist_sees_patient(patient_id)
      )
    )
  );--> statement-breakpoint

/* W3. 0045's clinical_records_delete USING, verbatim but for the         */
/* therapist arm: the author.                                             */
ALTER POLICY "clinical_records_delete" ON public.clinical_records
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND practitioner_id = (select auth.uid())
      )
    )
  );--> statement-breakpoint

/* C1. The review claim of an unauthored AI draft (section 4).            */
CREATE OR REPLACE FUNCTION public.claim_ai_draft_authorship(p_record_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.clinical_records c
     SET practitioner_id = auth.uid()
   WHERE c.id = p_record_id
     AND c.tenant_id = public.jwt_tenant_id()
     AND public.jwt_role() = 'therapist'
     AND auth.uid() IS NOT NULL
     AND c.source = 'ai_ingested'
     AND c.status = 'draft'
     AND c.ai_review_state = 'pending_review'
     AND c.practitioner_id IS NULL
     AND public.clinical_therapist_sees_patient(c.patient_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;--> statement-breakpoint

ALTER FUNCTION public.claim_ai_draft_authorship(uuid) OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_ai_draft_authorship(uuid) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_ai_draft_authorship(uuid) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.claim_ai_draft_authorship(uuid) IS
  '0099, owner ruling 2026-09-27. The review claim of an AI-ingested draft: '
  'makes the calling therapist the author (practitioner_id) of ONE unclaimed '
  'AI draft (source ai_ingested, status draft, ai_review_state pending_review, '
  'no author yet) of a patient the caller treats or created, in the caller''s '
  'tenant, and changes nothing else. An existing author is never replaced. '
  'Returns true when it assigned the row. The clinical_records UPDATE policy '
  'admits only the author, so the claim''s own UPDATE follows as the author.';--> statement-breakpoint
