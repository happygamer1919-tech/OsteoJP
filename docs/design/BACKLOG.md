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
| 0026 | appointment lifecycle, gated completion + per-visit notes | DONE (#415) | 0025 DONE (JP ruling: soft warning, DECISIONS 2026-07-01) |
| 0027 | multi-therapist booking | DONE (#416) | 0026 DONE |
| 0028 | batch scheduling engine | DONE (#417) | 0027 DONE AND availability query DONE AND availability_templates dev seed merged |
| seed | availability_templates dev seed (purple, migration-free) | DONE (#406; guard rework #412, seed role-ID fix #414) | none |
| 0029 | patient number (loop: docs/loops/0029-patient-number.md) | WRITTEN | none — ruling received (JP, DECISIONS 2026-07-02); ready for GREEN |
| TBD | patient_notes append-only relation | RULING RECEIVED | JP audit-trail ruling: full version history required (DECISIONS 2026-07-02); loop authoring queued for next wave |

### Ivan non-migration code (parallel-safe, not migration-numbered)
| Item | Status | Gate |
|------|--------|------|
| availability query (read-only, booked vs free) | DONE (#396) | none, parallel-safe with one in-flight migration |
| schedule-again clone endpoint (loop: docs/loops/schedule-again-clone.md) | DONE (#419) | none |
| FA-1 users-seed natural-key fix (loop: docs/loops/users-seed-natural-key-fix.md) | WRITTEN | none — ready for PURPLE (migration-free; QUESTIONS 2026-07-02 FA-1) |
| finance KPI report (revenue per therapist/service) | QUEUED (gate cleared) | VAT answered — CIVA art. 9 exemption, gross=final (DECISIONS 2026-07-02); queued until scoped as its own loop |

### UI lane (Max)
| Item | Status | Gate |
|------|--------|------|
| remove Proximas marcacoes card | DONE (#385) | none |
| rename Revisao to Revisao Consulta | DONE (#384) | none |
| stale comment fix at page.tsx:360 | DONE (#383) | none |
| patient profile surfacing: profession + region (new in 0022), city + notes (already existed) | DONE (#393) | 0022 DONE |
| auto-select service from therapist | DONE (#445) | 0023 DONE |
| confirmation thumbs on appointment preview | DONE (#441) | 0024 DONE |
| no-note indicator on completed appointments | BLOCKED-ON-CAPTURE | row 8 SPLIT (DECISIONS/QUESTIONS 2026-07-03): `note_present` capture is a PURPLE backend build item first (migration-free, `updateAppointment` completion branch); this UI indicator (halt recorded #440) lands after capture ships — Q-ROW8-1 resolved |
| availability panel in new-appointment flow | READY | availability query DONE |
| fichas-as-tab inside patient profile | READY | UNBLOCKED by fichas-placement ruling (DECISIONS 2026-07-03, entry F); halt recorded #446, Q-ROW7-1 resolved — UI lane |
| schedule-again action on patient profile | DONE (#442) | clone endpoint DONE (#419) |
| batch failure pop-up | READY | UNBLOCKED by partial-success ruling (DECISIONS 2026-07-03, entry G): wire `AppointmentDrawer` repeat UI through `batchSchedule`; halt recorded #439 — UI lane, migration-free |
| patient ID next to NIF | DONE (#435) | 0029 patient number applied (STATE head 0029); zero-padded display per JP ruling |

### Next-wave candidates (Wave 02 intake)
> Added 2026-07-03 from the wave-01 close-out rulings. Candidates only — not yet scoped into loops.

| Candidate | Origin | Gate / note |
|-----------|--------|-------------|
| NESA contraindication warning (flags + booking-time warning) | DECISIONS 2026-07-03 entry A (JP) | soft warning at booking, no hard block; next-wave build |
| note_present capture (PURPLE backend, migration-free) | DECISIONS/QUESTIONS 2026-07-03 (Q-ROW8-1) | prerequisite for row-8 no-note UI indicator (#440) |
| finance KPI report (revenue per therapist/service) | DECISIONS 2026-07-02 (VAT: CIVA art. 9 exemption) | gate cleared; queued until scoped as its own loop |
| fiscal integration (fatura-recibo, insurer/protocol discounts) | DECISIONS 2026-07-03 entry B (JP) | GATED: must be re-specced against the licensed-partner model first; InvoiceXpress relay lock possibly superseded |

## Wave 02 Loop Queue

> Opened 2026-07-03. Same board rules as Wave 01 (status flow, one MIG-lane loop in flight, db-tests.yml/e2e.yml = Ivan hold). Loop files land under `docs/loops/wave-02/`. Lane tags: GREEN = chained migration runner, PURPLE = migration-free executor, UI = Max's UI lane. Sequencing gates are in the Gate column; DRAFT rows have no committed loop file yet.

| ID | Item | Status | Lane | Gate / note |
|------|------|--------|------|-------------|
| W2-01 | migration 0030 `patient_note_revisions` (loop: `docs/loops/wave-02/W2-01-mig-0030-patient-note-revisions.md`) | DONE (#452) | GREEN | none — patient-notes design ruling received (DECISIONS 2026-07-03); applied on dev, backfill 10/10, append-only + RLS tests green (300 total) |
| W2-02 | UI quick-fix batch (5 items, migration-free) (loop: `docs/loops/wave-02/W2-02-ui-quickfix-batch.md`) | READY | UI/PURPLE | none — migration-free |
| W2-03 | location data cleanup (live-DB data op) (loop: `docs/loops/wave-02/W2-03-location-cleanup.md`) | READY | PURPLE | runs AFTER W2-02 merged to main (archive-only, no schema change) |
| W2-04 | no-note indicator UI on completed appointments (loop: `docs/loops/wave-02/W2-04-ui-no-note-indicator.md`) | READY | UI | none — precondition met (#449 merged); reads `appointment_notes` existence (present-state), supersedes halt #440 |
| W2-05 | batch failure pop-up wiring (partial-success) (loop: `docs/loops/wave-02/W2-05-ui-batch-failure-popup.md`) | READY | UI | none — per DECISIONS 2026-07-03 ruling G; supersedes halt #439 (HALTs if engine change needed → W2-09) |
| W2-06 | fichas tab completion (list + create entry point) (loop: `docs/loops/wave-02/W2-06-ui-fichas-tab-completion.md`) | READY | UI | none — per DECISIONS 2026-07-03 ruling F; supersedes halt #446 |
| W2-07 | migration 0031 NESA contraindication flags (loop: `docs/loops/wave-02/W2-07-mig-0031-nesa-contraindications.md`) | READY | GREEN | AFTER W2-01 (0030) merged — one migration in flight; per DECISIONS 2026-07-03 ruling A |
| W2-08 | NESA booking warning UI (loop: `docs/loops/wave-02/W2-08-ui-nesa-warning.md`) | READY | UI | AFTER W2-07 (0031) merged; per DECISIONS 2026-07-03 ruling A (warning, never a block) |
| W2-09 | batch V2 engine — explicit per-slot datetime list | DRAFT | PURPLE | supersedes the V1 recurrence-only batch path |
| W2-10 | batch V2 UI (Agendar lote: count, every-X, per-date time pickers, summary, confirm) | DRAFT | UI | AFTER W2-09 merged |
| W2-11 | patient notes tab + Notas Rápidas rewire to patient quick-note | DRAFT | UI/PURPLE | AFTER 0030 merged; includes read-only trace of the current Notas Rápidas write destination + orphaned-data check; flips notes UI to the revisions relation |
| W2-12 | working-hours admin UI — availability template CRUD per therapist in Administração (weekdays, hours, location) | DRAFT | UI | none stated |
| W2-13 | SMS confirmation flow — SPEC ONLY, no build this wave (Twilio PT, signed SIM/NÃO link page, flips 0024 `confirmation_state`) | DRAFT | SPEC | new vendor (Twilio) — spec only, owner-confirmable before any build |

### Wave 02 deferred (recorded, not scheduled this wave)
- **2-clients-same-slot UI** — `booking_group_id` (0027) exists in schema, no UI yet. Deferred.
- **Marcações section stays** — no rename/relocation of the Marcações nav section this wave.
- **Fisiozero import** — sequenced LAST (after all Wave 02 build), gated on the pre-real-data gates (separate-prod-project + signed DPA, DECISIONS 2026-07-01 / 2026-07-02).
