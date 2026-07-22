# MIGRACAO plan v2 (W11-03 data migration runbook, Wave 11 Separacao de Producao)

DRAFT for owner review. **Supersedes MIGRACAO plan v1** (`W11-03-migracao-plan-v1.md`),
which must never be authorized. The executable runbook for moving the REAL data from the
OLD project (`jaxmkwoxjcgzkwxgbayx`, source, READ-ONLY-then-FROZEN) to the NEW project
(`dfotoodqvmjhbdcxyaxf`, target).
**Owner-gated freeze window: opens ONLY on the exact phrase `AUTORIZO MIGRACAO plan v2`.**

## Why v2 supersedes v1
Governed by `osteojp-mailbox/rulings/OWNER-RULING-20260722-old-hard-deletes.md` (committed
to main by the owner account, #625 = signature). Between plan v1 and this re-baseline the
owner performed **deliberate manual cleanup** on OLD via the Supabase dashboard and then
ceased all writes. Changes vs v1:

- **New quiescence anchor:** `2026-07-22T20:22:20.097Z` (the last owner write). Any write on
  OLD after this anchor → HALT.
- **Exclusion set v1 → v2:** `{94,108,109,118,119,120,121,122}` → **`{94,108,109,118,119,121}`**.
  Patients #120 and #122 were physically hard-deleted by the owner (no longer exist, so no
  longer in the soft-deleted set); #123 was created and hard-deleted the same day (never in
  any set). The immutability island `{94,108,109,118}` is untouched.
- **Authorization phrase:** `AUTORIZO MIGRACAO plan v2` (v1's phrase is dead).

## Pre-flight evidence (verified read-only against OLD, 2026-07-22T20:55Z)
Read-only session (`default_transaction_read_only=on`, SELECT-only). Raw evidence pasted in
the OWNER-MERGE PR body. Summary:

**Owner delete set on OLD (2026-07-22 evening) — matches the ruling EXACTLY, 5 rows, no extra:**
| Time (UTC) | Action | Entity | Patient # |
|---|---|---|---|
| 20:20:58.183Z | patient.hard_delete | 12b0704d | 123 |
| 20:21:14.339Z | appointment.hard_delete | 3d82fe24 | — |
| 20:21:27.792Z | appointment.hard_delete | 883e8eef | — |
| 20:22:11.257Z | patient.hard_delete | 9aa565ec | 122 |
| 20:22:20.097Z | patient.hard_delete | 065b8add | 120 |

- **Quiescence:** `max(audit_log.created_at)` = 20:22:20.097Z (the anchor event); **zero** writes
  after the anchor. `patients.updated_at` max 11:06:37Z, `clinical_records`/`clinical_episodes`
  created ≤ 11:04:29Z — all pre-anchor.
- **Soft-deleted enumeration = exclusion set v2 EXACTLY:** `{94,108,109,118,119,121}`.
  Active patients = **0**. No patient_number outside the set. `patients` total = 6.
- **Hard-deleted rows absent:** patients {120,122,123} not present; appointments {3d82fe24,
  883e8eef} not present.
- **Immutability trigger** `clinical_records_enforce_immutability` = ENABLED (`tgenabled=O`);
  island `{94,108,109,118}` present.

## What actually migrates (net of exclusion set v2)
Active patients = 0, every remaining patient is excluded → **every patient-linked table
migrates 0 rows** (verified live via BOTH FK paths, `patient_id` AND `clinical_record_id`;
`would_migrate = 0` for all). Only operational config travels. `audit_log` + `analytics_events`
start fresh (Q-W11-01-2).

**MIGRATES (operational config, parents → children) — LIVE counts 2026-07-22T20:55Z:**
| Order | Table | Count (re-verify at pre-flight) | FK parents |
|---|---|---|---|
| 1 | tenants (incl. `settings` = delete-password hash) | 1 | — |
| 2 | roles | 4 | tenants |
| 3 | locations | 2 | tenants |
| 4 | users | 19 | tenants, roles |
| 5 | services | 19 | tenants |
| 6 | service_location_prices | 28 | services, locations |
| 7 | service_packs | 14 | services |
| 8 | therapist_services | 4 | users, services, locations |
| 9 | availability_templates | 13 | users/locations |
| 10 | form_templates | 8 | tenants |
| 11 | time_off | 3 | users |

**STAYS BEHIND (excluded / fresh) — target count MUST be 0 after migration:**
patients, clinical_records, clinical_episodes, attachments, patient_note_revisions,
appointments, ai_ingestion_requests, invoices, patient_locations, patient_form_submissions,
patient_pack_instances, quick_notes, record_annulments, migration_staging_rows, audit_log,
analytics_events. Exclusion set v2 = patient_number `{94,108,109,118,119,121}` + their entire
trees (both FK paths). Live residue that stays behind (all tied to excluded patients,
would_migrate=0): clinical_records 27, clinical_episodes 5, patient_note_revisions 5,
analytics_events 9, attachments 6, ai_ingestion_requests 1.

**Storage:** all `clinical-attachments` objects on OLD belong to excluded attachments →
**0 objects migrate**; the NEW bucket stays empty.

## Ordered runbook

### 0. Gate (owner)
- Owner posts **`AUTORIZO MIGRACAO plan v2`**.
- **CYAN-before** checkpoint (owner invokes CYAN).
- Staff writes PAUSED (maintenance posture, no bookings/edits landing). Owner freeze on OLD
  already in force since 20:22:20Z per the ruling.

### 1. Read-only pre-flight (GREEN, against OLD read-only + NEW)
- Re-run the pre-flight above against LIVE OLD; use the LIVE config counts as the
  authoritative expected set.
- **SAFETY RE-ENUMERATION:** list ALL soft-deleted patients on OLD. If any patient_number NOT
  in `{94,108,109,118,119,121}` appears → **HALT** and present to the owner for an explicit
  keep/exclude ruling. Active patients must = 0.
- **Delete-set guard:** re-confirm the 2026-07-22 evening delete set is EXACTLY the five rows
  above; any additional hard-delete on OLD → HALT for owner ruling.
- **Quiescence guard:** confirm no write on OLD after anchor `2026-07-22T20:22:20.097Z`. Any
  write → **HALT** (drift discipline, as W10-02).
- Confirm NEW target: the 11 operational tables EMPTY (target count 0), schema at head `0037`.

### 2. Copy operational config OLD → NEW (parents-before-children)
- For each table in the order above: read rows from OLD (READ-ONLY), INSERT into NEW.
  Preserve primary keys + all columns verbatim (FKs across tables stay intact).
- **After EACH table:** assert `target count == source count`. Any mismatch, FK violation
  (`23503`), trigger/`check_violation`, or unique conflict → **HALT with zero further writes**
  (W10-02 protocol). OLD is never written.
- Wrap the copy in a single transaction on NEW where feasible, so a mid-run HALT rolls back
  cleanly (no partial config).

### 3. Post-copy assertions (GREEN)
- Per-table NEW counts == the expected operational set (tenants 1, roles 4, locations 2,
  users 19, services 19, prices 28, packs 14, therapist_services 4, availability 13,
  form_templates 8, time_off 3).
- Every patient-linked table on NEW == **0**; `audit_log`/`analytics_events` == 0 (fresh).
- Immutability trigger still ENABLED; RLS intact; claim-flow isolation probe still passes
  (rolled back).

### 4. Preview smoke BEFORE any Production repoint (owner + GREEN)
- Point the **Preview** envs (app + portal) at the NEW project (not Production).
- Smoke: login (auth-hook claim reaches RLS on a real JWT — final hook-registration
  confirmation), tenant isolation, agenda/patients/ficha render, portal loads, a signed-URL
  attachment flow, and a WRITE lands on NEW. Any red → **HALT**; do NOT repoint Production.

### 5. CYAN-after + handoff
- **CYAN-after** checkpoint (owner). Record per-table before/after counts in
  `docs/recon/W11-03-migration-evidence.md`. W11-04 repoints Production (owner Vercel env
  swaps) only after this is green.

## Rollback
OLD is READ-ONLY-then-FROZEN throughout — never written, never further deleted. Roll back at
any step by pointing envs back at OLD (it still holds everything except the five owner-deleted
rows, incl. the signed residue island). Retention: frozen 30 days after cutover, then owner
decides (W11-05).

## Method note (execution)
The copy is small (max 28 rows/table) and cross-project; GREEN executes it via the repo driver
(read OLD, write NEW) under the authorized window, or via `pg_dump --data-only --table=<each>`
OLD → restore NEW if the owner prefers a dump artifact. Either way: parents-before-children,
per-table count assertions, HALT-on-mismatch, OLD never written.

**Awaiting `AUTORIZO MIGRACAO plan v2` + CYAN-before to open the window. HALT until then.**
