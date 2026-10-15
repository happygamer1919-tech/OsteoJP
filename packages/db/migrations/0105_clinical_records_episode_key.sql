/* ====================================================================== */
/* A REGISTO AND THE EPISODE IT IS FILED IN NAME ONE PATIENT, IN ONE      */
/* TENANT. A FOREIGN KEY SAYS SO, AND THE PATIENT MERGE MOVES AN EPISODE  */
/* AND ITS REGISTOS UNDER IT.                                             */
/*                                                                        */
/* Ruled by strategy, dispatch S-1008-B (2026-10-08), which gave it the   */
/* number 0105. Tier C. Authored now and HELD: this lane never applies    */
/* it; GREEN applies it later, while the clinics are closed (section 5).  */
/*                                                                        */
/* PENDING, AND IT FOLLOWS 0104. This file is parked in                   */
/* packages/db/migrations-pending and carries no number in its name. It   */
/* must follow 0104, the migration before it. See the README in that      */
/* folder for the promotion recipe; the body below is final.              */
/*                                                                        */
/* AT PROMOTION its journal `when` MUST BE STRICTLY GREATER THAN 0104's.  */
/* A `when` that is equal or lower makes drizzle skip the file in         */
/* silence, which is why scripts/check-journal.mjs refuses one.           */
/* ====================================================================== */


/* ====================================================================== */
/* 1. WHAT THIS FILE MAKES TRUE                                           */
/* ====================================================================== */
/* A registo (public.clinical_records) may be filed in an episode         */
/* (public.clinical_episodes). After this file the database holds, for    */
/* every registo that names an episode, that the episode exists with the  */
/* registo's own patient_id and tenant_id:                                */
/*                                                                        */
/*   K1  ONE UNIQUE INDEX, clinical_episodes_id_patient_tenant_uq, on     */
/*       clinical_episodes (id, patient_id, tenant_id). `id` is the       */
/*       primary key, so the three columns together are unique for every  */
/*       row there is or can be; the index is there so that a foreign     */
/*       key can point at the three.                                      */
/*   K2  ONE FOREIGN KEY, clinical_records_episode_patient_tenant_fk:     */
/*       clinical_records (episode_id, patient_id, tenant_id) references  */
/*       clinical_episodes (id, patient_id, tenant_id).                   */
/*       - MATCH SIMPLE, the default: a registo with no episode           */
/*         (episode_id NULL) is not checked, and is filed as before.      */
/*       - NO ACTION on update and on delete: the key never writes a      */
/*         registo. It refuses the statement that would leave a registo   */
/*         naming an episode of another patient or tenant, whichever of   */
/*         the two tables that statement writes.                          */
/*       - DEFERRABLE INITIALLY IMMEDIATE: checked at the end of every    */
/*         statement, unless a transaction defers it by name. One         */
/*         function does (M1).                                            */
/*   M1  public.merge_patients IS REPLACED, WITH TWO STATEMENTS ADDED. A  */
/*       merge moves the source patient's episodes and then its           */
/*       registos, in two UPDATEs. The function now defers K2 before      */
/*       the first and sets it IMMEDIATE again after the second, so the   */
/*       key is checked once, when both have moved, and before the        */
/*       function goes on. Every other byte of the body is 0005's         */
/*       (section 4).                                                     */
/*                                                                        */
/* The key from episode_id to clinical_episodes (id), from 0000, stays as */
/* it is.                                                                 */
/*                                                                        */
/* THE APPLICATION ASKS THE SAME, AND THAT CHECK STAYS.                   */
/* assertEpisodeIsThePatients (apps/web/lib/clinical/records.ts) reads    */
/* the episode before a registo is filed in it and refuses with           */
/* episode_mismatch. It also asks that the episode is open, which a key   */
/* does not express. The registo writers answer K2's own refusal with     */
/* the same episode_mismatch; that is the application's own pull          */
/* request, and it merges before this file is promoted.                   */


/* ====================================================================== */
/* 2. WHY IMMEDIATE, AND WHY THE MERGE DEFERS IT                          */
/* ====================================================================== */
/* An immediate key refuses AT THE STATEMENT, where the code that ran     */
/* the statement can name the refusal. A key deferred for everyone        */
/* refuses at the COMMIT, after every savepoint and every handler of the  */
/* transaction has gone.                                                  */
/*                                                                        */
/* The merge is the one writer that changes the patient of an episode     */
/* and of its registos. It does so in two statements, and between them    */
/* the two tables name different patients whichever statement runs        */
/* first. So it defers K2 for those two statements only:                  */
/*                                                                        */
/*     SET CONSTRAINTS public.<K2> DEFERRED;                              */
/*     UPDATE public.clinical_episodes ...     (0005:173-175)             */
/*     UPDATE public.clinical_records ...      (0005:179-183)             */
/*     SET CONSTRAINTS public.<K2> IMMEDIATE;                             */
/*                                                                        */
/* SET CONSTRAINTS ... IMMEDIATE checks what was deferred when it runs.   */
/* So a merge that would leave a registo and its episode apart fails at   */
/* that line, inside the function, and the caller's transaction rolls     */
/* back with nothing moved. After it the key is immediate again for the   */
/* rest of the caller's transaction. The key is named with its schema     */
/* because the function's search_path is empty.                           */
/*                                                                        */
/* MEASURED on a local Supabase stack (Postgres 17.6), in rolled-back     */
/* transactions, on invented rows:                                        */
/*   - the same merge, of a patient with two episodes holding a draft,    */
/*     two locked and a signed registo and one registo with no episode,   */
/*     run on the body of 0005 and on the body below: the value           */
/*     returned, the audit row, every registo, every episode and the      */
/*     source patient read the same;                                      */
/*   - a registo of one patient in another patient's episode, and an      */
/*     episode holding registos given to another patient alone: each      */
/*     refused at the statement, SQLSTATE 23503, naming K2. A registo     */
/*     in its own patient's episode, and one with no episode: filed;      */
/*   - with K2 deferred by hand and one registo misfiled, the merge       */
/*     fails inside the function at the second SET CONSTRAINTS, 23503     */
/*     naming K2, and nothing has moved;                                  */
/*   - after a merge that passes, the next statement that breaks K2 is    */
/*     refused at the statement.                                          */


/* ====================================================================== */
/* 3. EVERY WRITER OF THE THREE COLUMNS, READ AGAINST K2                  */
/* ====================================================================== */
/* Read on origin/main at 5c619c75.                                       */
/*                                                                        */
/* apps/web/lib/clinical/records.ts                                       */
/*   createDraftRecord (:627). The episode is read (:673, :682) or        */
/*       inserted (apps/web/lib/clinical/episodes.ts:140) BEFORE the      */
/*       registo's INSERT (:695), in one transaction, for the registo's   */
/*       own patient. ADMITTED.                                           */
/*   createAddendum (:800). The new version copies the patient and the    */
/*       episode of the registo it supersedes (:833), a pair K2 already   */
/*       holds for that row. ADMITTED.                                    */
/*   :775, :898 and :983, and apps/web/lib/clinical/review.ts :246,       */
/*       :407, :515, :589 and :624: UPDATEs of a registo and one DELETE.  */
/*       None sets episode_id, patient_id or tenant_id, and deleting a    */
/*       registo cannot break K2. UNCHANGED.                              */
/* apps/web/lib/clinical/review.ts:312, a registo from a patient's form,  */
/*   and apps/web/lib/ingestion/store.ts:79, the AI ingestion INSERT:     */
/*   each files the registo with NO episode. NOT CHECKED (MATCH SIMPLE).  */
/* public.merge_patients (0005), called by                                */
/*   apps/web/lib/patients/actions.ts:1017: M1.                           */
/* packages/db/src/migration/upsert.ts, the Fisiozero importer:           */
/*   :615 and :621 (in chunks) and :883 and :935 (row by row) insert      */
/*       episodes before registos (IMPORT_ORDER, :81). A registo carries  */
/*       the patient and the episode its source row names. Where the      */
/*       two agree, ADMITTED; where they do not, K2 refuses that INSERT   */
/*       at the statement, inside the savepoint of its chunk or row,      */
/*       and the importer records the SQLSTATE and the constraint name    */
/*       (sanitizeImportError, :1058).                                    */
/*   :871 updates an imported episode, its patient included. If the       */
/*       patient changes while registos are filed in the episode, K2      */
/*       refuses the UPDATE at the statement. This file leaves the        */
/*       importer as it is.                                               */
/* packages/db/seed/episodes-dev.ts:297 and :303, a development seed,     */
/*   and apps/web/e2e/seed/seed-e2e.mjs, the end-to-end seed: episodes    */
/*   first, then registos of the same patients. ADMITTED; a stack seeded  */
/*   by the second validates K2.                                          */
/* scripts/import/cleanup-test-patients.sql deletes registos (:444) and   */
/*   then episodes (:481): a DELETE in that order meets neither key.      */
/* The owner-run data scripts under scripts/data and packages/db/scripts  */
/*   write none of the three columns of either table.                     */
/*                                                                        */
/* A DELETE of an episode that registos are filed in is refused as        */
/* before, by the key of 0000.                                            */


/* ====================================================================== */
/* 4. THE FUNCTION: 0005's BODY, PLUS SEVEN LINES                         */
/* ====================================================================== */
/* CREATE OR REPLACE keeps the function's identity. Its owner (postgres,  */
/* pinned by 0060:90) and its privileges (EXECUTE for authenticated       */
/* alone, 0079:227-228) are untouched, so this file carries no ALTER      */
/* FUNCTION ... OWNER and no GRANT or REVOKE. SECURITY DEFINER and SET    */
/* search_path = '' are restated, because a replace without them would    */
/* reset both; the parameter list and its default are 0005's.             */
/*                                                                        */
/* The seven added lines are the two SET CONSTRAINTS statements, four     */
/* lines of comment and one blank line. Everything else, from DECLARE to  */
/* the final END, is byte for byte the text 0005 created (0005:117-246):  */
/* a diff of the two statements shows additions only. The pre-check pins  */
/* the md5 of the body this file replaces, and the post-check the md5 of  */
/* the body below.                                                        */
/*                                                                        */
/* The SECURITY DEFINER count does not move: one function is replaced,    */
/* none is added. Measured on the same stack: owner, SECURITY DEFINER,    */
/* search_path and ACL read the same before and after the replace.        */


/* ====================================================================== */
/* 5. THE LOCKS, THE TIME, AND WHY CLOSED HOURS                           */
/* ====================================================================== */
/* Measured on the same stack, in one transaction, reading pg_locks       */
/* after each statement. Every lock is held until the COMMIT.             */
/*   K1  CREATE UNIQUE INDEX: SHARE on clinical_episodes. A write to an   */
/*       episode waits; reads go on.                                      */
/*   K2  ADD CONSTRAINT ... NOT VALID: SHARE ROW EXCLUSIVE on             */
/*       clinical_records and on clinical_episodes. A write to either     */
/*       waits; reads go on.                                              */
/*       VALIDATE CONSTRAINT: SHARE UPDATE EXCLUSIVE on clinical_records  */
/*       and ROW SHARE on clinical_episodes, both weaker than the locks   */
/*       already held. It reads every registo that names an episode.      */
/*   M1  no table lock.                                                   */
/* So from K1 on no episode is written, and from K2 on no registo, until  */
/* the COMMIT; every read goes on. This file creates no policy.           */
/*                                                                        */
/* It is not catalogue-only: it builds an index and reads both tables.    */
/* Strategy ruled closed hours for it (S-1008-B).                         */
/*                                                                        */
/* K2 IS ADDED NOT VALID AND VALIDATED BY THE NEXT STATEMENT. Inside one  */
/* transaction that holds no lock for less time than a single ADD         */
/* CONSTRAINT would. It makes the read of the rows a statement of its     */
/* own, with its own statement_timeout and its own line in the            */
/* applier's output.                                                      */
/*                                                                        */
/* THE TIME, on that stack. On its seed (7 episodes, 13 registos, 9 of    */
/* them in an episode): K1 24 ms, the ADD 7 ms, the VALIDATE 6 ms. On     */
/* invented rows written and rolled back in the same transaction (60,007  */
/* episodes, 150,013 registos, 120,009 of them in an episode, each with   */
/* an empty form): K1 94 ms, the ADD 3 ms, the VALIDATE 47 ms.            */
/* Production's row counts and sizes were not read for this file; the     */
/* pre-check prints them.                                                 */
/*                                                                        */
/* THE THREE SET LOCAL LINES. The first two are the lines every           */
/* migration carries from 0100 on (the lead's ruling (b) of 2026-10-01;   */
/* values accepted by R10; scripts/migration-timeouts.test.mjs refuses a  */
/* file without them): a lock this transaction cannot take in 5 seconds   */
/* is a clean failure with nothing applied. The third is strategy's       */
/* ruling of 2026-10-06 (Q5 of S-1006-A), as in 0102: a sitting whose     */
/* session stalls with the transaction open is ended by the server after  */
/* 15 seconds idle, and its locks are released.                           */


/* ====================================================================== */
/* 6. WHAT THIS FILE DOES NOT DO                                          */
/* ====================================================================== */
/* - It creates, alters and drops no policy, and grants and revokes       */
/*   nothing.                                                             */
/* - It adds no function. merge_patients keeps its owner, its ACL and     */
/*   its place in the SECURITY DEFINER count.                             */
/* - It does not touch enforce_clinical_record_immutability or its        */
/*   trigger. A NO ACTION key never updates a registo, so the trigger     */
/*   never fires because of it.                                           */
/* - It adds and changes no column. The key of 0000 and the nine indexes  */
/*   the two tables already carry stay as they are.                       */
/* - It writes no row and repairs none. VALIDATE reads every registo      */
/*   that names an episode; if one does not fit K2 the statement fails    */
/*   and the whole transaction rolls back with nothing applied. The       */
/*   pre-check reads the same rows first, and anything but zero there is  */
/*   a STOP: a repair is its own ruled operation (strategy, S-1008-B).    */
/* - NOT IDEMPOTENT, on purpose: a second run fails at K1, because the    */
/*   index exists, and changes nothing.                                   */


/* ====================================================================== */
/* 7. WHAT MOVES AT PROMOTION                                             */
/* ====================================================================== */
/* The rename, the journal entry and the mirror into                      */
/* supabase/migrations. packages/db/src/schema.ts declares K1 and K2 in   */
/* the commit that carries this file.                                     */
/*                                                                        */
/* No function is added, so                                               */
/* packages/db/scripts/check-security-definer-owner.mjs keeps its count,  */
/* and packages/db/tests/security-definer-owner.test.ts reads             */
/* merge_patients as SECURITY DEFINER with its one owner pin (0060).      */
/*                                                                        */
/* THE DB-GATED ARMS FLIP BY THEMSELVES. The suites that ask the schema   */
/* whether K2 exists run its arms on a database that has it, and THROW    */
/* on one that holds half of it, or that lacks it once a promoted file    */
/* names it. None needs an edit at promotion.                             */


/* ====================================================================== */
/* 8. THE STATEMENTS                                                      */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint
SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint

/* K1. `id` alone is already unique (the primary key), so this index can  */
/* hold no duplicate: it cannot fail on the rows.                         */
CREATE UNIQUE INDEX clinical_episodes_id_patient_tenant_uq
  ON public.clinical_episodes (id, patient_id, tenant_id);--> statement-breakpoint

/* K2. Added NOT VALID, then validated by the statement after it          */
/* (section 5).                                                           */
ALTER TABLE public.clinical_records
  ADD CONSTRAINT clinical_records_episode_patient_tenant_fk
  FOREIGN KEY (episode_id, patient_id, tenant_id)
  REFERENCES public.clinical_episodes (id, patient_id, tenant_id)
  DEFERRABLE INITIALLY IMMEDIATE
  NOT VALID;--> statement-breakpoint

ALTER TABLE public.clinical_records
  VALIDATE CONSTRAINT clinical_records_episode_patient_tenant_fk;--> statement-breakpoint

/* M1. 0005's merge_patients, with the two SET CONSTRAINTS statements     */
/* (sections 2 and 4).                                                    */
CREATE OR REPLACE FUNCTION public.merge_patients(p_source_id uuid, p_target_id uuid, p_actor_id uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_tenant_id    uuid;
  v_actor        uuid;
  c_appointments integer;
  c_episodes     integer;
  c_records      integer;
  c_attachments  integer;
  c_invoices     integer;
  c_locations    integer;
BEGIN
  v_tenant_id := public.jwt_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION
      'merge_patients: no tenant context — call only inside a tenant-scoped transaction'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Audit actor: explicit param from the server action, else the JWT `sub`.
  v_actor := COALESCE(
    p_actor_id,
    NULLIF((current_setting('request.jwt.claims', true)::jsonb) ->> 'sub', '')::uuid
  );

  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'merge_patients: source and target are the same patient (%)', p_source_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Both patients must be active members of the caller's tenant. Lock them.
  PERFORM 1 FROM public.patients
    WHERE id = p_source_id AND tenant_id = v_tenant_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_patients: source patient % not found in tenant %', p_source_id, v_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1 FROM public.patients
    WHERE id = p_target_id AND tenant_id = v_tenant_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_patients: target patient % not found in tenant %', p_target_id, v_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Re-point dependents. Every WHERE pins tenant_id = v_tenant_id.
  UPDATE public.appointments      SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_appointments = ROW_COUNT;

  -- The episodes and their registos change patient in two statements. The
  -- key that ties a registo to its episode's patient is checked once, after
  -- both, at SET CONSTRAINTS ... IMMEDIATE below.
  SET CONSTRAINTS public.clinical_records_episode_patient_tenant_fk DEFERRED;

  UPDATE public.clinical_episodes SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_episodes = ROW_COUNT;

  -- clinical_records: signed/locked rows are immutable. Re-parent through the
  -- gated trigger path — flag this transaction, change ONLY patient_id, unflag.
  PERFORM set_config('app.merge_reparent', 'on', true);
  UPDATE public.clinical_records  SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_records = ROW_COUNT;
  PERFORM set_config('app.merge_reparent', 'off', true);
  -- Checked here: every registo that moved names the patient its episode names.
  SET CONSTRAINTS public.clinical_records_episode_patient_tenant_fk IMMEDIATE;

  UPDATE public.attachments       SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_attachments = ROW_COUNT;

  UPDATE public.invoices          SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_invoices = ROW_COUNT;

  -- patient_locations: re-point, but respect the unique
  -- (tenant_id, patient_id, location_id) — drop source links the target
  -- already holds, then move the remainder.
  DELETE FROM public.patient_locations s
   WHERE s.patient_id = p_source_id AND s.tenant_id = v_tenant_id
     AND EXISTS (
       SELECT 1 FROM public.patient_locations t
        WHERE t.patient_id = p_target_id AND t.tenant_id = v_tenant_id
          AND t.location_id = s.location_id
     );
  UPDATE public.patient_locations SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_locations = ROW_COUNT;

  -- Soft-handle the source — mark merged + soft-delete. Never hard delete.
  UPDATE public.patients
     SET merged_into_id = p_target_id,
         deleted_at     = now(),
         updated_at     = now()
   WHERE id = p_source_id AND tenant_id = v_tenant_id;

  -- One audit row per merge (actor, source, target, counts moved).
  INSERT INTO public.audit_log
    (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_tenant_id, v_actor, 'patient.merge', 'patient', p_source_id,
    jsonb_build_object(
      'source_patient_id', p_source_id,
      'target_patient_id', p_target_id,
      'moved', jsonb_build_object(
        'appointments',      c_appointments,
        'clinical_episodes', c_episodes,
        'clinical_records',  c_records,
        'attachments',       c_attachments,
        'invoices',          c_invoices,
        'patient_locations', c_locations
      )
    )
  );

  RETURN jsonb_build_object(
    'source_patient_id', p_source_id,
    'target_patient_id', p_target_id,
    'moved', jsonb_build_object(
      'appointments',      c_appointments,
      'clinical_episodes', c_episodes,
      'clinical_records',  c_records,
      'attachments',       c_attachments,
      'invoices',          c_invoices,
      'patient_locations', c_locations
    )
  );
END;
$$;--> statement-breakpoint
