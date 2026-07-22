# CYAN-BEFORE — W11-03 MIGRACAO plan v2 — GATE ARTIFACT

**Verdict: CLEAN.** CYAN-before checkpoint satisfied. GREEN is authorized to open the
W11-03 freeze-window write on the owner phrase `AUTORIZO MIGRACAO plan v2`.

- **Audit timestamp (live read-only):** 2026-07-22T21:59:51Z
- **Plan audited:** `docs/recon/W11-03-migracao-plan-v2.md`, blob `9140e4e` (identical across
  origin/main HEAD, merge `11b4efc` / #626, and PR head `w11-03/migracao-plan-v2`).
- **Ruling reference:** `osteojp-mailbox/rulings/OWNER-RULING-20260722-old-hard-deletes.md`,
  landed via #625 (`464ad76`), owner-committed.
- **Anchor:** 2026-07-22T20:22:20.097Z verified quiescent (`max(audit_log.created_at)`
  = the anchor event; zero writes strictly after it, re-confirmed live at 21:59:51Z).
- **Exclusion set v2:** `{94, 108, 109, 118, 119, 121}` — confirmed.
- **Owner authorization phrase:** `AUTORIZO MIGRACAO plan v2` — posted (owner-attested; GREEN executing).

## Delta pre-check results (live OLD `jaxmkwoxjcgzkwxgbayx`, read-only `transaction_read_only=on`)

| # | Item | Result |
|---|---|---|
| 1 | Ruling on origin/main, owner-committed, covers exactly the 5 deletes (patients 120/122/123, appts 3d82fe24/883e8eef), no more | CLEAN |
| 2 | Plan v2 byte-identical to #626, supersedes v1, phrase `AUTORIZO MIGRACAO plan v2`, anchor 20:22:20.097Z | CLEAN |
| 3 | Live delete set == ruling exactly (5 hard_delete events; patients {120,122,123} + appts {3d82fe24,883e8eef} absent; no extra deletion — residue counts match plan) | CLEAN |
| 4 | Quiescence: zero writes on OLD after anchor 20:22:20.097Z (max audit_log = anchor) | CLEAN |
| 5 | Soft-deleted enumeration = `{94,108,109,118,119,121}` exactly; active patients = 0 | CLEAN |
| 6 | 11 config tables match plan v2 (tenants 1, roles 4, locations 2, users 19, services 19, prices 28, packs 14, therapist_services 4, availability 13, form_templates 8, time_off 3); all patient-linked would_migrate = 0 | CLEAN |
| 7 | Immutability island `{94,108,109,118}` present + owns the 5 signed records; trigger `clinical_records_enforce_immutability` ENABLED (`tgenabled=O`) | CLEAN |

## Standing conditions
- The freeze must hold through the actual window. Quiescence is verified through 21:59:51Z;
  GREEN re-confirms the anchor at its step-1 pre-flight when the window opens.
- Databases were never written during this audit (single `SET TRANSACTION READ ONLY` sessions;
  OLD via `packages/db/.env`, NEW via `~/osteojp-secrets/new-prod.env`).
- Next mandatory CYAN gate: **CYAN-after** (per-table source→target reconciliation, OLD untouched
  = anchor unchanged, NEW invariants intact, Preview smoke green before any Production repoint).

_Signed: CYAN audit desk. Evidence: live read-only query output + git blob hashes._
