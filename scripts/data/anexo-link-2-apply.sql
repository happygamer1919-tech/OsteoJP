-- ============================================================================
-- ANEXO LINK, STAGE 2 of 3: THE LINK. ONE TRANSACTION.
--
-- Card INC-imported-fichas-sem-anexos-originals-are-patient-level, ruling (a).
--
-- WRITES: public.attachments.clinical_record_id on exactly N rows, and ONE
-- public.audit_log row carrying every linked id. NOTHING ELSE. No
-- clinical_records row is written, and P8 proves it rather than asserting it.
--
-- ==========================================================================
-- THE TWO CARRIES COME FROM STAGE 1 OF THE SAME SITTING
-- ==========================================================================
-- Run it as:
--   psql ... -v anexo_expected_count=<n> -v anexo_expected_digest=<md5> -f <this file>
--
-- They are read through set_config/current_setting and NEVER interpolated into
-- the dollar-quoted block below: a `:'name'` inside `$anexo$ ... $anexo$` is not
-- substituted by psql, it is literal text, and the block would compare against
-- the string ":'anexo_expected_count'" while looking correct.
--
-- THE DIGEST IS THE LOAD-BEARING ONE. A count alone cannot tell "the same 220"
-- from "220 of which one is different": a document uploaded between the preview
-- and this command keeps the total and changes the membership. The digest is
-- md5 over the ordered (attachment, registo) pairs, so any substitution halts.
--
-- Any line starting "STOP:" means the transaction aborted and NOTHING was
-- written. Success is the final "ANEXO LINK STAGE 2 DONE" notice.
--
-- Run (ONE line, deliberately: a backslash continuation is the shape the paste
-- guard forbids, and the owner copies this recipe out of this header):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -v anexo_expected_count=<from stage 1> -v anexo_expected_digest=<from stage 1> -f scripts/data/anexo-link-2-apply.sql
-- ============================================================================

\pset pager off
\timing off

SELECT set_config('anexo.expected_count',  :'anexo_expected_count',  false),
       set_config('anexo.expected_digest', :'anexo_expected_digest', false);

do $anexo$
declare
  c_action  constant text := 'attachment.anexo_link.backfill';
  c_card    constant text := 'INC-imported-fichas-sem-anexos-originals-are-patient-level';

  v_expected_count  int;
  v_expected_digest text;
  v_tenant          uuid;
  v_tenants         int;
  v_n               int;
  v_digest          text;
  v_doubled         int;
  v_mismatch        int;
  v_unlocked        int;
  v_att_ids         uuid[];
  v_rec_ids         uuid[];
  v_total_before      int;
  v_patient_before    int;
  v_with_patient_before int;
  v_cr_rows_before  int;
  v_cr_max_before   timestamptz;
  v_cr_rows_after   int;
  v_cr_max_after    timestamptz;
  v_updated         int;
  v_registos        int;
begin
  v_expected_count  := nullif(current_setting('anexo.expected_count',  true), '')::int;
  v_expected_digest := nullif(current_setting('anexo.expected_digest', true), '');
  if v_expected_count is null or v_expected_digest is null then
    raise exception 'STOP: both -v anexo_expected_count and -v anexo_expected_digest are required, from stage 1 of THIS sitting';
  end if;

  -- ==========================================================================
  -- P1. A RE-RUN IS REFUSED ON THIS BLOCK'S OWN AUDIT ROW.
  -- ==========================================================================
  if exists (select 1 from public.audit_log where action = c_action) then
    raise exception 'STOP: this block has already run (audit row % present)', c_action;
  end if;

  -- ==========================================================================
  -- P2. THE CANDIDATE SET, RECOMPUTED HERE. Stage 1 is evidence, not input.
  -- ==========================================================================
  create temp table anexo_pick on commit drop as
  with named as (
    select s.tenant_id,
           s.imported_entity_id as record_id,
           s.tenant_id::text || '/migration/fisiozero/' || btrim(part) as storage_path
      from public.migration_staging_rows s
     cross join lateral regexp_split_to_table(coalesce(s.raw ->> 'FICHEIRO', ''), '[,;]') as part
     where s.entity_type = 'clinical_record'
       and s.status = 'imported'
       and s.imported_entity_id is not null
       and btrim(part) <> ''
  )
  select n.tenant_id,
         n.record_id,
         a.id          as attachment_id,
         a.patient_id  as attachment_patient,
         cr.patient_id as record_patient,
         cr.status::text as record_status
    from named n
    join public.attachments a
      on a.tenant_id = n.tenant_id and a.storage_path = n.storage_path
    join public.clinical_records cr on cr.id = n.record_id
   where a.clinical_record_id is null;

  select count(distinct tenant_id) into v_tenants from anexo_pick;
  if v_tenants > 1 then
    raise exception 'STOP: the candidate set spans % tenants; this block links one tenant at a time', v_tenants;
  end if;
  -- `select distinct`, NOT max(): Postgres has no max() for uuid, and the check
  -- immediately above has already refused anything but a single tenant, so
  -- there is exactly one row to take.
  select distinct tenant_id into v_tenant from anexo_pick;

  -- ==========================================================================
  -- P3, P4, P5. THE THREE REFUSALS. Each one is a link that would be a GUESS.
  -- ==========================================================================
  select count(*) into v_doubled
    from (select attachment_id from anexo_pick group by attachment_id having count(distinct record_id) > 1) x;
  if v_doubled > 0 then
    raise exception 'STOP: % document(s) are named by more than one registo; the link is not deterministic', v_doubled;
  end if;

  select count(*) into v_mismatch from anexo_pick where record_patient is distinct from attachment_patient;
  if v_mismatch > 0 then
    raise exception 'STOP: % document(s) belong to a different patient than their registo', v_mismatch;
  end if;

  -- EVERY IMPORTED REGISTO IS LOCKED, and the app refuses attaching to a
  -- non-draft (clinical/storage.ts confirmAttachment returns 'finalized'). This
  -- block does in the database what the screen refuses, which is a DELIBERATE
  -- exception for imported history - so it must not also sweep up a registo
  -- somebody is still editing.
  select count(*) into v_unlocked from anexo_pick where record_status <> 'locked';
  if v_unlocked > 0 then
    raise exception 'STOP: % target registo(s) are not locked; this backfill is for imported, locked history only', v_unlocked;
  end if;

  -- ==========================================================================
  -- P6. THE CARRIES MUST STILL DESCRIBE WHAT IS HERE.
  -- ==========================================================================
  select count(*),
         coalesce(md5(string_agg(attachment_id::text || ':' || record_id::text, ','
                                  order by attachment_id, record_id)), 'EMPTY')
    into v_n, v_digest
    from anexo_pick;

  if v_n <> v_expected_count then
    raise exception 'STOP: stage 1 measured % candidates, this command sees %', v_expected_count, v_n;
  end if;
  if v_digest is distinct from v_expected_digest then
    raise exception 'STOP: the candidate SET has changed since stage 1 (digest % vs %)', v_expected_digest, v_digest;
  end if;
  if v_n = 0 then
    raise exception 'STOP: there is nothing to link; refusing to write an audit row for a no-op';
  end if;

  raise notice 'P6 % documents will be linked, digest %', v_n, v_digest;

  -- ==========================================================================
  -- P7. THE BEFORE COUNTS, AND THE IMMUTABILITY BASELINE.
  -- ==========================================================================
  select count(*) into v_total_before from public.attachments;
  select count(*) into v_patient_before from public.attachments where clinical_record_id is null;
  -- TWO DIFFERENT "PATIENT-LEVEL" COUNTS, AND ONLY ONE OF THEM IS AN INVARIANT.
  -- `clinical_record_id IS NULL` is what the Documentos tab filtered on, and it
  -- DROPS by exactly N here - that is the point of the operation. `patient_id IS
  -- NOT NULL` is the one that must NOT move: a link sets the registo and never
  -- clears the patient, so a document that stopped having a patient would mean
  -- this block wrote a column it does not name. Stage 3 asserts it.
  select count(*) into v_with_patient_before from public.attachments where patient_id is not null;
  select count(*), max(updated_at) into v_cr_rows_before, v_cr_max_before from public.clinical_records;
  select count(distinct record_id) into v_registos from anexo_pick;
  select array_agg(attachment_id order by attachment_id),
         array_agg(distinct record_id)
    into v_att_ids, v_rec_ids
    from anexo_pick;

  -- ==========================================================================
  -- THE AUDIT ROW, WRITTEN BEFORE THE UPDATE so a re-run cannot race it.
  -- Counts and ids only: no file name, no patient name. A delivery file name is
  -- patient-adjacent and audit_log is append-only and kept for ever
  -- (apps/web/lib/audit/metadata-contract.ts).
  -- ==========================================================================
  insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_tenant, null, c_action, 'attachment', null,
          jsonb_build_object(
            'card', c_card,
            'source', 'owner_sql_editor',
            'ruling', '2026-09-13 (a)',
            'linked_count', v_n,
            'digest', v_digest,
            'linked_attachment_ids', to_jsonb(v_att_ids),
            'linked_record_ids', to_jsonb(v_rec_ids),
            'registos_touched', v_registos,
            'attachments_total_before', v_total_before,
            'attachments_unlinked_before', v_patient_before,
            'attachments_with_patient_before', v_with_patient_before,
            'clinical_records_rows_before', v_cr_rows_before));

  -- ==========================================================================
  -- THE WRITE. One column, on exactly the picked rows.
  -- ==========================================================================
  update public.attachments a
     set clinical_record_id = p.record_id
    from anexo_pick p
   where a.id = p.attachment_id
     and a.clinical_record_id is null;
  get diagnostics v_updated = row_count;
  if v_updated <> v_n then
    raise exception 'STOP: linked % rows, expected exactly %', v_updated, v_n;
  end if;

  -- ==========================================================================
  -- P8. NO clinical_records ROW WAS WRITTEN, AND THE TRIGGER DID NOT FIRE.
  -- ==========================================================================
  -- This is the HALT the ruling asks for, proved rather than promised. The
  -- immutability trigger is BEFORE UPDATE OR DELETE on clinical_records; if this
  -- block had touched that table, `updated_at` would have moved or the trigger
  -- would have raised. Both are checked inside the same transaction.
  select count(*), max(updated_at) into v_cr_rows_after, v_cr_max_after from public.clinical_records;
  if v_cr_rows_after <> v_cr_rows_before then
    raise exception 'STOP: clinical_records row count moved % -> %; this block must not write that table',
      v_cr_rows_before, v_cr_rows_after;
  end if;
  if v_cr_max_after is distinct from v_cr_max_before then
    raise exception 'STOP: clinical_records.updated_at moved (% -> %); the immutability trigger would have fired',
      v_cr_max_before, v_cr_max_after;
  end if;

  raise notice 'P8 clinical_records untouched: % rows, max(updated_at) %', v_cr_rows_after, coalesce(v_cr_max_after::text, '(none)');
  raise notice 'ANEXO LINK STAGE 2 DONE: % documents linked to % registos, digest %', v_updated, v_registos, v_digest;
end
$anexo$;
