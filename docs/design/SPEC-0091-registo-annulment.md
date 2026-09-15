# SPEC 0091, SR62-PU5: registo annulment (reason required, struck through and visible, locked records annullable)

**Status: SPEC ONLY. No migration file exists, and this document authors none.**
Author: PURPLE, 2026-09-14 overnight dispatch (SR-62). Derived from `origin/main` at `1dde3111`.

**Number and order.** 0091 is taken only after 0090 is applied and merged (one migration in
flight). If that order moves, the number moves with it.

Card: `SR62-PU5-registo-annulment-reason-required-and-visible`. Closes question
Q-SR62-PU5-1 (`docs/design/QUESTIONS.md`).

---

## 0. Rulings in force

**Owner, 2026-09-14 overnight, option (a):**

1. The annulment reason is REQUIRED.
2. Annulled records are STRUCK THROUGH and REMAIN VISIBLE. They are not hidden.
3. The 902 imported LOCKED records BECOME ANNULLABLE.

**Standing rules, restated:**

- **Registos clinicos NEVER get a delete button. Annulment only.**
- **Clinical authorship NEVER moves.** All 902 locked records stay where they are: same
  patient, same practitioner, same content, same signature fields.
- **`clinical_records_enforce_immutability` is NEVER disabled, bypassed or worked around,
  under any framing, in any option, by any lane.**

---

## 1. The mechanism

**Annulment is a row in a SEPARATE, append-only relation keyed to the record:
`record_annulments` (migration 0035, on main since W5-30). It is never an UPDATE of
`clinical_records`.**

- 0091 changes only `record_annulments` (a CHECK, a unique index, its two RLS policies)
  and the app.
- It contains no statement of any kind against `clinical_records`: no status value, no new
  column, no DDL.

**No new table is needed.** 0035 already has the shape: `id`, `tenant_id`, `record_id`
referencing `clinical_records(id)`, `reason`, `annulled_by_user_id`, `created_at`.
`annulRecord` (`apps/web/lib/clinical/records.ts:657-699`) already inserts that row and
never touches the record row.

What the rulings change is three things: who may insert, what a row must contain, and what
the UI does with it.

---

## 2. Proof, from the trigger itself, that the trigger permits this

### 2.1 The trigger binding

`packages/db/migrations/0001_rls.sql`, lines 252-255, sha256
`0c2324510a470cdac9e3a0d8794261ae8364a8fabfc6a085c755a4387d762525`:

```sql
CREATE TRIGGER clinical_records_enforce_immutability
  BEFORE UPDATE OR DELETE ON public.clinical_records
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_clinical_record_immutability();
```

Supabase mirror: `supabase/migrations/0001_rls.sql`, lines 256-259, sha256
`05f69a21a49c525336af247cf0ff97dce8e3355bb9c5050f6d47bf8acf451d53`.

### 2.2 The function, as last redefined

**No migration after 0005 redefines it.** `git grep` over `packages/db/migrations` on
`1dde3111` finds definitions only in 0001 and 0005 (0045 mentions it in a comment), and
finds no `DISABLE TRIGGER` or `DROP TRIGGER` anywhere.

`packages/db/migrations/0005_patient_merge_multilocation.sql`, lines 56-91, sha256
`11a1069205179fea953f5b7c8167e177575c5c7de18c93830dee408a04413d6f`:

```sql
CREATE OR REPLACE FUNCTION public.enforce_clinical_record_immutability()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('locked', 'signed') THEN
    -- Finalized rows can never be deleted.
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION
        'clinical_records %: status=% is finalized and immutable; cannot delete',
        OLD.id, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;

    -- Permit a merge re-parent: gated by app.merge_reparent, and only if
    -- patient_id is the sole changed column (content stays byte-identical).
    IF current_setting('app.merge_reparent', true) = 'on'
       AND NEW.patient_id IS DISTINCT FROM OLD.patient_id
       AND (to_jsonb(NEW) - 'patient_id' - 'updated_at')
         = (to_jsonb(OLD) - 'patient_id' - 'updated_at')
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'clinical_records %: status=% is finalized and immutable; create a new versioned record (addendum) instead',
      OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
```

Supabase mirror: `supabase/migrations/0005_patient_merge_multilocation.sql`, from line 60,
sha256 `26a974213e6ef1b3222c7e8fff1f39606cb2d3197213736cc86ed831f4adec19`.

This is the definition as authored in the repository. Production's live definition was not
read tonight (no production contact). The post-check in section 6 reads it.

### 2.3 Why an annulment passes, and why nothing else would

1. **Wrong relation, wrong operation.** The trigger is bound `BEFORE UPDATE OR DELETE ON
   public.clinical_records`. An annulment is an `INSERT INTO public.record_annulments`. The
   trigger is not invoked, so its body never runs.
2. **The foreign key does not update the parent.** `record_annulments.record_id REFERENCES
   clinical_records(id)` makes Postgres verify the parent row with a key-share row lock. A
   lock is neither an UPDATE nor a DELETE, and fires no user trigger on `clinical_records`.
3. **The alternative, a column on `clinical_records` "that the trigger excludes", does not
   exist in this trigger.**
   - For `OLD.status IN ('locked', 'signed')`, the function raises `check_violation` on
     EVERY update, with exactly one exception. That exception needs all three of:
     `app.merge_reparent = 'on'`; `patient_id` changed; and the row otherwise identical
     (`to_jsonb(NEW) - 'patient_id' - 'updated_at' = to_jsonb(OLD) - 'patient_id' -
     'updated_at'`).
   - Setting any annulment column changes `to_jsonb(NEW)` outside `patient_id`, so the
     trigger rejects it.
   - The only routes past that are: setting `app.merge_reparent` for something that is not a
     merge, `DISABLE TRIGGER`, or `session_replication_role = replica`. **Every one of those
     is a bypass. None is used, proposed or permitted.**
4. **A status value is ruled out for the same reason.** An `annulled` value in
   `record_status` would need `UPDATE clinical_records SET status = ...` on a locked row,
   which the final `RAISE EXCEPTION` in the function rejects.

**Explicit confirmation: no part of 0091 disables, bypasses, relaxes or works around
`clinical_records_enforce_immutability`. No statement in 0091 references the trigger or its
function, and none of the 902 locked rows is written.**

### 2.4 Made machine-checkable (in the same PR)

- **Static test on the 0091 file.** Case-insensitive, zero matches allowed for:
  - `clinical_records` inside any `ALTER`, `UPDATE`, `DELETE` or `TRUNCATE` statement;
  - `DISABLE TRIGGER` or `DROP TRIGGER`;
  - `enforce_clinical_record_immutability`;
  - `merge_reparent`;
  - `session_replication_role`.
- **DB-gated, trigger unchanged.** Before and after applying 0091: `pg_trigger.tgenabled =
  'O'` for the trigger, and
  `md5(pg_get_functiondef('public.enforce_clinical_record_immutability()'::regprocedure))`
  is unchanged.
- **DB-gated negative control: proves the wall still stands.**
  1. Annul a LOCKED record.
  2. Assert `md5(to_jsonb(r)::text)` for that record is unchanged.
  3. Run `UPDATE clinical_records SET data = data WHERE id = <that record>`, and assert it
     raises `check_violation`.

---

## 3. The migration: `record_annulments` only

### 3.1 Reason required on new rows

```sql
ALTER TABLE public.record_annulments
  ADD CONSTRAINT record_annulments_reason_required
  CHECK (reason IS NOT NULL AND btrim(reason) <> '') NOT VALID;
```

- **`NOT VALID`** keeps the existing NULL-reason rows as history, without rewriting them.
- The table has no UPDATE policy, so an edit can never re-check those rows.
- The constraint is never `VALIDATE`d unless the owner rules on those old rows.

### 3.2 One annulment per record

```sql
CREATE UNIQUE INDEX record_annulments_one_per_record
  ON public.record_annulments (tenant_id, record_id);
```

- `annulRecord` refuses a second annulment by count-then-insert (`records.ts:673-677`), and
  two concurrent requests can both pass that count. The index closes the race.
- The section 6 pre-check is required: if production already holds a duplicate, the apply
  HALTS.

### 3.3 RLS: replace the two tenant-wide policies

**The gap today.** 0035's policies admit ANY authenticated role in the tenant:

- reception can read every annulment reason, although 0045 denies reception every clinical
  record;
- any role can insert.

**They become:**

```sql
DROP POLICY "record_annulments_tenant_select" ON public.record_annulments;
DROP POLICY "record_annulments_tenant_insert" ON public.record_annulments;

CREATE POLICY "record_annulments_select" ON public.record_annulments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND EXISTS (SELECT 1 FROM public.clinical_records r WHERE r.id = record_id)
  );

CREATE POLICY "record_annulments_insert" ON public.record_annulments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND annulled_by_user_id = (select auth.uid())
    AND (select public.jwt_role()) IN ('owner', 'therapist')
    AND EXISTS (
      SELECT 1
        FROM public.clinical_records r
       WHERE r.id = record_id
         AND r.tenant_id = (select public.jwt_tenant_id())
         AND r.status IN ('locked', 'signed')
         AND (
           (select public.jwt_role()) = 'owner'
           OR r.practitioner_id = (select auth.uid())
           OR public.clinical_therapist_sees_patient(r.patient_id)
         )
    )
  );
```

- **SELECT follows the record.** Its subquery on `clinical_records` runs under the viewer's
  own `clinical_records_select`
  (`packages/db/migrations/0045_clinical_records_location_rls.sql:221-240`): owner sees
  all, admin is location-scoped, therapist sees authored records or own patients, reception
  sees none. An annulment is visible exactly where its record is.
- **INSERT mirrors the existing write rules.** It follows `clinical_records_insert`
  (0045:252-267) and the app capability `clinical_records:author` (held by owner and
  therapist, not by admin or reception; `packages/auth/permissions.ts`). It adds the status
  gate and pins the actor.
- **No cycle.** No `clinical_records` policy reads `record_annulments`.
- **FOR SELECT and FOR INSERT only.**
- **Grants stay exactly as 0035 set them, on purpose.** 0035 keeps the full DML grant so
  UPDATE and DELETE deny as 0 rows through the missing policies, per 0003's `audit_log`
  note. 0091 does not reverse that.

---

## 4. The app (same PR, merged after the apply)

- **`annulRecord`** (`records.ts:657-699`):
  - The status gate becomes `IN ('locked', 'signed')`. A draft is refused with a new
    `not_finalized` code, which replaces `not_signed`.
  - The reason is required: trimmed, 1 to 500 characters (the bound PU-4 uses).
  - The audit row `clinical_record.annul` carries `{ hadReason: true, recordStatus: 'locked'
    | 'signed' }`. These are enum values only, so the metadata contract still refuses prose
    (rule 7). The contract test is updated.
- **`listRecords`** (`records.ts:140-161`): the `includeAnnulled` filter is removed.
  Annulled records are always returned, with `annulment: { reason, annulledAt,
  annulledByName }`.
- **The Registos tab** (`apps/web/app/patients/[id]/page.tsx:94-95, 216-219, 446-451`):
  - The `?anulados` parameter and the "Mostrar anulados" link are removed.
  - `clinical.showAnnulled` and `clinical.hideAnnulled` are removed from both string files.
  - An annulled row stays in place in the history, with its title and date struck through
    and the ANULADO badge. The badge is the accessible signal; the strike-through is visual
    only.
- **Opening an annulled registo:** a banner shows the date, who annulled it and the reason.
  The content is shown unchanged and stays read-only, as it already is for locked and signed
  records.
- **The Anular control** (`apps/web/app/patients/[id]/record-lifecycle-actions.tsx:75-77`):
  - `canAnnul = (status === 'locked' || status === 'signed') && !annulled`.
  - The reason field is required, and the confirm button stays disabled until the reason
    contains a non-whitespace character.
  - The password gate stays.
- **Old annulments with no reason** show the fixed label "Anulado sem motivo registado".
  Ruled 2026-09-14 (Q-SR62-P4-3). The English string "Annulled, no reason recorded" is the
  translation carried in the question; only the Portuguese copy was ruled.

---

## 5. What 0091 does not do

- **No delete button.** 0091 adds none, to any registo.
- **The existing DRAFT "Eliminar" STAYS. Ruled 2026-09-14 (Q-SR62-P4-2).**
  - A DRAFT registo shows a password-gated "Eliminar" that hard-deletes it
    (`record-lifecycle-actions.tsx`, via `hardDeleteClinicalRecord` in `records.ts`).
  - The ruling: "registos never get a delete button" was ruled about finalized clinical
    history. A draft is not history, so the draft Eliminar stays.
  - The condition that comes with it: the button is provably unreachable for a LOCKED or
    SIGNED record, server side as well as in the UI.
    - Server: `hardDeleteClinicalRecord` refuses any status other than `draft` with the
      named code `not_draft` before any write, and its DELETE statement also carries
      `AND status = 'draft'`.
    - UI: the control renders only when `status === 'draft'`.
    - SR-62 D2 pins both with tests: LOCKED and SIGNED refused with `not_draft`, DRAFT
      still deleted, and no Eliminar on a seeded LOCKED registo in e2e.
  - `clinical_records_enforce_immutability` stays the backstop behind that app-layer
    refusal. It is never disabled, bypassed or worked around, and the refusal neither
    replaces nor relaxes it.
  - This spec neither removes that button nor widens it.
- **Authorship does not move.** On an annulled record, `practitioner_id`, `signed_by`,
  `signed_at`, `patient_id` and `created_at` are untouched, and the trigger enforces that
  anyway. `annulled_by_user_id` is a new fact about the annulment, not a change of author.
- **No un-annul.** The relation is append-only, so an annulment is permanent. If a mistaken
  annulment ever happens, it goes to the owner as a question; it is not a feature here.

---

## 6. Apply

- Authored after 0090 is applied and merged. PURPLE authors, GREEN applies (SR-63). Apply
  before merge.
- **Pre-check (read-only, counts only):**
  - `SELECT count(*) FROM (SELECT tenant_id, record_id FROM record_annulments GROUP BY 1, 2
    HAVING count(*) > 1) d` must be 0, or the apply HALTS.
  - Record the count of rows `WHERE reason IS NULL OR btrim(reason) = ''` (informational).
  - Record `tgenabled` for the trigger, and the `md5(pg_get_functiondef(...))` value.
- **Post-check:**
  - the trigger's `tgenabled` and the function md5 equal the pre-check values;
  - both policies are present, by name, with their commands;
  - the CHECK is present, by name, with `convalidated = false`;
  - the unique index is present;
  - the `clinical_records` row count equals the pre-check count.

---

## 7. Tests (same PR)

**DB-gated:**

- **Owner annuls a LOCKED record:** the row is inserted, the record's `md5(to_jsonb)` is
  unchanged, and section 2.4's trigger checks and `check_violation` control pass.
- **Owner annuls a SIGNED record:** inserted.
- **DRAFT record:** the insert is refused by WITH CHECK.
- **Reasons:** a NULL reason and a whitespace-only reason are refused; a pre-existing
  NULL-reason row stays readable.
- **Second annulment of the same record:** unique violation.
- **Reception:** SELECT returns 0 rows, and INSERT is refused.
- **Admin:** INSERT is refused; SELECT returns only annulments of records the admin can read.
- **Therapist:**
  - own patient: SELECT and INSERT allowed;
  - another therapist's patient: SELECT returns 0, INSERT refused;
  - `annulled_by_user_id` set to another user: refused.
- **Measurement rule:** each principal's read is asserted narrowed and non-empty before any
  "zero" assertion.

**E2E** (`apps/web/e2e/clinical.spec.ts`, the W5-30 test rewritten): Anular on a LOCKED
registo.

1. The confirm button stays disabled until a reason is typed.
2. After confirm and a reload, the row is still in the list, with the ANULADO badge and a
   `text-decoration-line` that includes `line-through`.
3. There is no "Mostrar anulados" link.
4. Opening the registo shows the reason.

---

## 8. Questions logged (`docs/design/QUESTIONS.md`)

- **Q-SR62-P4-1, who may annul. OPEN, pending the owner.** May a therapist annul a registo
  authored by a DIFFERENT practitioner (for example, an imported record authored by JP) when
  the patient is theirs? Recommended default: yes, mirroring the existing write matrix in
  section 3.3, which is also what the app allows today for signed records.
- **Q-SR62-P4-2, the draft Eliminar. RULED 2026-09-14: it STAYS.** The rule covers
  finalized clinical history, and a draft is not history. See section 5 for the condition
  that it is unreachable for locked and signed records.
- **Q-SR62-P4-3, the label for old annulments with no reason. RULED 2026-09-14:**
  "Anulado sem motivo registado".
