## Wave 01 Loop Queue

> Board ownership: this file is the single source of truth for live loop status and sequencing (DRAFT / READY / IN-FLIGHT / DONE / HALTED). WAVE-01.md describes wave scope, STATE.md holds ground truth, DECISIONS.md holds locked calls, LOOP-DISPATCH.md holds the dispatch mechanism. For what is runnable now, read this file only.

### Coordination protocol
Status flow: DRAFT (stub, no committed loop file) -> WRITTEN (loop file authored and committed under docs/loops/, awaiting gate/dispatch) -> READY (gate cleared, dispatchable) -> IN-FLIGHT (terminal running) -> DONE (PR merged to main, verified) -> or HALTED (briefing-vs-reality mismatch, see QUESTIONS.md).
Rules:
- One MIG-lane loop IN-FLIGHT at a time, sequential numbering. UI-lane loops run one at a time per executor.
- On marking a loop DONE: append to DECISIONS.md if a decision was locked, update STATE.md if ground truth changed, then re-scan DRAFT rows and flip any whose gate is now cleared to READY.
- Anything touching db-tests.yml or e2e.yml is an automatic hold for Ivan, never self-merged.
- gh CLI is ground truth when indexed history is stale.

### Max pickup rule
When you return from other work, do not start mid-queue. Read this manifest top to bottom. Run the top UI-lane row that is READY. Mark it IN-FLIGHT before you start. Mark it DONE on green CI and merge. Then proceed to the next READY UI-lane row. Do not touch any MIG-lane row, those are Ivan's. Do not self-merge anything touching db-tests.yml or e2e.yml.

### MIG lane (Ivan)
| ID | Loop | Status | Gate |
|----|------|--------|------|
| 0022 | patient columns | DONE | none |
| 0023 | therapist-service mapping | DONE | 0022 DONE |
| 0024 | appointment confirmation state | DONE | 0023 DONE |
| 0025 | event schema (SPEC-events, incl appointment_status_changed) | DONE | 0024 DONE |
| 0026 | appointment lifecycle, gated completion + per-visit notes | WRITTEN | 0025 DONE (JP ruling: soft warning, DECISIONS 2026-07-01) |
| 0027 | multi-therapist booking | WRITTEN | 0026 DONE |
| 0028 | batch scheduling engine | WRITTEN | 0027 DONE AND availability query DONE AND availability_templates dev seed merged |
| seed | availability_templates dev seed (purple, migration-free) | READY | none, 0028 prerequisite |
| TBD | patient ID column | DRAFT | JP patient ID format ruling |

### Ivan non-migration code (parallel-safe, not migration-numbered)
| Item | Status | Gate |
|------|--------|------|
| availability query (read-only, booked vs free) | DONE | none, parallel-safe with one in-flight migration |
| schedule-again clone endpoint (loop: docs/loops/schedule-again-clone.md) | WRITTEN | none, schedule when ready |

### UI lane (Max)
| Item | Status | Gate |
|------|--------|------|
| remove Proximas marcacoes card | READY | none |
| rename Revisao to Revisao Consulta | READY | none |
| stale comment fix at page.tsx:360 | READY | none |
| patient profile surfacing: profession + region (new in 0022), city + notes (already existed) | READY | 0022 DONE |
| auto-select service from therapist | DRAFT | 0023 DONE |
| confirmation thumbs on appointment preview | DRAFT | 0024 DONE |
| no-note indicator on completed appointments | DRAFT | 0026 DONE |
| availability panel in new-appointment flow | DRAFT | availability query DONE |
| fichas-as-tab inside patient profile | DRAFT | 0026 design settled (JP) |
| schedule-again action on patient profile | DRAFT | clone endpoint DONE |
| batch failure pop-up | DRAFT | 0028 DONE |
| patient ID next to NIF | DRAFT | patient ID migration DONE |
