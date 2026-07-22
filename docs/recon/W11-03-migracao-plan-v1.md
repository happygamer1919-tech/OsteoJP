# MIGRACAO plan v1 (W11-03 data migration runbook, Wave 11 Separacao de Producao)

DRAFT for owner review. The executable runbook for moving the REAL data from the OLD
project (`jaxmkwoxjcgzkwxgbayx`, source, READ-ONLY) to the NEW project
(`dfotoodqvmjhbdcxyaxf`, target). Governed by SPLIT PLAN v2's named exclusion set.
**Owner-gated freeze window: opens ONLY on the exact phrase `AUTORIZO MIGRACAO plan v1`.**

> Version note: the SPLIT PLAN doc is v2; the MIGRACAO plan (this executable runbook) is
> versioned independently and is **v1**. The authorization phrase is
> **`AUTORIZO MIGRACAO plan v1`** (per owner, 2026-07-22), superseding the "plan v2"
> phrasing in the SPLIT PLAN v2 draft.

## What actually migrates (net of the exclusion set)
Active patients = 0, so EVERY patient-linked table migrates **0** rows. Only the
operational config travels. `audit_log` + `analytics_events` start fresh (Q-W11-01-2).

**MIGRATES (operational config, parents -> children):**
| Order | Table | Expected count (re-verify at pre-flight) | FK parents |
|---|---|---|---|
| 1 | tenants (incl. `settings` = delete-password hash) | 1 | - |
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

**STAYS BEHIND (excluded / fresh) - target count MUST be 0 after migration:**
patients, clinical_records, clinical_episodes, attachments, patient_note_revisions,
appointments, ai_ingestion_requests, invoices, patient_locations,
patient_form_submissions, patient_pack_instances, quick_notes, record_annulments,
migration_staging_rows, audit_log, analytics_events. The exclusion set is
patient_number `{94,108,109,118,119,120,121,122}` + their entire trees (both FK paths).

**Storage:** all `clinical-attachments` objects (26 on OLD) belong to excluded
attachments -> **0 objects migrate**; the NEW bucket stays empty. (Confirmed: 0 patients
travel, so 0 attachments travel.)

## Ordered runbook

### 0. Gate (owner)
- Owner posts **`AUTORIZO MIGRACAO plan v1`**.
- **CYAN-before** checkpoint (owner invokes CYAN).
- Staff writes PAUSED (app in a maintenance posture, no bookings/edits landing).

### 1. Read-only pre-flight (GREEN, against OLD read-only + NEW)
- Re-count every OLD table; confirm the 11 operational tables match the expected counts
  (real usage may have grown - use the LIVE counts as the authoritative expected set).
- **SAFETY RE-ENUMERATION:** list ALL soft-deleted patients on OLD. If any patient_number
  NOT in `{94,108,109,118,119,120,121,122}` appears -> **HALT** and present to the owner
  for an explicit keep/exclude ruling. Do not proceed.
- **Quiescence guard:** confirm no write on OLD after the last accounted cleanup
  (`#122` soft-delete, 2026-07-22) other than the authorized freeze. Any unexpected new
  write -> **HALT** (drift discipline, as W10-02).
- Confirm NEW target: the 11 operational tables are EMPTY (target count 0) and schema at
  head `0037`.

### 2. Copy operational config OLD -> NEW (parents-before-children)
- For each table in the order above: read rows from OLD (READ-ONLY), INSERT into NEW.
  Preserve primary keys + all columns verbatim (so FKs across tables stay intact).
- **After EACH table:** assert `target count == source count`. Any mismatch, FK violation
  (`23503`), trigger/`check_violation`, or unique conflict -> **HALT with zero further
  writes** (identical to the W10-02 protocol). The OLD project is never written.
- Wrap the whole copy in a single transaction on NEW where feasible, so a mid-run HALT
  rolls back cleanly (no partial config).

### 3. Post-copy assertions (GREEN)
- Per-table NEW counts == the expected operational set (tenants 1, roles 4, locations 2,
  users 19, services 19, prices 28, packs 14, therapist_services 4, availability 13,
  form_templates 8, time_off 3).
- Every patient-linked table on NEW == **0**; `audit_log`/`analytics_events` == 0 (fresh).
- The immutability trigger still ENABLED; RLS intact; the claim-flow isolation probe still
  passes (rolled back).

### 4. Preview smoke BEFORE any Production repoint (owner + GREEN)
- Point the **Preview** envs (app + portal) at the NEW project (not Production).
- Smoke: login (auth-hook claim reaches RLS on a real JWT - the final hook-registration
  confirmation), tenant isolation, agenda/patients/ficha render, portal loads, a signed-URL
  attachment flow, and a WRITE lands on NEW. Any red -> **HALT**; do NOT repoint Production.

### 5. CYAN-after + handoff
- **CYAN-after** checkpoint (owner). Record per-table before/after counts in
  `docs/recon/W11-03-migration-evidence.md`. W11-04 repoints Production (owner Vercel env
  swaps) only after this is green.

## Rollback
The OLD project is READ-ONLY-then-FROZEN throughout - never written, never deleted. Roll
back at any step by pointing envs back at OLD (it still holds everything, incl. the signed
residue island). Retention: frozen 30 days after cutover, then owner decides (W11-05).

## Method note (execution)
The copy is small (max 28 rows/table) and cross-project; GREEN executes it via the repo
driver (read OLD, write NEW) under the authorized window, or via `pg_dump --data-only
--table=<each>` OLD -> restore NEW if the owner prefers a dump artifact. Either way:
parents-before-children, per-table count assertions, HALT-on-mismatch, OLD never written.

**Awaiting `AUTORIZO MIGRACAO plan v1` + CYAN-before to open the window. HALT until then.**
