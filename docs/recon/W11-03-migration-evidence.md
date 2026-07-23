# W11-03 MIGRACAO — execution evidence (config copy OLD → NEW)

Executed 2026-07-22 under `AUTORIZO MIGRACAO plan v2` with Section-0 gate complete
(plan v2 #626, CYAN-before CLEAN #627, OLD frozen/quiescent). Runbook:
`docs/recon/W11-03-migracao-plan-v2.md`. GREEN executor.

- **Source (OLD):** `jaxmkwoxjcgzkwxgbayx` — read-only throughout (`default_transaction_read_only=on`), never written.
- **Target (NEW):** `dfotoodqvmjhbdcxyaxf` — single atomic transaction, `session_replication_role=replica`
  during copy (no audit/trigger side-effects), commit gated on every assertion passing.
- **Quiescence anchor at execution:** `2026-07-22T20:22:20.097694Z` — the authorized #120 hard_delete;
  newest OLD write, nothing after it. Confirmed pre-copy and again post-commit (unchanged).

## Section 1 — pre-flight (read-only, passed before any write)
- OLD: newest audit event = `patient.hard_delete` patientNumber 120 (anchor); soft-deleted patients
  = `{94,108,109,118,119,121}` exactly; active patients = 0; hard-deleted {120,122,123} absent;
  non-audit tables all pre-anchor (patients.updated_at 11:06:37Z, clinical_records 11:04:29Z,
  clinical_episodes 11:04:17Z).
- NEW: all 11 config tables empty; every patient-linked/audit/analytics table = 0; schema head
  `0037` (drizzle migrations = 38); immutability trigger `clinical_records_enforce_immutability`
  ENABLED (`tgenabled=O`); zero triggers on the config tables.

## Section 2/3 — per-table before → after (parents before children)
| Order | Table | before | source (OLD) | after (NEW) | plan-expected | match |
|---|---|---|---|---|---|---|
| 1 | tenants | 0 | 1 | 1 | 1 | ✓ |
| 2 | roles | 0 | 4 | 4 | 4 | ✓ |
| 3 | locations | 0 | 2 | 2 | 2 | ✓ |
| 4 | users | 0 | 19 | 19 | 19 | ✓ |
| 5 | services | 0 | 19 | 19 | 19 | ✓ |
| 6 | service_location_prices | 0 | 28 | 28 | 28 | ✓ |
| 7 | service_packs | 0 | 14 | 14 | 14 | ✓ |
| 8 | therapist_services | 0 | 4 | 4 | 4 | ✓ |
| 9 | availability_templates | 0 | 13 | 13 | 13 | ✓ |
| 10 | form_templates | 0 | 8 | 8 | 8 | ✓ |
| 11 | time_off | 0 | 3 | 3 | 3 | ✓ |
| | **total** | **0** | **115** | **115** | **115** | ✓ |

- **Fidelity:** row-by-row, Every column deep-compared: exact match to millisecond precision. created_at (all 11 tables) and users.updated_at microseconds truncated by driver round-trip (postgres.js Date), same instant, accepted as immaterial by owner ruling 2026-07-23.
- **Post-copy invariants (in-txn):** all patient-linked/audit/analytics tables = 0; immutability
  trigger still ENABLED.

## Post-commit verification (independent, read-only, committed state)
- NEW committed config counts = the table above (1/4/2/19/19/28/14/4/13/8/3).
- NEW patient-linked/audit/analytics: all 0. Head `0037` (drizzle 38). Immutability ENABLED.
  jsonb intact (tenants.settings = object; 8/8 form_templates.schema valid jsonb).
- OLD untouched: anchor still `2026-07-22T20:22:20.097694Z`, newest write still the #120 delete,
  config counts unchanged. Zero writes to OLD by this migration.

## Standing / next gates
- **CYAN-after** (mandatory): per-table source→target reconciliation, OLD untouched = anchor
  unchanged, NEW invariants intact.
- **Preview smoke BEFORE any Production repoint** (plan v2 Section 4): point Preview envs at NEW,
  verify real-JWT auth-hook→RLS, tenant isolation, agenda/patients/ficha, portal, signed-URL
  attachment, and a write landing on NEW. Any red → HALT, do NOT repoint Production.
- **W11-04** repoints Production (owner Vercel env swaps) only after the above are green.
- OLD stays READ-ONLY-then-FROZEN; rollback = point envs back at OLD (retention 30 days, W11-05).
