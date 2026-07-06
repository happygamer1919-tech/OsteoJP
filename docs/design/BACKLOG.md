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

> Opened 2026-07-03. Same board rules as Wave 01 (status flow, one MIG-lane loop in flight, db-tests.yml/e2e.yml = Ivan hold). Loop files land under `docs/loops/wave-02/`. **Wave-02 lane override (DECISIONS 2026-07-03 "Wave 02 is single-executor"): every W2 loop — migration, UI, PURPLE, docs — belongs to the GREEN runner; the historical GREEN/PURPLE/UI tags apply to future waves, not this one.** Sequencing gates are in the Gate column; DRAFT rows have no committed loop file yet.

| ID | Item | Status | Lane | Gate / note |
|------|------|--------|------|-------------|
| W2-01 | migration 0030 `patient_note_revisions` (loop: `docs/loops/wave-02/W2-01-mig-0030-patient-note-revisions.md`) | DONE (#452) | GREEN | none — patient-notes design ruling received (DECISIONS 2026-07-03); applied on dev, backfill 10/10, append-only + RLS tests green (300 total) |
| W2-02 | UI quick-fix batch (5 items, migration-free) (loop: `docs/loops/wave-02/W2-02-ui-quickfix-batch.md`) | DONE (#454) | GREEN runner | owner ruling 2026-07-03: wave-02 single-executor, UI lane closed this wave — migration-free; 5 items shipped, item 2 already enforced in data layer + regression-tested |
| W2-03 | location data cleanup (live-DB data op) (loop: `docs/loops/wave-02/W2-03-location-cleanup.md`) | DONE (#455) | PURPLE (GREEN runner) | executed per owner ruling 2026-07-03 (Option A, escalated recon mismatch): 2 active rows on fixture ids (OsteoJP (LV)/(CB)), 2 appts repointed, Montemor+manual rows archived, 275 appts unchanged, zero deletes, idempotent |
| W2-04 | no-note indicator UI on completed appointments (loop: `docs/loops/wave-02/W2-04-ui-no-note-indicator.md`) | DONE (#456) | GREEN runner | owner ruling 2026-07-03: wave-02 single-executor, UI lane closed this wave. "Sem nota" on completed+noteless appts across agenda/Marcações/patient-tab/preview via present-state EXISTS(appointment_notes); supersedes halt #440 |
| W2-05 | batch failure pop-up wiring (partial-success) (loop: `docs/loops/wave-02/W2-05-ui-batch-failure-popup.md`) | DONE (#457) | GREEN runner | owner ruling 2026-07-03: wave-02 single-executor, UI lane closed this wave. Recorrente routed through batchSchedule + failure dialog (per-row rebook); NO engine change needed (HALT gate cleared); supersedes halt #439 |
| W2-06 | fichas tab completion (list + create entry point) (loop: `docs/loops/wave-02/W2-06-ui-fichas-tab-completion.md`) | DONE (#458) | GREEN runner | owner ruling 2026-07-03: wave-02 single-executor, UI lane closed this wave. Registos tab: Nova ficha (scoped reuse) + per-ficha Nova versão (reuse versionRecordAction); /clinical nav item removed, list route kept unlinked (no orphan); /clinical/[id] deep links intact; supersedes halt #446 |
| W2-07 | migration 0031 NESA contraindication flags (loop: `docs/loops/wave-02/W2-07-mig-0031-nesa-contraindications.md`) | DONE (#453) | GREEN | AFTER W2-01 (0030) merged — one migration in flight; per DECISIONS 2026-07-03 ruling A; applied on dev, 3 boolean cols default false, db suite 303 green |
| W2-08 | NESA booking warning UI (loop: `docs/loops/wave-02/W2-08-ui-nesa-warning.md`) | DONE (#460) | GREEN runner | owner ruling 2026-07-03: wave-02 single-executor, UI lane closed this wave. Soft warning (never blocks) across 3 surfaces: patient checkboxes, service admin flag, reactive drawer Banner (both booking paths); per DECISIONS 2026-07-03 ruling A |
| W2-09 | batch V2 engine — explicit per-slot datetime list (loop: `docs/loops/wave-02/W2-09-engine-batch-v2.md`) | DONE (#461) | GREEN runner | migration-free; `batchSchedule` now accepts an explicit slot list OR a recurrence rule (discriminated), both converge on one booking loop via pure `resolveBatchSlots`; recurrence callers unchanged; per-slot alternatives; supersedes the V1 recurrence-only path |
| W2-10 | batch V2 UI (Agendar lote: count, every-X, per-date time pickers, summary, confirm) (loop: `docs/loops/wave-02/W2-10-ui-agendar-lote.md`) | DONE (#462) | GREEN runner | AFTER W2-09 merged (met). Agendar lote (count/every-X/per-date times/summary/confirm) submits the explicit slot list to the W2-09 engine; V1 recorrente REMOVED (single entry); reuses W2-05 failure dialog; pure lote.ts helper |
| W2-11 | patient notes tab + Notas Rápidas rewire to patient quick-note (loop: `docs/loops/wave-02/W2-11-ui-patient-notes.md`) | DONE (#463) | GREEN runner | recon: quick_notes = per-staff scratchpad (0 rows, no patient_id) → nothing to migrate; profile Notas tab (append-only) + Notas Rápidas patient-selector rewire; patients.notes flipped off UI (column untouched); migration-free |
| W2-12 | working-hours admin UI — availability template CRUD per therapist in Administração (weekdays, hours, location) (loop: `docs/loops/wave-02/W2-12-ui-working-hours-admin.md`) | DONE (#464) | GREEN runner | migration-free CRUD over `availability_templates` at /admin/working-hours (list/create/edit/archive); overlap not ambiguous (consumer merges) but reject-overlap + end>start enforced; active locations only; creates reflect in the booking panel |
| W2-13 | SMS confirmation flow — SPEC ONLY, no build this wave (Twilio PT, signed SIM/NÃO link page, flips 0024 `confirmation_state`) (loop: `docs/loops/wave-02/W2-13-spec-sms-confirmation.md`) | DONE (#465) | GREEN runner | docs-only: `SPEC-sms-confirmation.md` authored (tenant-from-token, HMAC single-scope, flips 0024 channel=sms, no reply-parsing) + 4 QUESTIONS logged (Twilio vendor, copy, send times, opt-out). No build; build gated on the vendor decision |

### Wave 02 deferred (recorded, not scheduled this wave)
- **2-clients-same-slot UI** — `booking_group_id` (0027) exists in schema, no UI yet. Deferred.
- **Marcações section stays** — no rename/relocation of the Marcações nav section this wave.
- **Fisiozero import** — sequenced LAST (after all Wave 02 build), gated on the pre-real-data gates (separate-prod-project + signed DPA, DECISIONS 2026-07-01 / 2026-07-02).

## Wave 03 candidates

> Added 2026-07-03 at Wave 02 close. UNORDERED, NOT committed scope — candidates for the next wave's planning pass, not loops yet. No lane/gate assignments until scoped.

- **SMS confirmation BUILD** — build the flow specified in `docs/design/SPEC-sms-confirmation.md`. GATED on Twilio vendor confirmation + EU residency/DPA (owner-confirmable) and JP's copy/send-time/opt-out answers (QUESTIONS 2026-07-03). No build until those clear.
- **Finance KPI report scoping** — the 0025 `analytics_events` capture is live and the VAT ruling is on file (CIVA art. 9 exemption, gross=final, DECISIONS 2026-07-02); scope it as its own loop. Note: the fiscal partner-model re-spec (DECISIONS 2026-07-03 entry B) applies to any fatura-recibo/discount work, not to the internal KPI report.
- **Fisiozero import build** — the import side (mapping + reconciliation), using dev SAMPLE data only; the live import stays gated on the pre-real-data gates (separate-prod-project + signed DPA). Import-collision HALT policy already recorded (DECISIONS 2026-07-02).
- **Portal V2 redesign** — GATED on owner mockups; no scope until provided.
- **CI db-gate hardening** — the db-gated step soft-passed a failing inner test during #449; hardening it touches `.github/workflows/db-tests.yml` → automatic OWNER HOLD, never self-merged (QUESTIONS 2026-07-03).
- **Preview DB isolation** — Vercel Preview envs share the single Supabase project with the deployed app; isolate preview DB as future infra (QUESTIONS 2026-07-03), part of the separate-prod-project work.
- **Legacy-shelf consolidation loop** — migrate the still-open `docs/QUESTIONS.md` items and any live `docs/DECISIONS.md` content onto the canonical `docs/design/` shelf, then leave pointer stubs (QUESTIONS 2026-07-03).
- **Dangling-branch pruning pass** — sweep merged/abandoned feature + docs branches (and their worktrees) left over from Waves 01–02; housekeeping only.
- **Superseded Max halt PRs closure** — post closing "superseded by W2-04/05/06" comments on the abandoned halt PRs **#440** (→ W2-04 #456), **#439** (→ W2-05 #457), **#446** (→ W2-06 #458); replacements all merged (QUESTIONS 2026-07-03 housekeeping ticket). Comment-only, no revert/reopen. → SCOPED into **W3-10**.

## Wave 03 Loop Queue

> Opened 2026-07-05 from the owner + Rodica QA scope pass (rulings recorded DECISIONS.md 2026-07-05). Active board — this is the runnable set. Same board rules as prior waves (status flow, ONE migration-lane loop in flight at a time, `db-tests.yml`/`e2e.yml` = owner hold, never self-merged). Loop files land under `docs/loops/wave-03/`. Sequencing gates are in the Gate column. All ten loops are authored and committed (WRITTEN); execution is GREEN's.
>
> Pre-real-data gate status at wave open: the **DPA gate is CLOSED** (signed, DECISIONS 2026-07-05); the **separate-prod-project gate remains OPEN** (DECISIONS 2026-07-01), so branch protection is not yet re-hardened and dev-phase merge rules still apply. No real patient data may enter until the prod-project gate also closes.

| ID | Loop | Status | Lane | Gate / note |
|------|------|--------|------|-------------|
| W3-01 | estado-removal-fix (`docs/loops/wave-03/W3-01-estado-removal-fix.md`) | DONE (#468) | UI (migration-free) | recon: UI already hid the Estado selector on create (W2-02 #454, e2e-covered); real gap was server-side — create + batch now hardcode `scheduled`/`pending`, never from payload. Axes stay orthogonal (DECISIONS 2026-07-01) |
| W3-02 | batch-failure-dialog-focus (`docs/loops/wave-03/W3-02-batch-failure-dialog-focus.md`) | DONE (#469) | UI (migration-free) | failure dialog was an in-flow overlay behind the modal drawer (inert; Escape/clicks hit the discard guard); now its own showModal <dialog> in the top layer via shared `useAnimatedDialog` — focused, isolated from "Descartar alterações?", edit-and-rebook works |
| W3-03 | booking-form-reorder (`docs/loops/wave-03/W3-03-booking-form-reorder.md`) | DONE (#470) | UI (migration-free) | Terapeuta first, Serviço below + auto-fill from therapist's first mapped service (fallback; W3-04 primary absent on main), editable override honored; reads `therapist_services` (0023), ordered created_at asc |
| W3-04 | primary-service-admin (`docs/loops/wave-03/W3-04-primary-service-admin.md`) | DONE (#471) | Admin (migration-free) | primary = earliest-created `therapist_services` mapping (no schema change, no UPDATE); re-designation = delete+insert of the others; admin "Serviço principal" on /admin/staff; W3-03 consumes it unchanged (already reads oldest-first) |
| W3-05 | tenant-settings-home (`docs/loops/wave-03/W3-05-tenant-settings-home.md`) | DONE (#472) | MIG-conditional → migration-free | verdict: MIGRATION-FREE — `tenants.settings` jsonb (RLS `tenants_tenant_isolation`, not client-exposed) hosts secrets under `settings.secrets`. Helper `lib/admin/tenant-secret.ts`; contract in DECISIONS. Head stays 0031. Unblocks W3-06 |
| W3-06 | password-gated-appointment-delete (`docs/loops/wave-03/W3-06-password-gated-appointment-delete.md`) | TODO | Server + UI (migration-free) | **W3-05 MERGED** — appointment hard-delete behind a hashed-password gate (initial 1234, Administração, server-side hashed), refuse when clinical notes/records linked, audit_log snapshot, child-rows-first RETURNING (DECISIONS 2026-07-05) |
| W3-07 | location-delete-when-unreferenced (`docs/loops/wave-03/W3-07-location-delete-when-unreferenced.md`) | TODO | Admin (migration-free) | none — delete enabled only for zero-appointment locations; referenced → archive only, delete disabled + tooltip; archived stays hidden from dropdowns (W2-02 preserved) (DECISIONS 2026-07-05) |
| W3-08 | agenda-6day-24h (`docs/loops/wave-03/W3-08-agenda-6day-24h.md`) | TODO | UI (migration-free) | none — agenda week view 6 days incl. Saturday; sweep ALL time display/pickers to 24h, no AM/PM (DECISIONS 2026-07-05 real schedule) |
| W3-09 | working-hours-real-schedule (`docs/loops/wave-03/W3-09-working-hours-real-schedule.md`) | TODO | PURPLE (live-DB data op) | none — set dev therapists' `availability_templates` to Mon–Fri 08:00–20:00, Sat 09:00–13:00; SEED_DEV_CONFIRM-guarded, idempotent (zero-delta re-run), archive-not-delete, live counts pasted (DECISIONS 2026-07-05 / 2026-07-02 idempotence ruling) |
| W3-10 | close-superseded-prs (`docs/loops/wave-03/W3-10-close-superseded-prs.md`) | TODO | gh-only housekeeping | none — comment-only supersede on the already-MERGED halt PRs #440→#456 (W2-04), #439→#457 (W2-05), #446→#458 (W2-06); no revert/reopen; no code, no PR opened |

### Wave 03 sequencing notes
- **One migration in flight:** only W3-05 may author a migration (0032, and only if recon finds no suitable existing tenant-settings home). Confirm 0031 is the latest on main and no migration PR is open before it authors.
- **W3-06 gates on W3-05 merged** (needs the hashed-secret home). **W3-03 soft-gates on W3-04** (primary representation) but ships the reorder regardless with a documented fallback.
- All other loops (W3-01, W3-02, W3-07, W3-08, W3-09, W3-10) are independent and parallel-safe against a single in-flight migration.
