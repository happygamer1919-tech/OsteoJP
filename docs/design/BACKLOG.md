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
| W4-03 | nova-marcacao-auto-select (`docs/loops/wave-04/W4-03-nova-marcacao-auto-select.md`) | DONE (resolved-unreproducible, docs-only, owner QA 2026-07-07) | UI+server (migration-free) | **RESOLVED-UNREPRODUCIBLE.** Owner live QA (Ivan, 2026-07-07) confirmed Definir + Nova marcação Serviço auto-select **fires correctly**. Matches GREEN recon: the W3-03 read round-trip was proven correct and covered by a passing e2e; the 2026-07-06 QA symptom was environment/transient, no code defect. Closed docs-only, **zero code change**. Duplicate Fisioterapia service rows = owner UI housekeeping (synthetic seed artifacts, no loop action; any cleanup rides W4-11). Original defect note (2026-07-06):  Serviço does not auto-fill in Nova marcação for a W4-01-written primary (Tiago Reis). Recon-first — prove hypothesis (a) stale read / (b) event not re-triggered / (c) W4-01 write shape diverges from W3-03 read; second-component-path rule: recon + fix ALL Serviço-rendering paths (Nova marcação, Agendar lote, batch rebook, schedule-again). No UPDATE to `therapist_services` (0023 42501). Reproduce on a W4-01-written fixture on the E2E seed tenant, never on Tiago Reis |
| W4-04 | spec-ai-recording (`docs/loops/wave-04/W4-04-spec-ai-recording.md`) | DONE (#483) | SPEC-only (zero code) | Authors `docs/design/SPEC-ai-recording.md` — full M1 webhook contract (`audio_url` presigned GET 1h, `audio_filename`, `patient_id`, `doctor_id`, `consultation_started_at/ended_at`, template `osteopathy`); `x-make-apikey` header (vault-only); MediaRecorder webm/opus 32 kbps mono + Whisper 25 MB / 14.4 MB-per-hour / 90-min rationale; Chrome-only + pt-PT block; machine-stamped timestamps feeding the idempotency key; direct-to-S3 PUT never via Vercel; stub-before-Record; consent (actor+timestamp); identity-human vs twelve-clinical-fields-AI. **Merged before the build chain consumes it** |
| W4-05 | camera-to-ficha (`docs/loops/wave-04/W4-05-camera-to-ficha.md`) | DONE (#484) | UI+storage (migration-free) | Rodica request, JP-approved (photos in fichas). Recon-first: what "Adicionar anexo" does today + whether upload works. Then in-page `getUserMedia` capture (preferred over file-input `capture` — the "never in her gallery" requirement) → attach to a **synthetic** patient's ficha anexos via the existing signed-URL path (CLAUDE.md rule 8, never public). Rodica real-phone check relayed by Ivan closes the loop |
| — | **MAX GATE** | — | gate | Max confirms real-therapist entry complete (relayed by Ivan). W4-11 does not start until satisfied |
| W4-11 | scripted-cleanup (`docs/loops/wave-04/W4-11-scripted-cleanup.md`) | DONE-partial (Option B, owner ruling 2026-07-07) | GUARDED live-DB data op (migration-free) | Runs AFTER W4-03 merged AND the MAX GATE, BEFORE W4-06. Purge synthetic patients + their appointments/`patient_note_revisions`, analytics test events, and the 5 dev fixture therapists + their `availability_templates`/`therapist_services`. **Preserve by exclusion:** all real therapist accounts (Max's), locations, services, roles, tenant settings. Natural-key resolution (never hardcode FK ids), counts before/after, child-first, `RETURNING`, zero-delta re-run. Any classification ambiguity → HALT (DATA) |
| W4-06 | quick-create-stub-consent (`docs/loops/wave-04/W4-06-quick-create-stub-consent.md`) | DONE (#489) | UI+server (migration-free) | Recording chain step 1. Start-consultation: existing-patient select OR new stub (name required, phone optional, "Criar e iniciar gravação"); 0029 trigger numbers on NULL (no schema). Consent checkbox before Record, stored actor+timestamp, server-enforced. Out of scope: merge-patients (roadmap), 30-day stub cleanup (Wave 05) |
| W4-07 | recording-ui (`docs/loops/wave-04/W4-07-recording-ui.md`) | DONE (#490) | UI (migration-free) | Depends W4-06 + SPEC. MediaRecorder webm/opus 32 kbps mono, Chrome-only gate + pt-PT block, Record→`consultation_started_at` / Stop→`consultation_ended_at` machine-stamped. Produces the blob; **no upload here** (W4-08) |
| W4-08 | presigned-put-flow (`docs/loops/wave-04/W4-08-presigned-put-flow.md`) | DONE (#491) | backend+client (migration-free) | Depends W4-07. Backend signs presigned PUT with the scoped AWS key (`PutObject`+`GetObject` on `osteojp-audio-intake` only, eu-central-1) from Vercel env; browser PUTs direct to S3, never via a Vercel route (4.5 MB limit). CORS is André's side (locked to the EMR origins). Round-trip proof: signer response + presigned GET 200, credential-free. Key never printed/in code |
| W4-09 | post-upload-webhook (`docs/loops/wave-04/W4-09-post-upload-webhook.md`) | DONE (#492) | backend (migration-free) | Depends W4-08. Backend generates presigned GET (1h) + fires the M1 webhook with the full contract + `x-make-apikey` (env/vault only). DoD: a fire returns success with all contract fields present; payload pasted redacted (no key, presigned-URL token truncated) |
| W4-12 | location-auto-select (`docs/loops/wave-04/W4-12-location-auto-select.md`) | DONE (#486) | UI+server (migration-free) | Owner addition (Ivan 2026-07-06). Booking Terapeuta selection auto-fills Localização from the therapist's location assignment (derived from `availability_templates`, migration-free): exactly one active location → auto-fill; zero/multiple → manual stays; always editable, manual pick never clobbered. Fires on the SAME event as the W3-03 Serviço auto-fill via `getTherapistLocationIds` + `pickAutoFillLocation` + a `userChangedLocation` ref. Three drawer paths inherit it; schedule-again copies source (unaffected). Dedicated E2E fixtures (single- + multi-location therapists) |
| W4-10 | first-test-fire-e2e (`docs/loops/wave-04/W4-10-first-test-fire-e2e.md`) | DONE (external confirmation relayed by Ivan 2026-07-08; #493 machine DoD merged) | backend/dry-run (migration-free) | **LAST.** Depends W4-09 merged AND W4-11 completed. Synthetic quick-created patient; real therapist id as `doctor_id` **READ-ONLY** (zero mutation); audio = laptop mic or generated webm/opus (Jabra re-test is a follow-up, owner ruling). MUST carry `x-make-apikey` + `audio_filename` (André's module-26 token). **DoD part 1 (machine):** draft lands `pending_review` via the existing HMAC ingestion endpoint, DB evidence pasted. **DoD part 2 (external):** André confirms receipt + token exposure, relayed by Ivan → AWAITING-EXTERNAL mailbox note, loop closes on the relay |

> **W4-11 dev-tenant synthetic residue (owner ruling B, 2026-07-07):** the Option-B partial cleanup deleted all deletable synthetic data (74 patients + subtree, 108 appointments, 64 fixture `availability_templates`; fixture users deactivated, not deleted) and left, by design, **49 locked/signed synthetic clinical_records + their 31 pinned patients + the pinned fixture users**. The clinical-records immutability trigger (rule 4) and audit_log append-only (rule 6) were never touched; no bypass script exists. **Revisit this residue at the pre-real-data gate when the prod Supabase project splits — the residue is dev-only by construction.** Evidence pasted in DECISIONS 2026-07-07.

## Wave 04 Loop Queue — design batch (W4-13 … W4-18)

> Authored 2026-07-06 (YELLOW docs lane, batch 2). Loop files under `docs/loops/wave-04/`, 7-field Loop Package each. Owner-QA-driven surface redesigns. **This batch is MIGRATION-FREE and GATE-INDEPENDENT of the recording chain — the owner may pull it forward if the recording chain (W4-06 → W4-10) is blocked on a gate.** Same board + halt rules as the batch above (CLASSIC halt). Standing rules embedded in every loop: pt-PT UI copy; functionality-preserving unless the loop states otherwise; **LIVE-DATA CAUTION** — real therapist accounts (Max's) + their `availability_templates`/`therapist_services` on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` are never mutated, all verification on the E2E seed tenant; redesigns move Playwright selectors → update specs **on-branch**, **never touch `db-tests.yml`/`e2e.yml`**.

**BATCH ORDER (W4-13 FIRST — design anchor, then 14→18):** W4-13 establishes the visual system in `docs/design/UI-STYLE.md`; **W4-14 → W4-18 depend on W4-13 merged and conform to UI-STYLE.md.** Within 14→18 there is no hard inter-dependency (they touch different surfaces) — run in the listed order or parallelize as capacity allows, each conforming to UI-STYLE.md.

| ID | Loop | Status | Lane | Gate / note |
|------|------|--------|------|-------------|
| W4-13 | equipa-dashboard-redesign (`docs/loops/wave-04/W4-13-equipa-dashboard-redesign.md`) | DONE (#496) | Admin UI (migration-free) | **DESIGN ANCHOR — runs FIRST.** Full-width invite area (+ team summary counts) + team dashboard table (Nome, Email, Função, Serviço principal, Estado badge, Ações) with row-actions grouped (menu/drawer). Preserves ALL existing Equipa functionality exactly incl. the **password-gated therapist delete (gate unchanged)** and the no-UPDATE primary-service dropdown. **Commits `docs/design/UI-STYLE.md`** (card/table/spacing/badge/button/toolbar/Tailwind-v4 tokens) that W4-14→W4-18 follow. Refinement, not rebrand |
| W4-14 | horarios-redesign (`docs/loops/wave-04/W4-14-horarios-redesign.md`) | DONE (#497) | Admin UI+server (migration-free, functional change) | Depends W4-13. Per-therapist cards + one `Editar horário` **top-layer modal** (`showModal`, W3-02): weekday toggles, per-day 24h hours (W4-02 `TimeField`, 15-min step) + location, one `Guardar` through the W2-12 CRUD paths; **in-modal row delete, NO password** (owner ruling 2026-07-06); deep link `?t=<id>` preselects. Zero availability-read regression (`getTherapistAvailability`, booking). **LIVE-DATA CAUTION strongest here** |
| W4-15 | servicos-delete-and-redesign (`docs/loops/wave-04/W4-15-servicos-delete-and-redesign.md`) | DONE (#498) | Admin UI+server (migration-free, functional change) | Depends W4-13. Per-service delete, **NO password**, reference-guarded (W3-07 pattern): zero-reference hard-delete (`RETURNING`), referenced = archive-only (disabled control + pt-PT tooltip). **Recon confirms the ACTUAL service reference set** (appointments / `therapist_services` / `service_location_prices` / any others) before build. Restyle the Serviços tab per UI-STYLE.md (table, Estado badges, cleaner Preços por local) |
| W4-16 | pacientes-redesign (`docs/loops/wave-04/W4-16-pacientes-redesign.md`) | DONE (shipped in prior V2 wave; owner re-QA at wave close 2026-07-07, docs-only) | UI (migration-free, display-only) | Depends W4-13. List → structured table (Paciente + avatar initials, NIF, Nº de paciente, Telemóvel, chevron), search unchanged; detail → dashboard (identity header + dados/notas/anexos/marcações). **Display-only: zero data-model change; append-only `patient_note_revisions` untouched, `patients.notes` stays ignored; anexos signed-URL behavior unchanged** |
| W4-17 | agenda-header-redesign (`docs/loops/wave-04/W4-17-agenda-header-redesign.md`) | DONE (#499) | UI (migration-free) | Depends W4-13. Unified toolbar (prominent segmented Dia/Semana, date picker, Hoje, prev/next grouped) + a structured range chip replacing the floating week-range text, carrying a **live appointment count** for the visible range (owner default); `Todos os terapeutas` + `Todas as localizações` filters aligned into the toolbar row. **W3-08 six-day Mon–Sat + 24h grid untouched** |
| W4-18 | inicio-redesign (`docs/loops/wave-04/W4-18-inicio-redesign.md`) | DONE (#500) | UI (migration-free) | Depends W4-13. Sixth quick-action tile `Revisão Consulta` (owner default) right of Administração, linking to the existing page; `Resumo semanal` extended full-width; new `Próximas marcações` card (owner default) — today's next appointments (time/patient/therapist), reading existing data, role-scoped. Notas Rápidas + existing tiles untouched |

## Wave 04 Loop Queue — secondary participants (W4-19, LAST in the wave)

> Authored 2026-07-06 (YELLOW docs lane, batch 3). **LAST loop in Wave 04 — runs after W4-18.** The **ONLY Wave 04 loop pre-approved to fire a migration** (owner ruling, DECISIONS 2026-07-06 "Secondary participants on appointments"): recon-first — migration-free if a genuine path exists, else **ONE migration 0032** (the single migration in flight). Standing rules apply: pt-PT UI copy; LIVE-DATA CAUTION (real therapist accounts on dev tenant `3a2d0711-...` never mutated, verify on the E2E seed tenant); conforms to `docs/design/UI-STYLE.md` (W4-13); Playwright selector updates on-branch, **never touch `db-tests.yml`/`e2e.yml`**; CLASSIC halt.

| ID | Loop | Status | Lane | Gate / note |
|------|------|--------|------|-------------|
| W4-19 | secondary-participants (`docs/loops/wave-04/W4-19-secondary-participants.md`) | DONE (#501, migration 0032) | UI+server (+conditional schema — **migration pre-approved**) | **LAST in Wave 04, after W4-18.** Optional `Paciente 2` + `Terapeuta 2` on the booking panel (de-emphasized), persisted linked display data. **Primary-only semantics everywhere** (availability, Serviço/Localização auto-selects, analytics attribution, AI-recording primary pair + idempotency key, Estado/lifecycle axes all stay primary). Secondary shown on appointment details + agenda card (`+1` badge); agenda renders under the primary therapist column only (both-columns = recorded follow-up). Clone copies secondary as-is; W3-06 + reference guards count secondary linkage. **Recon-first migration:** migration-free if possible, else **pre-approved 0032** (default: two nullable FK columns on `appointments`; junction only on a hard blocker) — the **only wave loop allowed a migration**; if fired → mirrored + `--check` (parity 33/33, head 0032), RLS db test in the same PR |

> **WAVE 04 CLOSED — 2026-07-07.** All 19 loops (W4-01…W4-19) plus the owner addition W4-12 resolved. Final PRs: W4-01 #480, W4-02 #481, W4-03 #495 (resolved-unreproducible), W4-04 #483, W4-05 #484, W4-06 #489, W4-07 #490, W4-08 #491, W4-09 #492, W4-10 #493 (machine DoD; AWAITING-EXTERNAL), W4-11 #502 (DONE-partial, Option B), W4-12 #486, W4-13 #496, W4-14 #497, W4-15 #498, W4-16 #502 (docs-only close), W4-17 #499, W4-18 #500, W4-19 #501 (migration 0032). Migration head **0032**, mirror parity **33/33**, branch-time main SHA **`69d2710`**. Suites: web **816**, ui **42**, @osteojp/db **56** local + DB-gated (incl. `secondary-participants-rls.test.ts`), admin **10**, api **136**; lint 0, typecheck 9/9. One escalated ruling (W4-11 A/B/C → Option B) and one surfaced already-satisfied loop (W4-16 → docs close), both via #502. See STATE.md 2026-07-07 close audit and DECISIONS 2026-07-07. Wave 05 candidates below.

## Post-Wave-04 standalone fixes

| Loop | Ref | Status | What |
|------|-----|--------|------|
| W4-20 | consultation-discoverability (`docs/loops/wave-04/W4-20-consultation-discoverability.md`) | DONE (standalone, 2026-07-08) | Owner QA: the start-consultation recording screen (`/consultation`, W4-06/W4-07) had NO nav entry (direct-URL only). Replace the Início **Revisão Consulta** quick-action tile with an **Iniciar consulta** tile → `/consultation` (QuickActionTile anatomy per UI-STYLE.md, pt-PT "Iniciar consulta", gated `clinical_records:author`). Revisão Consulta stays reachable via its left-nav entry. Recon: `/consultation` already renders in `<AppShell>` (left nav present), so no wrapping change needed. Migration-free; dashboard e2e updated |

### Wave 04 OPEN-EXTERNAL carry-overs (not blockers — each closes via a one-line docs flip when the relay lands)
| ID | Item | Status | Closes when |
|----|------|--------|-------------|
| W4-10 | first-test-fire-e2e — real deployed-app fire (André's live Make scenario) | DONE (André confirmed receipt + `audio_filename` token exposure, relayed by Ivan 2026-07-08; #493 machine DoD) | André confirms receipt of the real fire **+ `audio_filename` token exposure**, relayed by Ivan. Owner-performed (no deployed-app credentials / interactive browser pick / real audio in the autonomous lane) |
| W4-05 | camera-to-ficha — Rodica real-phone camera-capture check | DONE (Rodica verified 2026-07-08, relayed by Ivan) | **Rodica real-phone verification 2026-07-08: photo in anexos, zero gallery persistence.** In-page captured photo landed in the ficha anexos and nothing was saved to her phone gallery — closes the external check. Build shipped #484 |

## Wave 04 candidates

> Added 2026-07-06 at Wave 03 close. UNORDERED, NOT committed scope — candidates for the Wave 04 planning pass, not loops yet. **HISTORICAL** — most became Wave 04 loops; retained as the planning trail. No lane/gate assignments until scoped. **All Wave 04 build and dry-run work is SYNTHETIC-DATA-ONLY; real-data go-live is a separately gated step (pre-real-data gates: separate-prod-project DECISIONS 2026-07-01; DPA CLOSED DECISIONS 2026-07-05).**

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

## Wave 05 Loop Queue

> Added 2026-07-08 (YELLOW authoring). **COMMITTED Wave 05 scope** - the 17 loops below are authored under `docs/loops/wave-05/`, scoped from the owner+Rodica QA pass and the Ficha Medica redesign decision (`docs/design/SPEC-ficha-medica.md`). This queue supersedes the "Wave 05 candidates" planning trail below for the items it covers. **Batch and run order here is authoritative.** Status `OPEN` = loop file authored + committed in the authoring PR, awaiting owner merge of that PR and dispatch (maps to the board's WRITTEN state; flips to READY when its gate clears, then IN-FLIGHT/DONE per the coordination protocol at the top of this file).
>
> Standing rules apply to every loop: pt-PT UI copy via i18n keys (both `strings.pt.json` + `strings.en.json`); plain hyphens, no em/en dashes; all build/verify work SYNTHETIC-DATA-ONLY (real-data go-live separately gated); `db-tests.yml`/`e2e.yml` = automatic owner hold, never self-merged; one migration in flight at a time; each loop opens ONE PR and HALTS for owner merge (no self-merge).
>
> **Batch 3 note:** the migrations are STRICTLY SEQUENTIAL (one in flight), each with **live-apply verification before DONE**. **Batch 4 note:** all five loops DEPEND ON `docs/design/SPEC-ficha-medica.md` (authoritative), which must merge before they build.
>
> **Two RECON MISMATCHES flagged at authoring (surface at merge, see QUESTIONS 2026-07-08):** W5-03 (Profissao is ALREADY present in the form + profile - likely already-shipped, Q-W5-6) and W5-12 (the `time_off` block model ALREADY exists at migration 0006 - migration 0034 likely UNNECESSARY, Q-W5-7). Neither is a hard-halt trigger (the named triggers were the opposite conditions); both are authored with the mismatch recorded in-loop and a recommended default in QUESTIONS.

### Batch 1 - migration-free, demo priority (run in numeric order; UI-lane, parallel-safe with one in-flight migration)
| ID | Loop | Status | Gate / note |
|----|------|--------|-------------|
| W5-01 | login-redesign-branding | DONE (#519, 2026-07-08) | migration-free; `/login` restyled to GlassPanel + enlarged brand lockup (additive `xl:96` BrandLockup step + optional `brandSize` prop per owner ruling Q-W5-8); no auth-logic change |
| W5-02 | search-sweep | DONE (#515, 2026-07-08) | migration-free; Equipa search added + list-surface sweep (record-creation patient Select -> async Combobox, marcacoes/review search); audit table in the PR |
| W5-03 | patient-profissao-ui | DONE (#510, closed-already-shipped, docs-only) | **Q-W5-6 resolved PRESENT (owner ruling + machine evidence):** prod deployment `dpl_AWKNbRzyTgvSGHVg31fXNgqFMwXL` builds `9f5c960` = exact main tip (zero drift); form field unconditional (patient-form.tsx 147-153, column 0022); profile row conditional-on-value by design (page.tsx:119), the likely QA source. Zero code |
| W5-04 | episodio-filter | DONE (#512, 2026-07-08) | migration-free; Episodio dropdown scoped to the selected patient + Sem episodio. Composed with W5-02: the merged `PatientEpisodeFields` uses the async Combobox patient picker and filters episodes off that selection; `listEpisodesForPicker` returns `{id,patientId,title}` |
| W5-05 | lote-date-edit | DONE (#511, 2026-07-08) | migration-free; per-row editable DATES in Agendar lote via reused `DatePicker`; reuses `batchSchedule` (no server-action change); DST-safe startsAt recompose |
| W5-06 | equipa-gerir-centering | DONE (#520, 2026-07-08) | migration-free; Gerir panel is now a centered modal on the reused `useAnimatedDialog` hook (no new packages/ui primitive); zero logic change (staff.ts untouched); UI-STYLE.md extended with the modal pattern |
| W5-07 | camera-anexos-buttons | DONE (#513, 2026-07-08) | migration-free; two primary actions (Tirar foto, Transferir) + Abrir; first-open error root-caused (getUserMedia async race under StrictMode double-mount leaking the camera -> NotReadableError -> false denied) and fixed with `startCameraCancellable` + regression tests; W4-05 zero-gallery preserved |
| W5-08 | patient-delete-password-gate | DONE (#514, 2026-07-08) | migration-free; NET-NEW `hardDeletePatient` with the W3-06 scrypt gate (shared delete-password secret) + clinical-records-linked refuse guard + audit + RLS isolation test; soft-delete stays the default |

### Batch 2 - migration-free (run in numeric order)
| ID | Loop | Status | Gate / note |
|----|------|--------|-------------|
| W5-09 | marcacoes-tab-edit | DONE (#525, 2026-07-09) | migration-free; per-row reschedule/estado/cancel on the profile Marcacoes tab, reusing Agenda actions; axes never collapsed; primary-only |
| W5-10 | documentos-upload | DONE (#524, 2026-07-08) | migration-free; upload on the Documentos tab reusing the attachments infra; HALT if a patient-document relation needs a schema change |

### Batch 3 - MIGRATIONS, strictly sequential (one in flight), live-apply verification before DONE
| ID | Loop | Status | Gate / note |
|----|------|--------|-------------|
| W5-11 | referral-source | DONE (#526, migration 0033 live-applied, 2026-07-09) | **migration 0033** (head is 0032): `patients.referral_source` nullable; "Como nos conheceu?" dropdown; genuine net-new column; live-apply before DONE; sequential (lands before W5-12) |
| W5-12 | therapist-blocks | DONE (#527, migration-FREE on time_off; 0034 NOT created, 2026-07-09) | **RECON MISMATCH (Q-W5-7): `time_off` already exists (migration 0006) and models both modes; migration 0034 likely UNNECESSARY.** Default = build migration-FREE on `time_off` (admin UI + integrate into `getTherapistAvailability`/lote exclusion; warn-not-cancel, Q-W5-4). A minimal 0034 only if the owner confirms a needed column. Relates to Q-V2W2-1 (blocked-time band). Migration disposition resolved BEFORE any migration |

### Batch 4 - Ficha Medica, per `docs/design/SPEC-ficha-medica.md` (authoritative; must merge first; run in numeric order)
| ID | Loop | Status | Gate / note |
|----|------|--------|-------------|
| W5-13 | ficha-unification | DONE (#528, 2026-07-09) | single Ficha Medica template; retire others from creation; existing records untouched; **compatibility test posts `template=osteopathy` + the twelve keys -> correct draft** (PRODUCT halt if a key cannot map); migration-free (seed + `form_templates`) |
| W5-14 | ficha-structure | DONE (#529, 2026-07-09) | SPEC sec 3-5: full field sequence, read-only patient header strip, auto creation timestamp, Problemas de Saude 4-col grid restructure (fix the orphaned-render bug), Outros rules; migration-free |
| W5-15 | mobilidade-component | DONE (#530, 2026-07-09) | SPEC 5.10-5.13: three-circle Mobilidade Activa(dot)/Passiva(star) widget + Limpar + Observacoes, Testes Neurologicos/Especiais, Diagnostico, Tratamento (keep Plano+Objectivos, Q-W5-2), Observacoes; migration-free |
| W5-16 | ficha-signature-consent | DONE (#531, 2026-07-09) | SPEC sec 7: canvas signature -> Documentos (attachments infra), Gerar PDF A4 + logo (RGPD), Consinto block with explicit check/X; all consent/RGPD wording PENDENTE-JP (Max drafts 2-3 variants, Q-W5-3); migration-free |
| W5-17 | revisao-consulta-flow | DONE (#532, closes core wave scope, 2026-07-09) | **closes the core wave scope:** Assumir opens the AI draft inside the Ficha Medica editor with the twelve AI-filled fields visible+editable; edit+complete+sign; `record_status` and `ai_review_state` stay separate; signed record in Registos clinicos; migration-free |

> **WAVE 05 CLOSED - 2026-07-09.** All 17 loops merged (W5-01..W5-17). One migration this wave: **0033** (referral_source, live-applied, verified; head 0033, mirror 34/34). **0034 NOT created** - W5-12 was migration-free on `time_off`. Ficha Medica unified on `osteopathy` v3 (identity ingestion mapping, zero external change). Consent wording still PENDENTE-JP (JP pick pending). See DECISIONS 2026-07-09 for the full close + carried owner items.

## Wave 05 Hotfix Loop Queue

> Added 2026-07-09 (YELLOW authoring). **Wave 05 Hotfix scope** - six residual items from the owner QA pass on the deployed app plus clinic-staff feedback, scoped as loops W5-18..W5-23 under `docs/loops/wave-05/`, authoritative design in `docs/design/SPEC-ficha-medica.md` **AMENDMENTS 2026-07-09** (rulings A/B/C/D/E). Status `OPEN` = loop file authored + committed in this authoring PR, awaiting owner merge + dispatch. Run order below is authoritative. Recon verdicts recorded at authoring (in each loop's Field 1): **W5-15 mobilidade EXISTS-AND-MOUNTED** (W5-20 is a conformance pass, not a build); **0031 contraindication flags are DEDICATED BOOLEAN COLUMNS** (W5-21 carries migration 0034); **template display name lives in `form_templates.title`** with zero hardcoded TSX (W5-23 is a live-DB seed re-upsert). Standing rules apply: pt-PT UI copy; SYNTHETIC-DATA-ONLY; one migration in flight; `db-tests.yml`/`e2e.yml` = automatic owner hold; never self-merge.

| ID | Loop | Status | Gate / note |
|----|------|--------|-------------|
| W5-18 | login-redesign-v2 (`docs/loops/wave-05/W5-18-login-redesign-v2.md`) | DONE | migration-free; rebuild the `/login` VISUAL layer to a split-screen brand + form (the shipped W5-01 is below standard); tagline "Gestao clinica, simplificada."; 44px inputs, focus rings, sage primary button states; verify app-shell logo large + crisp; ZERO auth-logic/route/field-name change; preserve/on-branch-update `auth.setup.ts` login helper |
| W5-19 | ficha-sequence-and-outros (`docs/loops/wave-05/W5-19-ficha-sequence-and-outros.md`) | DONE | migration-free; AMENDMENTS rulings B/C/D: remove the Data do Episodio input + wire the read-only created-at display, enforce the authoritative field sequence, rename+restructure Problemas de Saude -> "Outros" (grid + unlabeled free-text placeholder). Recon: order for fields 2-13 ALREADY matches; the two deltas (no-date, Outros) are the work. Twelve AI keys frozen; W5-13 compat stays green |
| W5-20 | mobilidade-delivery (`docs/loops/wave-05/W5-20-mobilidade-delivery.md`) | DONE | migration-free (default); AMENDMENTS ruling E. **Recon: EXISTS-AND-MOUNTED** at sequence position 10 - CONFORMANCE pass, not a build. Add reference spokes, min-44px toggle, "Inserir marcador" arm step, record-wide "Limpar marcadores", helper copy; prove place-and-persist + read-only. Keep the shipped per-circle persistence keying unless zero stored data + owner prefers the flat list |
| W5-21 | pacemaker-contraindication (`docs/loops/wave-05/W5-21-pacemaker-contraindication.md`) | DONE | **MIGRATION 0034 (recon-confirmed).** 0031 flags are DEDICATED BOOLEAN COLUMNS, so add `patients.contraindication_pacemaker`; add "Portador de pacemaker" to the new-patient + edit form, the profile, and the (non-blocking) NESA booking warning (`scheduling/nesa.ts` enum). Head is 0033; one migration in flight; fetch-and-fast-forward before live-apply; live-apply verify before DONE. NESA warning never blocks (unchanged). **LIVE-APPLY VERIFIED 2026-07-11 (PR #538 merged):** `drizzle-kit migrate` applied 0034 on the dev DB (fetch-and-ff first); `information_schema` shows `patients.contraindication_pacemaker` = boolean, NOT NULL, default false; drizzle applied-migration count = 35 (head 0034). |
| W5-22 | marcacao-to-patient-link (`docs/loops/wave-05/W5-22-marcacao-to-patient-link.md`) | DONE | migration-free, read-only navigation; add a "Ficha do paciente" button in the Agenda marcacao EDIT view -> `/patients/{patientId}`; second link when Paciente 2 (`patientTwoId`) is set. No data change. E2E asserts the button lands on the correct patient profile |
| W5-23 | ficha-rename-clinica (`docs/loops/wave-05/W5-23-ficha-rename-clinica.md`) | DONE | **LIVE-DB DATA (recon-confirmed).** Display name lives in `form_templates.title` (zero hardcoded TSX), so rename "Ficha Medica" -> "Ficha Clinica" via a seed edit to `osteopathy-v3.json` + upsert re-run against the dev DB (fetch-and-fast-forward first; paste before/after row). DISPLAY NAME ONLY - key `osteopathy` + `template=osteopathy` + the twelve AI keys FROZEN; W5-13 compat stays green; existing records keep their stored titles. **SEED VERIFIED 2026-07-11 (PR #540 merged):** the dev DB had NO osteopathy v3 row (deploy/seed pipeline had not applied it) - before: v1/v2 only. Scoped seed upsert INSERTED osteopathy v3 with `title.pt "Ficha Clínica"` / `title.en "Clinical Record"`; v1/v2 (referenced, immutable) left untouched. **Finding:** the full `seed:form-templates` loader was NOT run - a dry-run showed it would UPDATE the referenced v1/v2 (title+schema drift vs on-disk JSON) plus ficha_geral/nesa/physiotherapy; that rewrite is out of W5-23 scope and a rule-#5 concern - flagged for the owner, seed scoped to v3 only. |

> **RECON at authoring - note vs the brief's shorthand:** the brief refers to the frozen key as "osteopathy-v2"; the accurate active identity is key `osteopathy` **v3** (the shipped unified template, titled "Ficha Medica" today), with v2 immutable for records that reference it. The rename target (W5-23) and the field-sequence base (W5-19) both operate on v3. No scope change - recorded for accuracy (AMENDMENTS ruling A).

## Wave 05 candidates

> Added 2026-07-07 at Wave 04 close. UNORDERED, **candidates only — NOT committed scope**, no lane/gate/loop assignments until a Wave 05 planning pass scopes them. Standing rules still apply when any of these becomes a loop: pt-PT UI copy; all build/dry-run work SYNTHETIC-DATA-ONLY (real-data go-live separately gated); `db-tests.yml`/`e2e.yml` = automatic owner hold, never self-merged; one migration in flight at a time.

### Carried forward (not taken in Wave 04)
| Candidate | Origin | Gate / note |
|-----------|--------|-------------|
| SMS confirmation BUILD | DECISIONS 2026-07-06 (product calls) + SPEC-sms-confirmation | product calls made (single 24h reminder, no at-booking msg, per-patient staff-toggle opt-out reusing `patients.reminder_sms_enabled`); still GATED on the **Twilio new-vendor + EU-residency/DPA** decision (OPEN, QUESTIONS); JP picks the final pt-PT wording from **Max's drafted variants** |
| Finance KPI report scoping | DECISIONS 2026-07-02 (VAT: CIVA art. 9 exemption) | VAT gate cleared (gross=final); scope as its own loop; internal KPI only, not fatura-recibo |
| Fisiozero patient import build | BACKLOG Wave 03/04 candidates | mapping + reconciliation on dev SAMPLE data only; live import gated on the pre-real-data gates; collision-HALT policy on file (DECISIONS 2026-07-02) |
| Portal V2 build | BACKLOG Wave 03/04 candidates | GATED — pending JP's reaction to Max's mockups; no scope until provided |
| 30-day stub cleanup job | DECISIONS 2026-07-06 (visitor stub retention) | scheduled job cleans never-promoted stub patients after 30 days; preserves real/promoted patients and Max's real therapist accounts |
| Merge-patients function | Roadmap (STATE 2026-06-30) | `patients.merged_into_id` pointer exists; function is roadmap, deferred |
| CI db-gate hardening | QUESTIONS 2026-07-03 | touches `.github/workflows/db-tests.yml` → automatic OWNER HOLD, never self-merged; opens a PR and HALTS for owner merge |
| Preview DB isolation | QUESTIONS 2026-07-03 | future infra, part of the separate-prod-project work |
| Legacy doc-shelf consolidation loop | QUESTIONS 2026-07-03 | migrate still-open legacy `docs/QUESTIONS.md` + `docs/DECISIONS.md` items onto the canonical `docs/design/` shelf, leave pointer stubs; its own docs loop |
| Dangling-branch pruning pass | BACKLOG Wave 03 candidates | sweep merged/abandoned feature + docs branches and their worktrees from Waves 01–04; housekeeping only |

### New from Wave 04
| Candidate | Origin | Gate / note |
|-----------|--------|-------------|
| Cross-browser E2E infra hardening | GREEN closing report 2026-07-07 | the **non-required** Cross-browser E2E lane is chronically red from (a) a webkit/Next "Failed to fetch RSC payload" flake across unrelated specs and (b) a transient Playwright browser-install failure (`packages.microsoft.com` apt InRelease invalid). Pin browser deps / cache to make it reliable. Non-blocking (lane is not required) |
| Agenda: render a secondary-therapist appointment under BOTH therapist columns | DECISIONS 2026-07-06/07 (secondary participants) | explicitly deferred out of W4-19 — renders under the PRIMARY column only + `+1` badge today. Dual-column rendering is the recorded follow-up; scope later if the clinic wants it. (Related: edit-secondary via `updateAppointment` — W4-19 capture is create-only by design) |
| Dev-tenant locked-residue revisit | DECISIONS 2026-07-07 (W4-11 Option B) | the 49 locked/signed synthetic clinical_records + 31 pinned patients + 5 deactivated fixtures left by Option B. **Tied to the pre-real-data gate (prod Supabase project split), NOT a standalone wave item** — a one-time guarded op only if/when the owner rules to defeat rule-4/rule-6 in a controlled window |
