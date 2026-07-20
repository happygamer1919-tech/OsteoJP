# W10-01 findings - Cloud DB patient-domain cleanup recon (Wave 10 Dados Reais e Isolamento)

> Loop: `docs/loops/wave-10/W10-01-cleanup-recon.md`. Read-only recon, authored 2026-07-20. **No DB write of any kind was performed.** All cloud reads ran inside a single `SET TRANSACTION READ ONLY` transaction on `DATABASE_URL_DIRECT` (Supabase project `jaxmkwoxjcgzkwxgbayx`, session role `postgres`), counts/ids/timestamps only, zero patient PII printed, credential-free. This document ends in a **versioned PROPOSED CLEANUP PLAN (PLAN v1)** that W10-02 executes ONLY after the owner replies `AUTORIZO LIMPEZA plan v1`.

## (a) Inventory - patient-domain row counts by state

Connected as `session_user = current_user = postgres`. `relforcerowsecurity = false` on `patients` / `appointments` / `clinical_records`, so the `postgres` owner role **bypasses RLS** and these counts are raw across the whole database (not tenant-filtered). All rows sit in a **single tenant** `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` (distinct tenants in patients/appointments/records = 1 each).

| Table | Total | Breakdown |
|-------|------:|-----------|
| `patients` | **46** | live (`deleted_at IS NULL`, not merged) = 15; soft-deleted (`deleted_at NOT NULL`) = 31; merge-marked = 0 |
| `appointments` | **15** | scheduled 11, confirmed 0, completed 2, cancelled 2, no_show 0 |
| `clinical_records` | **34** | draft 29, locked 0, **signed 5**; AI-pending (`ai_review_state IN ('pending_review','in_review')`) = 2 (both `status=draft`); addendum versions (`supersedes_id NOT NULL`) = 5 |
| `record_annulments` | **0** | append-only; nothing to consider |
| `patient_pack_instances` | **0** | pack DEFINITIONS (`service_packs`=14) are catalog, retained |
| `patient_note_revisions` | **4** | append-only note history |
| `appointment_notes` | **0** | |
| `clinical_episodes` | **53** | |
| `attachments` | **5** | 1 on a signed record, 2 with `clinical_record_id NULL` (patient-linked only) |
| `patient_locations` | **0** | |
| `patient_form_submissions` | **0** | |
| `invoices` | **0** | (0 patient-linked) |
| `analytics_events` | **7** | **0 patient-linked** (`patient_id NULL` on all 7) - NOT patient-domain |
| `ai_ingestion_requests` | **2** | both reference `status=draft` clinical_records; both `accepted` |

**Immutability-blocked set: 5 `signed` clinical_records (0 locked, 0 annulled).**

## (b) Synthetic/real boundary - CONFIRMED SYNTHETIC by all available evidence, with two residual slices flagged for explicit owner confirmation

No affirmatively-real patient row was found. Every aggregate fingerprint indicates 100 percent synthetic patient-domain data, consistent with the owner brief 2026-07-20 (the clinic starts real usage now; nothing real has entered yet):

- **Single tenant** (`3a2d0711-...`); single clinic dataset.
- **Single external email domain.** Of 46 patients: 10 null email, 7 free-provider (gmail/hotmail/etc.), 29 non-free - and those 29 share **exactly ONE** distinct non-free domain (`distinct_non_free_domains = 1`). Real intake produces diverse domains; one domain across 29 patients is a seed-generator fingerprint.
- **Single provenance.** Patients were created by only two sources: `created_by NULL` (31 - the exact soft-deleted set) and ONE staff account `48a34faa-2692-40fd-b58d-8ba0c1624e9b` (15). Real multi-clinician usage would show many creators.
- **65 percent bare rows.** 30 of 46 patients have NO appointment and NO clinical record; only 8 have an appointment, 12 have a record. Real patients carry activity.
- **Dev-window timestamps only.** patients `created_at` 2026-06-01 -> 2026-07-20; clinical_records 2026-07-08 -> 2026-07-20. Entirely within the QA/dev period.
- **Zero synthetic-name false-negatives that matter:** `full_name` matched no obvious test token, but that is expected of a realistic seed generator and is outweighed by the single-domain + single-creator + bare-row evidence.

**Two residual slices the owner must consciously confirm as synthetic before authorizing (they cannot be certified from aggregates alone, because this recon deliberately printed NO patient PII):**
1. **The 15 patients created by staff account `48a34faa`** (8 with appointments, 12 with records) - entered through the UI during real-therapist-entry testing.
2. **The 4 patients owning the 5 signed fichas** (see (e)) - signed clinical records are the artifact that most resembles a real consultation, and they are the BLOCKED residue regardless.

This is **not** a Field-6 HALT: no signal points at any specific row being real (every signal points the other way). Per the loop's two-step design (recon proposes, owner authorizes), the owner's `AUTORIZO LIMPEZA plan v1` reply **doubles as the boundary ruling** on these two slices. Filed as **Q-W10-01-1** in QUESTIONS.md.

## (c) FK / back-pointer map (confirmed against `packages/db/src/schema.ts`, head 0037)

Every patient-domain FK is `ON DELETE NO ACTION ON UPDATE NO ACTION` **except `tenant_id`** (`ON DELETE CASCADE`). Nothing else cascades or sets null, so **a purge must delete children before parents (bottom-up)**; out-of-order deletion raises FK error `23503`.

- **-> `patients.id`:** `appointments.patient_id` + `appointments.patient_2_id`, `patient_locations.patient_id`, `clinical_episodes.patient_id`, `clinical_records.patient_id`, `attachments.patient_id`, `appointment_notes.patient_id`, `patient_note_revisions.patient_id`, `patient_pack_instances.patient_id`, `invoices.patient_id`, `patient_form_submissions.patient_id`, `analytics_events.patient_id`.
- **-> `appointments.id`:** `appointment_notes.appointment_id`, `clinical_records.appointment_id`, `invoices.appointment_id`. (Bare-uuid non-FK pointers: `recurrence_parent_id`, `booking_group_id`, `batch_id` - no constraint, ignore for ordering.)
- **-> `clinical_records.id`:** `clinical_records.supersedes_id` (self-FK addendum chain), `attachments.clinical_record_id`, `record_annulments.record_id`, `ai_ingestion_requests.clinical_record_id`, `patient_form_submissions.clinical_record_id`, `clinical_records.episode_id` -> `clinical_episodes.id`.
- **Self-FK consequence:** `clinical_records.supersedes_id` -> `clinical_records.id` (NO ACTION). Within a patient, delete the **superseding (newer) record before the superseded (older)** one, or the delete fails.

## (d) Sanctioned delete paths and their coverage

All four app hard-delete paths share the scrypt gate `verifyDeletePassword` (hash in `tenants.settings.secrets.appointmentDeletePasswordHash`; present = 1, confirmed). **Every app path is reference-guarded and cannot bulk-purge:**

- `hardDeletePatient(id, password)` (`apps/web/lib/patients/actions.ts:246`, `settings:manage`): **refuses** any patient with clinical_records or any other reference. Cannot delete any of the 16 patients that carry records/appointments; only bare patients.
- `hardDeleteAppointment(id, password)` (`apps/web/lib/scheduling/actions.ts:881`): refuses if any note/record/invoice references the appointment.
- `hardDeleteClinicalRecord(ctx, id)` (`apps/web/lib/clinical/records.ts:575`, `clinical_records:author`, password-gated): **DRAFT only** (AI-pending is `draft`, so deletable); `locked`/`signed` blocked at app layer AND the DB trigger.
- `deleteStaffMember` - staff are REAL and STAY; not used this wave.
- Soft-delete/`restorePatient`/`listDeletedPatients` - the "Pacientes eliminados" surface; the 31 soft-deleted patients still carry all child rows (NO ACTION), so they are part of the purge.

**Conclusion:** the reference-guarded app paths cannot perform this bulk children-first purge. The plan uses **direct parameterized SQL inside the W10-02 audited session** for the bulk, with the immutability trigger left fully intact as the live backstop (it will refuse any signed row even for `postgres`).

## (e) Immutability + append-only determination, and the BLOCKED residue

- **Trigger `clinical_records_enforce_immutability`** (`0001_rls.sql:232-255`, redefined `0005:56-91`): `BEFORE UPDATE OR DELETE ON clinical_records FOR EACH ROW`; **live and enabled** (`pg_trigger.tgenabled = 'O'`). It raises `check_violation` on **both UPDATE and DELETE** of any row whose `status IN ('locked','signed')`, in the BEFORE phase with no BYPASSRLS escape, so **it applies even to `service_role`/`postgres`**. `draft` (incl. AI-pending) rows are freely deletable.
- **`record_annulments`** append-only: policies are SELECT + INSERT only (no UPDATE/DELETE policy). Count = 0, so nothing to consider this wave.

**BLOCKED residue = 4 patients / 5 signed records (immutability-locked island).** The 5 signed records belong to 4 patients (`cae30d86`, `c53c36aa`, `22ce09b0` [owns 2], `8cd8c310`); one signed record supersedes another signed record (a signed->signed addendum chain), the other 4 signed are superseded by draft addenda. These 5 rows **cannot be deleted by ANY path** (trigger). Because `clinical_records.patient_id` is NO ACTION, the 4 owning patients **cannot be deleted either** while their signed records exist. Full subtree of the 4 blocked patients: 26 records (21 draft + 5 signed), 3 episodes (1 pinned by a signed record via `episode_id`), 2 attachments (1 on a signed record), 5 appointments, 3 note revisions.

**The immutability trigger and the append-only policy are facts to respect, never to defeat.** No plan step disables, drops, or bypasses the trigger; no `SET session_replication_role`; no BYPASSRLS trick. A blocked row is accepted residue, not a problem to solve.

---

## (f) PROPOSED CLEANUP PLAN - PLAN v1

**Authorization required before W10-02 opens the write window:** owner reply `AUTORIZO LIMPEZA plan v1` (exact phrase + this version), which also confirms the two residual boundary slices in (b) are synthetic.

**Model:** direct parameterized SQL inside the single W10-02 audited session, run as ONE atomic transaction (all-or-nothing), capturing BEFORE/AFTER counts per step; **any per-step count that does not match the expected value, any FK `23503`, or any `check_violation` -> ROLLBACK and HALT to the mailbox** (no improvised workaround, no trigger bypass). The immutability trigger stays enabled throughout as the backstop.

**Target set D = the 42 patients with NO signed clinical_record** (`patients.id NOT IN` the 4 blocked ids; W10-02 recomputes this predicate live). The 4 blocked patients and their whole subtree are left untouched (recommended residue Option A below).

Children-first, bottom-up (expected counts are the recon figures; W10-02 pastes live before/after and HALTs on any mismatch):

| # | Step (direct SQL, `WHERE ... IN D` / records-of-D) | Expected deleted |
|---|-----------------------------------------------------|-----------------:|
| 1 | `ai_ingestion_requests` where `clinical_record_id` in (draft records of D) | up to 2 (confirm live) |
| 2 | `attachments` where `patient_id` in D OR `clinical_record_id` in (records of D) | 3 |
| 3 | `patient_note_revisions` where `patient_id` in D | 1 |
| 4 | `clinical_records` (drafts of D) where `patient_id` in D - delete superseding rows before superseded (self-FK); all are `draft`, trigger permits | 8 |
| 5 | `clinical_episodes` where `patient_id` in D (records freed in step 4) | 50 |
| 6 | `appointments` where `patient_id` in D OR `patient_2_id` in D | 10 |
| 7 | `patient_locations` / `patient_form_submissions` / `invoices` where `patient_id` in D | 0 / 0 / 0 |
| 8 | `patients` where `id` in D | 42 |

**Expected END STATE:** `patients = 4`, `appointments = 5`, `clinical_records = 26` (5 signed + 21 draft), `clinical_episodes = 3`, `attachments = 2`, `patient_note_revisions = 3`, `record_annulments = 0` - all belonging to the 4 blocked patients (the accepted residue). **Retained UNCHANGED:** `users = 19`, `services = 25`, `service_location_prices = 23`, `service_packs = 14`, `locations = 2` (OsteoJP CB + LV, both active), `tenants = 1`, `roles = 4`, `tenants.settings` (incl. the delete-password secret). The 3 frozen legacy service rows are inside `services` and untouched.

**Not patient-domain (owner's call, default LEAVE):** the 7 `analytics_events` have `patient_id NULL` and are out of the strict patient-domain scope. Default: leave; purge only if the owner wants QA analytics gone (does not affect the boundary).

### BLOCKED section - owner options for the 4-patient / 5-signed-record island

- **Option A (RECOMMENDED) - accept the island whole, untouched.** Leave the 4 patients + their entire subtree (5 signed + 21 draft records, 3 episodes, 2 attachments, 5 appointments, 3 note revisions) as accepted residue. Mirrors the owner's W4-11 ruling B (2026-07-07): locked/signed synthetic residue is dev-only-by-construction, revisited when the prod Supabase project splits. Keeps each signed ficha's clinical context coherent. Never touches the trigger.
- **Option B - strip the island to its minimal signed core.** Additionally delete the island's deletable children (21 draft records, 2 unpinned episodes, 5 appointments, 3 note revisions, attachments not on a signed record), leaving only 4 patients + 5 signed records + 1 pinned episode + 1 attachment. More surgical but partially dismantles clinical context; more steps, more risk. Not recommended.
- **Option C - REFUSED.** Defeating the immutability trigger to force-delete the signed records is out of the question and is explicitly NOT offered. The trigger is never disabled, dropped, or bypassed, under any authorization.

---

## Verification evidence

- **No-write proof:** all reads inside `SET TRANSACTION READ ONLY`; the only repo change from this loop is this file, the QUESTIONS.md W10-01/02 sub-batch, and the BACKLOG W10-01 row flip (`git diff --name-only origin/main` is docs-only).
- **Counts** are pasted per table in (a); the blocked island footprint in (e); the boundary aggregates in (b).
- **Immutability** determination in (e): trigger enabled (`tgenabled='O'`), blocks UPDATE+DELETE of locked/signed even for `postgres`; 5 signed rows are the blocked set; 0 locked, 0 annulled.
- **Plan** is versioned **PLAN v1** with per-step expected counts, path (direct SQL, trigger intact), and a BLOCKED section with owner options.
