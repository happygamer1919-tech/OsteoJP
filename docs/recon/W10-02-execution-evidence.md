# W10-02 execution evidence - Cloud patient-domain purge (Wave 10 Dados Reais e Isolamento)

> Loop: `docs/loops/wave-10/W10-02-cleanup-execution.md`. The single authorized cloud-write of Wave 10. Executed 2026-07-20 under owner authorization `AUTORIZO LIMPEZA plan v4`. One atomic transaction (all-or-nothing), per-step before/after evidence, HALT+rollback on any mismatch. **The `clinical_records` immutability trigger and the append-only `record_annulments` policy were NEVER disabled, dropped, or bypassed** - the trigger stayed enabled (`tgenabled='O'`) throughout and served as the backstop.

## Authorization
- Owner phrase received: `AUTORIZO LIMPEZA plan v4` (exact phrase + matching version).
- Preconditions satisfied: W10-01 merged (#606, `origin/main` @ 7abba33) AND the phrase received.
- Scope confirmed by owner: all patient-domain rows synthetic; the 15:02-16:33 UTC activity by staff `48a34faa` is Rodica mobile QA, synthetic, included; no exclusions.

## Plan version history (why v4)
The plan re-versioned as the live cloud drifted during the authorization window (Rodica QA + stragglers), each caught by the mandatory pre-flight, each time HALT-with-no-write:
- **v1** (W10-01 recon): 42 deletable patients. **v2** (owner live-patient check): +soft-delete step for the 3 live blocked patients.
- **v3** (drift #1, +Rodica QA 15:02-16:06): 45 deletable + new `patient_pack_instances` step (the reference-guard fix). Pre-flight HALTed v2 first (counts drifted, pack_instances uncovered).
- **v4** (drift #2, +16:33 straggler): **46 deletable**. This is the version executed, after the DB went quiescent (~78 min no writes) and the owner extended the synthetic scope to 16:33 UTC and confirmed staff stopped.

Two pre-execution HALTs protected the DB before the successful run: (a) PLAN v2 pre-flight caught the first drift; (b) PLAN v4 pre-check caught the 16:33 straggler (D=46 vs 45) and rolled back; (c) a third rollback caught a wrong end-state assertion (attachments residual). No partial writes at any point.

## Per-step ledger (atomic transaction, all committed together)

Deletable set D = 46 patients (50 total - 4 immutability-blocked). Children-first, direct parameterized SQL; every step's rows-affected equals its before-count and the after-count is 0.

| # | Step | before | deleted | after |
|---|------|-------:|--------:|------:|
| 1 | `ai_ingestion_requests` (clinical_record_id in D records) | 2 | 2 | 0 |
| 2 | `attachments` (patient_id in D or clinical_record_id in D records) | 1 | 1 | 0 |
| 3 | `patient_note_revisions` (patient_id in D) | 2 | 2 | 0 |
| 4 | `patient_pack_instances` (patient_id in D) | 3 | 3 | 0 |
| 5 | `clinical_records` (patient_id in D; all draft; trigger backstop) | 12 | 12 | 0 |
| 6 | `clinical_episodes` (patient_id in D) | 53 | 53 | 0 |
| 7 | `appointments` (patient_id or patient_2_id in D) | 19 | 19 | 0 |
| 8 | `patient_locations` / `patient_form_submissions` / `invoices` / `appointment_notes` / `analytics_events` (patient_id in D) | 0 | 0 | 0 |
| 9 | `patients` (id in D) | 46 | 46 | 0 |
| 10 | `patients` **soft-delete** (`UPDATE deleted_at=now()`) for the 3 live blocked; trigger untouched | 3 | 3 (updated) | 0 live |

## End state (verified in-transaction AND by an independent post-commit read)

| Table | After | Note |
|-------|------:|------|
| `patients` | 4 | ALL soft-deleted (`deleted_at IS NOT NULL`); **live patients = 0** -> invisible in the app, present only in owner/admin "Pacientes eliminados" |
| `appointments` | 5 | island |
| `clinical_records` | 26 | 5 signed + 21 draft (the blocked island) |
| `clinical_episodes` | 3 | island |
| `attachments` | 5 | island: 2 by `patient_id in blocked` + 3 on blocked signed records via `clinical_record_id` (NULL patient_id) |
| `patient_note_revisions` | 3 | island |
| `patient_pack_instances` | 0 | |
| `ai_ingestion_requests` | 0 | |
| `record_annulments` | 0 | append-only policy never touched |

**Retained REAL data UNCHANGED (proof nothing real was touched):** `users` = 19, `services` = 25, `service_location_prices` = 23, `service_packs` = 14, `locations` = 2 (OsteoJP CB + LV), `tenants` = 1. The three frozen legacy service rows are inside `services`, untouched. Immutability trigger `clinical_records_enforce_immutability` still enabled (`tgenabled='O'`).

## Accepted BLOCKED residue (Option A, owner-ruled Q-W10-01-2)

The 4-patient / 5-signed-record immutability island stays whole and untouched, now with all 4 patients soft-deleted (invisible in the app). Full footprint: 4 patients, 26 records (5 signed + 21 draft addendum chain), 3 episodes, 5 attachments, 5 appointments, 3 note_revisions, 0 pack_instances. **The immutability trigger was never defeated** - these signed records cannot be deleted by any path, exactly as designed. Revisit at the prod-project split (mirrors the W4-11 dev-only-by-construction ruling). Note: the attachment residue is 5 (not the 2 quoted from the earlier patient_id-only footprint) - it includes 3 attachments linked to the signed records by `clinical_record_id` with a NULL `patient_id`, which correctly stay with the island.

## Correction to the earlier residue figure
The W10-01 recon and the v2/v3/v4 presentations quoted the island attachment count as 2 (counted by `patient_id` only). The true island attachment residue is 5, because 3 attachments reference the blocked signed records via `clinical_record_id` with a NULL `patient_id`. The purge correctly deleted only the 1 synthetic (D-patient) attachment and retained all 5 island ones. All other residue figures held exactly.
