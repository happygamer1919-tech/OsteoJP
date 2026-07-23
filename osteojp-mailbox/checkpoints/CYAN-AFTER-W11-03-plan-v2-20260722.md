# CYAN-AFTER — W11-03 MIGRACAO plan v2 — GATE ARTIFACT

**Verdict: CLEAN.** Post-W11-03 checkpoint satisfied. The operational-config copy
OLD → NEW is verified faithful, OLD is untouched, and the NEW invariants hold.
W11-04 may proceed to **Preview smoke before any Production repoint** (plan v2 Section 4).

- **Audit timestamp (live read-only, both projects):** 2026-07-23T01:08Z
- **Migration evidence audited:** `docs/recon/W11-03-migration-evidence.md` (#628, `ab66d82`).
- **Runbook:** `docs/recon/W11-03-migracao-plan-v2.md` (v2, #626). CYAN-before CLEAN = #627.
- **Source (OLD):** `jaxmkwoxjcgzkwxgbayx` — read-only throughout. **Target (NEW):** `dfotoodqvmjhbdcxyaxf`.
- **Quiescence anchor (OLD):** `2026-07-22T20:22:20.097694Z` — unchanged, verified to the microsecond.

## Post-check results (live, read-only both projects)

| # | Item | Result |
|---|---|---|
| 1 | NEW 11 config tables at plan v2 counts exactly (tenants 1, roles 4, locations 2, users 19, services 19, service_location_prices 28, service_packs 14, therapist_services 4, availability_templates 13, form_templates 8, time_off 3; **total 115**). Fidelity vs OLD: every PK, business column, and jsonb (`tenants.settings`, `form_templates.schema/title`) byte-identical. | CLEAN |
| 2 | NEW every patient-linked / `audit_log` / `analytics_events` table = 0 (17 tables). Fresh start confirmed. | CLEAN |
| 3 | NEW invariants: head `0037` (drizzle `__drizzle_migrations`=38); immutability trigger `clinical_records_enforce_immutability` ENABLED (`tgenabled=O`); 50 public policies; 28 RLS tables; auth-hook `custom_access_token_hook` present; bucket `clinical-attachments` private + 0 objects. Isolation mechanism verified read-only; live insert/rollback probe deferred to the W11-04 real-JWT Preview smoke (no-DB-writes mandate; proven by GREEN at W11-02 on the unchanged schema). | CLEAN |
| 4 | OLD untouched: `max(audit_log.created_at)` = anchor `2026-07-22T20:22:20.097694Z` (microsecond-exact); newest write still `patient.hard_delete` pn=120; **0** rows after anchor; audit_log total 700 (unchanged); config counts unchanged; patients `{94,108,109,118,119,121}`, active 0. Zero writes during/after the window. | CLEAN |
| 5 | Evidence doc vs live: **doc discrepancy resolved by owner ruling: precision truncation accepted as immaterial, doc amended.** `created_at` (all config tables) + `users.updated_at` were truncated microsecond→millisecond by the postgres.js driver round-trip during copy — same instant to the millisecond, zero functional impact (no key/FK/uniqueness/query depends on sub-ms). Owner ruled 2026-07-22: accepted, no re-copy. | CLEAN |

## Standing / next gates
- **W11-04 — Preview smoke BEFORE any Production repoint:** point Preview envs (app + portal)
  at NEW, verify real-JWT auth-hook → RLS, tenant isolation, agenda/patients/ficha, portal,
  signed-URL attachment download, and a write landing on NEW. Any red → HALT, do NOT repoint.
- OLD stays READ-ONLY-then-FROZEN; rollback = repoint envs back to OLD (retention 30 days, W11-05).
- Databases were never written during this audit (single `SET TRANSACTION READ ONLY` sessions;
  OLD via `packages/db/.env`, NEW via `~/osteojp-secrets/new-prod.env`).

_Signed: CYAN audit desk. Evidence: live read-only query output (both projects) + git blob hashes._
