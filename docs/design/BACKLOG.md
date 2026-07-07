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
| 0029 | patient number (loop: docs/loops/0029-patient-number.md) | DONE (#435 consumes; migration applied, head 0029) | trigger auto-assign, owner-approved deviation (DECISIONS 2026-07-02); backfill 105==105, 0 nulls, contiguous 1..105 |
| TBD | patient_notes append-only relation | DONE as 0030 (W2-01 #452) | shipped as `patient_note_revisions` in Wave 02 per the JP full-history ruling (DECISIONS 2026-07-02/03); backfill 10/10 |

### Ivan non-migration code (parallel-safe, not migration-numbered)
| Item | Status | Gate |
|------|--------|------|
| availability query (read-only, booked vs free) | DONE (#396) | none, parallel-safe with one in-flight migration |
| schedule-again clone endpoint (loop: docs/loops/schedule-again-clone.md) | DONE (#419) | none |
| FA-1 users-seed natural-key fix (loop: docs/loops/users-seed-natural-key-fix.md) | DONE | landed — seed user FKs resolve by `(tenant_id, email)`; latent risk closed (STATE 2026-07-02) |
| finance KPI report (revenue per therapist/service) | QUEUED (gate cleared) → carried to Wave 04 candidates | VAT answered — CIVA art. 9 exemption, gross=final (DECISIONS 2026-07-02); not scoped in Wave 03; carried forward |

### UI lane (Max)
| Item | Status | Gate |
|------|--------|------|
| remove Proximas marcacoes card | DONE (#385) | none |
| rename Revisao to Revisao Consulta | DONE (#384) | none |
| stale comment fix at page.tsx:360 | DONE (#383) | none |
| patient profile surfacing: profession + region (new in 0022), city + notes (already existed) | DONE (#393) | 0022 DONE |
| auto-select service from therapist | DONE (#445) | 0023 DONE |
| confirmation thumbs on appointment preview | DONE (#441) | 0024 DONE |
| no-note indicator on completed appointments | DONE via W2-04 (#456) | shipped as present-state `EXISTS(appointment_notes)` "Sem nota" indicator; supersedes halt #440 |
| availability panel in new-appointment flow | DONE | availability query (#396) consumed by the new-appointment flow; live |
| fichas-as-tab inside patient profile | DONE via W2-06 (#458) | Registos tab completed; `/clinical` nav item removed, deep links intact; supersedes halt #446 |
| schedule-again action on patient profile | DONE (#442) | clone endpoint DONE (#419) |
| batch failure pop-up | DONE via W2-05 (#457) | Recorrente routed through `batchSchedule` + failure dialog; W3-02 (#469) later lifted the dialog to the top layer; supersedes halt #439 |
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

> **CONSUMED at Wave 03 close (2026-07-06).** The Wave 03 scope pass (owner + Rodica, DECISIONS 2026-07-05) drew a different, tightly-scoped set of ten loops (W3-01..W3-10, all DONE). Of the candidates below, only "Superseded Max halt PRs closure" was scoped into Wave 03 (W3-10 #477, DONE). The remaining candidates (SMS build, finance KPI, Fisiozero import, Portal V2, CI db-gate hardening, preview DB isolation, legacy-shelf consolidation, dangling-branch pruning) were NOT taken this wave and are **carried forward into the Wave 04 candidates section below**. Kept here as the historical intake record.
>
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
| W3-06 | password-gated-appointment-delete (`docs/loops/wave-03/W3-06-password-gated-appointment-delete.md`) | DONE (#473) | Server + UI (migration-free) | hard-delete behind scrypt-hashed tenant password (W3-05 home, admin-only settings:manage); refuses linked notes/records/invoices; child-first RETURNING delete + PII-free audit snapshot; admin password-change in Administração |
| W3-07 | location-delete-when-unreferenced (`docs/loops/wave-03/W3-07-location-delete-when-unreferenced.md`) | DONE (#474) | Admin (migration-free) | delete enabled only for zero-appointment locations (else archive-only + disabled + tooltip); FKs handled non-destructively (null services/analytics, child-first delete of location-scoped config); archived stays hidden from dropdowns |
| W3-08 | agenda-6day-24h (`docs/loops/wave-03/W3-08-agenda-6day-24h.md`) | DONE (#475) | UI (migration-free) | week view = 6 days Mon–Sat (WEEK_DAYS 5→6, propagates to grid + fetch range); 24h already app-wide (central formatTimeOfDay + pt-PT Intl + native pickers), zero meridiem hits; tests + e2e |
| W3-09 | working-hours-real-schedule (`docs/loops/wave-03/W3-09-working-hours-real-schedule.md`) | DONE (#476) | PURPLE (live-DB data op) | guarded idempotent op set 5 dev therapists to Mon–Fri 08:00–20:00 + Sat 09:00–13:00 (primary location); upsert+archive, no delete; BEFORE 34/Sat=0 → AFTER 30 active/34 archived → re-run zero-delta |
| W3-10 | close-superseded-prs (`docs/loops/wave-03/W3-10-close-superseded-prs.md`) | DONE (comment-only; no PR) | gh-only housekeeping | confirmed #440→#456, #439→#457, #446→#458 all MERGED and each ALREADY carries the correct superseded-by comment (posted at the W2-04/05/06 merges); no duplicate posted, no revert/reopen/re-close |

### Wave 03 sequencing notes
- **One migration in flight:** only W3-05 may author a migration (0032, and only if recon finds no suitable existing tenant-settings home). Confirm 0031 is the latest on main and no migration PR is open before it authors.
- **W3-06 gates on W3-05 merged** (needs the hashed-secret home). **W3-03 soft-gates on W3-04** (primary representation) but ships the reorder regardless with a documented fallback.
- All other loops (W3-01, W3-02, W3-07, W3-08, W3-09, W3-10) are independent and parallel-safe against a single in-flight migration.

> **WAVE 03 CLOSED — 2026-07-06.** All ten loops merged (W3-01 #468 … W3-10 #477), zero halts, zero escalations. Migration head UNCHANGED at 0031, mirror parity 32/32. Suites: web 685, db 56 local + 255 DB-gated. Two on-branch CI-red fixes cleared before merge (W3-02 Playwright hidden-dialog assertion #469; W3-08 pt-PT Sábado weekday render #475). Halt-desk mailbox pattern ran its second wave with zero escalations. Real therapist entry (Max, admin UI) is IN PROGRESS — staff data, not patient data. See STATE.md 2026-07-06 close audit and the Wave 04 candidates section below.

## Wave 04 Loop Queue — early batch (two hotfix loops, ahead of the rest of Wave 04)

> Opened 2026-07-06 from owner QA after Wave 03 close. This is the ACTIVE, runnable board. These two loops ship AHEAD of the rest of Wave 04 authoring because **real therapist data entry (Max, in progress) is BLOCKED on W4-01(a)**. Same board rules as prior waves (status flow, ONE migration-lane loop in flight at a time, `db-tests.yml`/`e2e.yml` = owner hold never self-merged). Loop files land under `docs/loops/wave-04/`. Halt protocol for this batch is **CLASSIC** (no CYAN desk running): on any blocker, stop and report to Ivan with the mismatch, options, and a recommended default. Both loops are **migration-free**; head stays 0031.

| ID | Loop | Status | Lane | Gate / note |
|------|------|--------|------|-------------|
| W4-01 | equipa-team-upgrade (`docs/loops/wave-04/W4-01-equipa-team-upgrade.md`) | DONE (#480) | Admin (migration-free) | (a) Equipa primary-service dropdown listing ALL active services — INSERT when a therapist has zero mappings (fixes "Sem serviços"; e.g. Catarina Vieira), delete+insert re-designation when mappings exist (W3-04 mechanism, no UPDATE, 0023 no-grant); (b) per-therapist working-hours entry point from the Equipa row (recon: reuse W2-12 `/admin/working-hours` Horários CRUD if it scopes per-therapist, else build the minimal per-therapist view). **Unblocks Max's real therapist entry.** pt-PT, admin-only server-enforced |
| W4-02 | 24h-picker-sweep (`docs/loops/wave-04/W4-02-24h-picker-sweep.md`) | DONE (#481) | UI (migration-free) | recon-first: find EVERY time-INPUT widget (Nova marcação Hora picker confirmed offender + Agendar lote / working-hours / reschedule siblings), convert all to 24h `00:00`–`23:59`, remove AM/PM columns entirely; input-construction grep pass (not just format tokens) + value round-trip proof; zero AM/PM anywhere incl. inputs |

### Wave 04 early-batch board notes — owner-QA findings (2026-07-06)
- **QA finding vs W3-04 (#471) — design gap, not a regression.** W3-04 built primary-service **re-designation among a therapist's EXISTING `therapist_services` mappings** (delete+insert, no UPDATE per 0023). It never wired the **zero-mapping case**: a therapist with no mappings (e.g. **Catarina Vieira**) shows **"Sem serviços"** with **no control at all**, so no first/primary service can be assigned and Nova marcação has nothing to auto-fill. → scoped into **W4-01(a)**: the dropdown lists all active tenant services and INSERTs the first mapping through the existing append path.
- **QA finding vs W3-08 (#475) — a second component path missed.** W3-08 converted 24h **display** (confirmed correct) but its DoD grep matched meridiem **format tokens** only. The **custom time-picker widget in Nova marcação** builds its own `09 / 00 / AM–PM` columns from literal arrays/state — not a format token — so the token-grep could not see it. **Same failure class as the W3-01 estado regression (a second, unsearched component path).** → scoped into **W4-02**: recon widened to time-INPUT construction, all custom pickers converted to 24h, AM/PM columns removed.
- **Remaining Wave 04 authoring follows after this cleanup batch.** The rest of Wave 04 (AI recording pipeline, camera/photo capture, cleanup/data-hygiene, and the carried Wave 03 candidates below) is authored AFTER these two hotfix loops land, so Max's real therapist entry is unblocked first.

## Wave 04 Loop Queue — authored batch (W4-03 … W4-11)

> Authored 2026-07-06 (YELLOW docs lane). Loop files under `docs/loops/wave-04/`, 7-field Loop Package each. Same board rules as prior waves (status flow, ONE migration-lane loop in flight at a time, `db-tests.yml`/`e2e.yml` = owner hold never self-merged). Halt protocol is **CLASSIC** (no CYAN desk): on any blocker, stop and report to Ivan with the mismatch, options, and a recommended default. **All loops migration-free; head stays 0031.** Standing rules embedded in every loop: pt-PT UI copy; **all build + dry-run work SYNTHETIC-DATA-ONLY** (real-data go-live separately gated, owner ruling 2026-07-06); **LIVE-DATA CAUTION** — real therapist accounts (Max's) live on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`, never mutated; secrets fingerprints-only, never printed.

**EXECUTION ORDER (strict):** W4-03 → W4-04 → W4-05 → **MAX GATE** (Max confirms real-therapist entry complete) → W4-11 → W4-06 → W4-07 → W4-08 → W4-09 → W4-10. Rationale: W4-11 cleanup runs after W4-03 merges + the Max gate and BEFORE the recording chain, so the W4-10 dry run fires on a clean dev tenant that still holds the real therapists (DECISIONS 2026-07-06). The recording chain (W4-06 → W4-09) is strictly sequential; W4-10 is last and carries an EXTERNAL DoD (André confirmation).

| ID | Loop | Status | Lane | Gate / note |
|------|------|--------|------|-------------|
| W4-03 | nova-marcacao-auto-select (`docs/loops/wave-04/W4-03-nova-marcacao-auto-select.md`) | READY | UI+server (migration-free) | **FIRST.** Defect fix (owner QA 2026-07-06): Serviço does not auto-fill in Nova marcação for a W4-01-written primary (Tiago Reis). Recon-first — prove hypothesis (a) stale read / (b) event not re-triggered / (c) W4-01 write shape diverges from W3-03 read; second-component-path rule: recon + fix ALL Serviço-rendering paths (Nova marcação, Agendar lote, batch rebook, schedule-again). No UPDATE to `therapist_services` (0023 42501). Reproduce on a W4-01-written fixture on the E2E seed tenant, never on Tiago Reis |
| W4-04 | spec-ai-recording (`docs/loops/wave-04/W4-04-spec-ai-recording.md`) | DONE (#483) | SPEC-only (zero code) | Authors `docs/design/SPEC-ai-recording.md` — full M1 webhook contract (`audio_url` presigned GET 1h, `audio_filename`, `patient_id`, `doctor_id`, `consultation_started_at/ended_at`, template `osteopathy`); `x-make-apikey` header (vault-only); MediaRecorder webm/opus 32 kbps mono + Whisper 25 MB / 14.4 MB-per-hour / 90-min rationale; Chrome-only + pt-PT block; machine-stamped timestamps feeding the idempotency key; direct-to-S3 PUT never via Vercel; stub-before-Record; consent (actor+timestamp); identity-human vs twelve-clinical-fields-AI. **Merged before the build chain consumes it** |
| W4-05 | camera-to-ficha (`docs/loops/wave-04/W4-05-camera-to-ficha.md`) | DONE (#484) | UI+storage (migration-free) | Rodica request, JP-approved (photos in fichas). Recon-first: what "Adicionar anexo" does today + whether upload works. Then in-page `getUserMedia` capture (preferred over file-input `capture` — the "never in her gallery" requirement) → attach to a **synthetic** patient's ficha anexos via the existing signed-URL path (CLAUDE.md rule 8, never public). Rodica real-phone check relayed by Ivan closes the loop |
| — | **MAX GATE** | — | gate | Max confirms real-therapist entry complete (relayed by Ivan). W4-11 does not start until satisfied |
| W4-11 | scripted-cleanup (`docs/loops/wave-04/W4-11-scripted-cleanup.md`) | QUEUED | GUARDED live-DB data op (migration-free) | Runs AFTER W4-03 merged AND the MAX GATE, BEFORE W4-06. Purge synthetic patients + their appointments/`patient_note_revisions`, analytics test events, and the 5 dev fixture therapists + their `availability_templates`/`therapist_services`. **Preserve by exclusion:** all real therapist accounts (Max's), locations, services, roles, tenant settings. Natural-key resolution (never hardcode FK ids), counts before/after, child-first, `RETURNING`, zero-delta re-run. Any classification ambiguity → HALT (DATA) |
| W4-06 | quick-create-stub-consent (`docs/loops/wave-04/W4-06-quick-create-stub-consent.md`) | DONE (#489) | UI+server (migration-free) | Recording chain step 1. Start-consultation: existing-patient select OR new stub (name required, phone optional, "Criar e iniciar gravação"); 0029 trigger numbers on NULL (no schema). Consent checkbox before Record, stored actor+timestamp, server-enforced. Out of scope: merge-patients (roadmap), 30-day stub cleanup (Wave 05) |
| W4-07 | recording-ui (`docs/loops/wave-04/W4-07-recording-ui.md`) | DONE (#490) | UI (migration-free) | Depends W4-06 + SPEC. MediaRecorder webm/opus 32 kbps mono, Chrome-only gate + pt-PT block, Record→`consultation_started_at` / Stop→`consultation_ended_at` machine-stamped. Produces the blob; **no upload here** (W4-08) |
| W4-08 | presigned-put-flow (`docs/loops/wave-04/W4-08-presigned-put-flow.md`) | QUEUED | backend+client (migration-free) | Depends W4-07. Backend signs presigned PUT with the scoped AWS key (`PutObject`+`GetObject` on `osteojp-audio-intake` only, eu-central-1) from Vercel env; browser PUTs direct to S3, never via a Vercel route (4.5 MB limit). CORS is André's side (locked to the EMR origins). Round-trip proof: signer response + presigned GET 200, credential-free. Key never printed/in code |
| W4-09 | post-upload-webhook (`docs/loops/wave-04/W4-09-post-upload-webhook.md`) | QUEUED | backend (migration-free) | Depends W4-08. Backend generates presigned GET (1h) + fires the M1 webhook with the full contract + `x-make-apikey` (env/vault only). DoD: a fire returns success with all contract fields present; payload pasted redacted (no key, presigned-URL token truncated) |
| W4-12 | location-auto-select (`docs/loops/wave-04/W4-12-location-auto-select.md`) | DONE (#486) | UI+server (migration-free) | Owner addition (Ivan 2026-07-06). Booking Terapeuta selection auto-fills Localização from the therapist's location assignment (derived from `availability_templates`, migration-free): exactly one active location → auto-fill; zero/multiple → manual stays; always editable, manual pick never clobbered. Fires on the SAME event as the W3-03 Serviço auto-fill via `getTherapistLocationIds` + `pickAutoFillLocation` + a `userChangedLocation` ref. Three drawer paths inherit it; schedule-again copies source (unaffected). Dedicated E2E fixtures (single- + multi-location therapists) |
| W4-10 | first-test-fire-e2e (`docs/loops/wave-04/W4-10-first-test-fire-e2e.md`) | QUEUED | backend/dry-run (migration-free) | **LAST.** Depends W4-09 merged AND W4-11 completed. Synthetic quick-created patient; real therapist id as `doctor_id` **READ-ONLY** (zero mutation); audio = laptop mic or generated webm/opus (Jabra re-test is a follow-up, owner ruling). MUST carry `x-make-apikey` + `audio_filename` (André's module-26 token). **DoD part 1 (machine):** draft lands `pending_review` via the existing HMAC ingestion endpoint, DB evidence pasted. **DoD part 2 (external):** André confirms receipt + token exposure, relayed by Ivan → AWAITING-EXTERNAL mailbox note, loop closes on the relay |

## Wave 04 Loop Queue — design batch (W4-13 … W4-18)

> Authored 2026-07-06 (YELLOW docs lane, batch 2). Loop files under `docs/loops/wave-04/`, 7-field Loop Package each. Owner-QA-driven surface redesigns. **This batch is MIGRATION-FREE and GATE-INDEPENDENT of the recording chain — the owner may pull it forward if the recording chain (W4-06 → W4-10) is blocked on a gate.** Same board + halt rules as the batch above (CLASSIC halt). Standing rules embedded in every loop: pt-PT UI copy; functionality-preserving unless the loop states otherwise; **LIVE-DATA CAUTION** — real therapist accounts (Max's) + their `availability_templates`/`therapist_services` on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` are never mutated, all verification on the E2E seed tenant; redesigns move Playwright selectors → update specs **on-branch**, **never touch `db-tests.yml`/`e2e.yml`**.

**BATCH ORDER (W4-13 FIRST — design anchor, then 14→18):** W4-13 establishes the visual system in `docs/design/UI-STYLE.md`; **W4-14 → W4-18 depend on W4-13 merged and conform to UI-STYLE.md.** Within 14→18 there is no hard inter-dependency (they touch different surfaces) — run in the listed order or parallelize as capacity allows, each conforming to UI-STYLE.md.

| ID | Loop | Status | Lane | Gate / note |
|------|------|--------|------|-------------|
| W4-13 | equipa-dashboard-redesign (`docs/loops/wave-04/W4-13-equipa-dashboard-redesign.md`) | QUEUED | Admin UI (migration-free) | **DESIGN ANCHOR — runs FIRST.** Full-width invite area (+ team summary counts) + team dashboard table (Nome, Email, Função, Serviço principal, Estado badge, Ações) with row-actions grouped (menu/drawer). Preserves ALL existing Equipa functionality exactly incl. the **password-gated therapist delete (gate unchanged)** and the no-UPDATE primary-service dropdown. **Commits `docs/design/UI-STYLE.md`** (card/table/spacing/badge/button/toolbar/Tailwind-v4 tokens) that W4-14→W4-18 follow. Refinement, not rebrand |
| W4-14 | horarios-redesign (`docs/loops/wave-04/W4-14-horarios-redesign.md`) | QUEUED | Admin UI+server (migration-free, functional change) | Depends W4-13. Per-therapist cards + one `Editar horário` **top-layer modal** (`showModal`, W3-02): weekday toggles, per-day 24h hours (W4-02 `TimeField`, 15-min step) + location, one `Guardar` through the W2-12 CRUD paths; **in-modal row delete, NO password** (owner ruling 2026-07-06); deep link `?t=<id>` preselects. Zero availability-read regression (`getTherapistAvailability`, booking). **LIVE-DATA CAUTION strongest here** |
| W4-15 | servicos-delete-and-redesign (`docs/loops/wave-04/W4-15-servicos-delete-and-redesign.md`) | QUEUED | Admin UI+server (migration-free, functional change) | Depends W4-13. Per-service delete, **NO password**, reference-guarded (W3-07 pattern): zero-reference hard-delete (`RETURNING`), referenced = archive-only (disabled control + pt-PT tooltip). **Recon confirms the ACTUAL service reference set** (appointments / `therapist_services` / `service_location_prices` / any others) before build. Restyle the Serviços tab per UI-STYLE.md (table, Estado badges, cleaner Preços por local) |
| W4-16 | pacientes-redesign (`docs/loops/wave-04/W4-16-pacientes-redesign.md`) | QUEUED | UI (migration-free, display-only) | Depends W4-13. List → structured table (Paciente + avatar initials, NIF, Nº de paciente, Telemóvel, chevron), search unchanged; detail → dashboard (identity header + dados/notas/anexos/marcações). **Display-only: zero data-model change; append-only `patient_note_revisions` untouched, `patients.notes` stays ignored; anexos signed-URL behavior unchanged** |
| W4-17 | agenda-header-redesign (`docs/loops/wave-04/W4-17-agenda-header-redesign.md`) | QUEUED | UI (migration-free) | Depends W4-13. Unified toolbar (prominent segmented Dia/Semana, date picker, Hoje, prev/next grouped) + a structured range chip replacing the floating week-range text, carrying a **live appointment count** for the visible range (owner default); `Todos os terapeutas` + `Todas as localizações` filters aligned into the toolbar row. **W3-08 six-day Mon–Sat + 24h grid untouched** |
| W4-18 | inicio-redesign (`docs/loops/wave-04/W4-18-inicio-redesign.md`) | QUEUED | UI (migration-free) | Depends W4-13. Sixth quick-action tile `Revisão Consulta` (owner default) right of Administração, linking to the existing page; `Resumo semanal` extended full-width; new `Próximas marcações` card (owner default) — today's next appointments (time/patient/therapist), reading existing data, role-scoped. Notas Rápidas + existing tiles untouched |

## Wave 04 Loop Queue — secondary participants (W4-19, LAST in the wave)

> Authored 2026-07-06 (YELLOW docs lane, batch 3). **LAST loop in Wave 04 — runs after W4-18.** The **ONLY Wave 04 loop pre-approved to fire a migration** (owner ruling, DECISIONS 2026-07-06 "Secondary participants on appointments"): recon-first — migration-free if a genuine path exists, else **ONE migration 0032** (the single migration in flight). Standing rules apply: pt-PT UI copy; LIVE-DATA CAUTION (real therapist accounts on dev tenant `3a2d0711-...` never mutated, verify on the E2E seed tenant); conforms to `docs/design/UI-STYLE.md` (W4-13); Playwright selector updates on-branch, **never touch `db-tests.yml`/`e2e.yml`**; CLASSIC halt.

| ID | Loop | Status | Lane | Gate / note |
|------|------|--------|------|-------------|
| W4-19 | secondary-participants (`docs/loops/wave-04/W4-19-secondary-participants.md`) | QUEUED | UI+server (+conditional schema — **migration pre-approved**) | **LAST in Wave 04, after W4-18.** Optional `Paciente 2` + `Terapeuta 2` on the booking panel (de-emphasized), persisted linked display data. **Primary-only semantics everywhere** (availability, Serviço/Localização auto-selects, analytics attribution, AI-recording primary pair + idempotency key, Estado/lifecycle axes all stay primary). Secondary shown on appointment details + agenda card (`+1` badge); agenda renders under the primary therapist column only (both-columns = recorded follow-up). Clone copies secondary as-is; W3-06 + reference guards count secondary linkage. **Recon-first migration:** migration-free if possible, else **pre-approved 0032** (default: two nullable FK columns on `appointments`; junction only on a hard blocker) — the **only wave loop allowed a migration**; if fired → mirrored + `--check` (parity 33/33, head 0032), RLS db test in the same PR |

## Wave 04 candidates

> Added 2026-07-06 at Wave 03 close. UNORDERED, NOT committed scope — candidates for the Wave 04 planning pass, not loops yet. No lane/gate assignments until scoped. **All Wave 04 build and dry-run work is SYNTHETIC-DATA-ONLY; real-data go-live is a separately gated step (pre-real-data gates: separate-prod-project DECISIONS 2026-07-01; DPA CLOSED DECISIONS 2026-07-05).**

### AI recording pipeline (new this wave — owner-confirmed infra + product calls, DECISIONS 2026-07-06)
| Candidate | Origin | Gate / note |
|-----------|--------|-------------|
| `SPEC-ai-recording.md` authoring | DECISIONS 2026-07-06 (AI recording infra) | full M1 webhook contract incl. the API-key header + `audio_filename` field; authored before the build loops consume it |
| Recording UI (MediaRecorder) | Wave 04 scope | `webm`/opus, 32 kbps mono, **Chrome-only gate**, automatic timestamps |
| Consent checkbox hook before Record | DECISIONS 2026-07-06 (AI recording consent) | checkbox gates the Record action; store actor + timestamp, minimum-viable (candidate home: `audit_log`, PII-free) |
| Quick-create stub patient at record time | DECISIONS 2026-07-06 (visitor stub retention) | name REQUIRED, phone OPTIONAL; 0029 trigger handles numbering; identity data human-entered ONLY (no auto-fill of identity) |
| Presigned PUT direct-to-S3 + CORS coordination | DECISIONS 2026-07-06 (AI recording infra) | never through Vercel routes; 4.5 MB limit; supply EMR origins list to André for the CORS rule (pending) |
| Post-upload presigned GET + M1 webhook fire | DECISIONS 2026-07-06 (AI recording infra) | backend signs the GET; webhook fires with API-key auth + `audio_filename` |
| End-to-end synthetic dry run (with André) | Wave 04 DoD | the wave's Definition of Done — synthetic-data-only, André in the loop |

### Camera / photo capture
| Candidate | Origin | Gate / note |
|-----------|--------|-------------|
| Camera-to-ficha capture button | DECISIONS 2026-07-06 (photos in fichas approved) | `getUserMedia` **recon-first**; NO device-gallery persistence; Rodica phone verification; signed-URL storage only (CLAUDE.md rule 8) |

### Cleanup / data hygiene
| Candidate | Origin | Gate / note |
|-----------|--------|-------------|
| 30-day stub cleanup job | DECISIONS 2026-07-06 (visitor stub retention) | cleans never-promoted stub patients after 30 days; preserves real/promoted patients and Max's real therapist accounts |
| Scripted test-data cleanup loop (post-QA) | Wave 04 scope | runs AFTER QA; **preserves Max's real therapist accounts** (staff) and any promoted patients; synthetic QA rows only |
| Merge-patients function | Roadmap (NOT this wave) | `patients.merged_into_id` pointer exists in schema (STATE 2026-06-30); function is roadmap, deferred |

### Carried from Wave 03 candidates (not taken W3)
| Candidate | Origin | Gate / note |
|-----------|--------|-------------|
| SMS confirmation BUILD | DECISIONS 2026-07-06 (product calls) | product calls made (single 24h reminder, no at-booking msg, staff-toggle opt-out); still GATED on the Twilio vendor + EU-residency/DPA decision (OPEN) |
| Finance KPI report scoping | DECISIONS 2026-07-02 (VAT: CIVA art. 9 exemption) | gate cleared (gross=final); scope as its own loop; internal KPI only, not fatura-recibo |
| Fisiozero import build | BACKLOG Wave 03 candidates | mapping + reconciliation on dev SAMPLE data only; live import gated on the pre-real-data gates; collision-HALT policy on file (DECISIONS 2026-07-02) |
| Portal V2 redesign | BACKLOG Wave 03 candidates | GATED — pending JP's reaction to Max's mockups; no scope until provided |
| CI db-gate hardening | QUESTIONS 2026-07-03 | touches `.github/workflows/db-tests.yml` → automatic OWNER HOLD, never self-merged; opens a PR and HALTS for owner merge |

### Recorded follow-ups (not scoped)
| Candidate | Origin | Gate / note |
|-----------|--------|-------------|
| Agenda: render a secondary-therapist appointment under BOTH therapist columns | DECISIONS 2026-07-06 (Secondary participants on appointments) | explicitly deferred out of W4-19 — W4-19 renders under the PRIMARY therapist column only (`+1` badge for the secondary). Dual-column rendering is the recorded follow-up; scope later if the clinic wants it |
| Preview DB isolation | QUESTIONS 2026-07-03 | future infra, part of the separate-prod-project work |
| Legacy-shelf consolidation loop | QUESTIONS 2026-07-03 | migrate still-open legacy `docs/` items onto canonical `docs/design/`, leave pointer stubs; its own docs loop |
| Dangling-branch pruning pass | BACKLOG Wave 03 candidates | sweep merged/abandoned feature + docs branches and their worktrees from Waves 01–03; housekeeping only |
