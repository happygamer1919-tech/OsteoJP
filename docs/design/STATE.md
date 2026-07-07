# STATE

Observed-state log of the codebase as audited at specific points in time. Factual
record of schema, write paths, and existing surfaces. Append-only, dated sections.
No recommendations here. Design decisions go in DECISIONS.md; open questions go in
QUESTIONS.md.

## 2026-07-07 - Wave 04 close audit

Wave 04 executed and **CLOSED**. All 19 loops (W4-01…W4-19) plus the owner addition W4-12
resolved: DONE, DONE-partial, or AWAITING-EXTERNAL (two non-blocking external relays).
Read-only docs lane against `origin/main` (`69d2710`), branch `w4-closeout`; no schema,
migration, or app code changed by this lane. Suite counts and cleanup evidence carried from
the GREEN closing-batch report (2026-07-07) and the merged tree; not re-run in this docs lane.

### Loops + PRs (all merged, gh-verified 2026-07-07)
| Loop | PR | What landed |
|------|----|-------------|
| W4-01 equipa-team-upgrade | #480 | Equipa primary-service dropdown lists all active services, INSERT on zero-mapping (fixes "Sem serviços"), delete+insert re-designation (no UPDATE, 0023 no-grant); per-therapist Horários entry point. Password-gated therapist delete unchanged |
| W4-02 24h-picker-sweep | #481 | every time-INPUT widget → 24h `TimeField` (`:00/:15/:30/:45`), custom AM/PM columns removed; input-construction grep pass + value round-trip |
| W4-03 nova-marcacao-auto-select | #495 | closed **resolved-unreproducible** (docs-only, owner QA 2026-07-07); Serviço auto-select fires correctly; duplicate Fisioterapia rows = owner UI housekeeping. Zero code |
| W4-04 spec-ai-recording | #483 | authored `docs/design/SPEC-ai-recording.md` — full M1 webhook contract (`audio_url` presigned GET 1h, `audio_filename`, primary `patient_id`/`doctor_id`, timestamps, `x-make-apikey`) |
| W4-05 camera-to-ficha | #484 | in-page `getUserMedia` capture → synthetic patient's ficha anexos via signed URL (no device-gallery persistence). Rodica real-phone check is an external relay (open, non-blocking) |
| W4-06 quick-create-stub-consent | #489 | start-consultation stub quick-create (name req/phone opt, 0029 numbering) + server-enforced consent gate (actor+timestamp) |
| W4-07 recording-ui | #490 | MediaRecorder webm/opus 32 kbps mono, Chrome-only + pt-PT block, machine-stamped `consultation_started_at`/`ended_at` |
| W4-08 presigned-put-flow | #491 | SigV4 signer + direct-to-S3 PUT (scoped key, `osteojp-audio-intake` eu-central-1), never via Vercel; mock-verified in CI, real 200 is a deploy check |
| W4-09 post-upload-webhook | #492 | presigned GET (1h) + M1 webhook fire with `x-make-apikey` (env/vault); contract fields present, redacted payload proof |
| W4-10 first-test-fire-e2e | #493 | machine DoD merged (draft lands `pending_review` via HMAC ingestion) — **AWAITING-EXTERNAL**, closes on André's receipt + `audio_filename` token relay |
| W4-11 scripted-cleanup | #502 | **DONE-partial (Option B, owner ruling)** — guarded synthetic-data purge without defeating the immutability trigger (rule 4) or audit_log append-only (rule 6); residue recorded |
| W4-12 location-auto-select | #486 | booking Terapeuta → Localização auto-fill from a single active location (migration-free), always editable; three drawer paths inherit it |
| W4-13 equipa-dashboard-redesign | #496 | **DESIGN ANCHOR** — Equipa dashboard redesign + authored `docs/design/UI-STYLE.md`; full-width invite + 4 KPI cards + Estado badges + row-actions drawer |
| W4-14 horarios-redesign | #497 | Horários per-therapist cards + `Editar horário` top-layer modal (weekday toggles, 24h TimeField, per-day location); single Guardar via W2-12 paths; in-modal delete = archive, no password |
| W4-15 servicos-delete-and-redesign | #498 | Serviços reference-guarded delete (no password): zero-ref hard-delete, referenced = archive-only; restyle. Reference set = 4 relations (analytics_events found beyond the 3 named) |
| W4-16 pacientes-redesign | #502 | **DONE (docs-only close)** — already shipped in a prior V2-patients wave (structured list table + tabbed identity dashboard; anexos on the ficha per W4-05). Keep tabbed layout. Zero code |
| W4-17 agenda-header-redesign | #499 | Agenda structured range chip + live appointment count for the visible range (matches the grid's day-in-range logic) |
| W4-18 inicio-redesign | #500 | Início: 6th tile `Revisão Consulta` (gated on `clinical_records:review`), full-width `Resumo semanal`, new `Próximas marcações` card (reuses fetched appts) |
| W4-19 secondary-participants | #501 | secondary participants + **migration 0032** (two nullable FK cols); primary-only semantics; tenant-match enforced app-layer; drawer optional section, clone copies as-is, agenda `+1` badge; db-gated RLS test |

### Schema deltas this wave
- **0032 `secondary_participants`** (the single pre-approved Wave 04 migration, fired by W4-19).
  Two **nullable** FK columns on `appointments`: **`patient_2_id`** → `patients(id)` and
  **`practitioner_2_id`** → `users(id)`, both `ON DELETE NO ACTION` (matching the primary FKs).
  NULL = every pre-0032 row (no backfill). **Primary-only semantics:** availability, conflict
  detection, Serviço/Localização auto-selects, `analytics_events` money attribution, the
  AI-recording pair + idempotency key, and the Estado/lifecycle axes ALL stay on the primary
  pair; the secondary is **linked DISPLAY data** only. Tenant-match enforced at the app layer
  (`createAppointment` resolves any provided secondary id under the caller's RLS scope; a
  cross-tenant id → zero rows → `validation` error). **RLS/isolation covered** by the new
  db-gated `secondary-participants-rls.test.ts`. No other schema change this wave (all other
  loops migration-free).

### Surface deltas this wave
- **Consultation recording flow** — start-consultation stub quick-create + server-enforced
  consent gate (W4-06); MediaRecorder webm/opus 32 kbps mono, Chrome-only (W4-07); presigned
  PUT direct-to-S3 (W4-08); post-upload M1 webhook fire with `x-make-apikey` (W4-09). First
  machine fire lands `pending_review` (W4-10); the real deployed-app fire is owner-performed
  (AWAITING-EXTERNAL).
- **Camera-to-ficha** — in-page `getUserMedia` capture into a synthetic patient's ficha anexos,
  signed-URL only, no device-gallery persistence (W4-05).
- **UI-STYLE.md design language LIVE** across **Equipa, Horários, Serviços, Agenda, Início**
  (W4-13 anchor → W4-14/15/17/18 conform): card/table anatomy, spacing scale, Estado badges,
  button hierarchy, toolbar layout, Tailwind v4 tokens. Refinement of the existing shell, not a
  rebrand; brand tokens unchanged.
- **Passwordless reference-guarded deletes** — service delete (W4-15) and Horários row delete
  (W4-14) require no password (both surfaces already sit behind the admin gate); zero-reference
  hard-delete, referenced = archive-only. Distinct from the password-gated appointment (W3-06)
  and therapist (W4-01) deletes, which are unchanged.
- **Booking carries optional `Paciente 2` / `Terapeuta 2`** — de-emphasized create-only section
  in the booking drawer; agenda card shows a compact `+1` badge; `cloneAppointment` copies the
  secondary pair as-is (W4-19). Agenda renders under the PRIMARY therapist column only
  (dual-column is a recorded follow-up).

### Migration bookkeeping (repo-verified this audit)
- Migration head: **0032** (`0032_secondary_participants`). `packages/db/migrations/` holds **33**
  `.sql` files (0000–0032); journal (`meta/_journal.json`) **33 entries**.
- Supabase mirror parity: `supabase/migrations/` holds **33** `.sql` files — 1:1 with
  `packages/db/migrations/`, **mirror in parity (33/33)**. Corroborated by the CI `sync` check
  and `db:sync-supabase:check` green.
- Tooling note (DECISIONS 2026-07-07): drizzle snapshots are frozen at 0014; migrations 0015+ are
  hand-authored SQL + manual journal entry (no snapshot). `drizzle-kit generate` must not be used
  (it would spuriously recreate the schema); 0032 was hand-authored to that pattern.

### Test suite (post-Wave-04, reported by the GREEN closing report; not re-run in this docs lane)
- **web: 816 passed** (5 skipped, 1 todo) · **ui: 42** · **@osteojp/db: 56 local + DB-gated set**
  (now incl. `secondary-participants-rls.test.ts`) · **admin: 10** · **api: 136**.
- lint 0 errors, typecheck 9/9, web build green on every PR. Local full `pnpm build` fails only on
  the pre-existing `apps/portal` `/auth/activate` env gap (reproducible on main, green in CI/Vercel;
  never touched this wave).

### Dev database fingerprint — post-W4-11 Option-B cleanup (2026-07-07; live counts remain authority)
Recorded from the W4-11 cleanup evidence (DECISIONS 2026-07-07), guarded and tenant-scoped to the
single dev tenant `3a2d0711-…`; not independently re-queried in this docs lane.

| table | count | note |
|-------|-------|------|
| `patients` | **31** | pinned residue — each holds ≥1 `locked`/`signed` synthetic clinical_record; from 105 pre-cleanup |
| `availability_templates` (active) | **1** | the single real preserved row; 64 fixture rows deleted (65 → 1) |
| `clinical_records` (locked/signed) | **49** | synthetic, immutable by the rule-4 trigger — left intact by design (Option B) |
| `users` (real) | **14** | preserved (real accounts + staff/QA), count-stable through cleanup |
| fixture users | **5** | deactivated (`is_active=false`), not deleted (pinned by rule-6 audit rows) |
| `locations` | **3** | preserved, count-stable |
| `services` | **11** | preserved, count-stable |

- The **49 locked synthetic clinical_records + their 31 pinned patients + 5 deactivated fixtures**
  are **dev-only residue by construction** — deleting them would require defeating the immutability
  trigger (rule 4) or mutating `audit_log` (rule 6), which the owner ruling forbids. **Revisit at
  the pre-real-data gate** when the prod Supabase project splits (BACKLOG). All dev data remains
  SYNTHETIC; the pre-real-data patient gates (DECISIONS 2026-07-01) stand unchanged.
- Live counts are the authority; this is a point-in-time read.

### Wave 04 process record
- **Standing GREEN runner** executed the wave; the closing batch (W4-03, W4-11, W4-13→W4-19)
  self-merged on the four-leg gate (DoD pasted · 3 required checks green · zero workflow-file
  changes · branch current). One escalated owner ruling this wave (**W4-11 A/B/C** → Option B) and
  one surfaced already-satisfied loop (**W4-16** → docs-only close), both landed via #502.
- **Single in-flight migration discipline held:** only W4-19 was pre-approved to author a migration
  (0032); it fired and landed, head 0032, parity 33/33. No `db-tests.yml`/`e2e.yml` edits.
- **Two non-blocking external relays remain open** (carry-overs, not wave blockers): **W4-10**
  André confirms receipt of the real fire + `audio_filename` token exposure; **W4-05** Rodica
  real-phone camera-capture check. Each closes via a one-line docs flip when the relay lands.

## 2026-07-06 - Wave 03 close audit

Wave 03 executed and CLOSED. All 10 loops merged; zero open PRs from the wave (gh-verified).
Read-only docs lane against `origin/main` (`61020c7`); no schema, migration, or app code changed.

### Loops + PRs (all merged 2026-07-06, gh-verified)
| Loop | PR | What landed |
|------|----|-------------|
| W3-01 estado-removal-fix | #468 | server-side creation invariant — create + batch hardcode `status=scheduled`/`confirmation_state=pending`, never from payload; axes stay orthogonal (DECISIONS 2026-07-01). UI already hid the Estado selector on create (W2-02) |
| W3-02 batch-failure-dialog-focus | #469 | failure dialog was an inert in-flow overlay behind the modal drawer; lifted to its own `showModal` `<dialog>` in the top layer via shared `useAnimatedDialog` — focused, isolated from the "Descartar alterações?" discard guard, edit-and-rebook works |
| W3-03 booking-form-reorder | #470 | Terapeuta first, Serviço below + auto-fill from the therapist's mapped service (editable override honored); reads `therapist_services` (0023) oldest-first; falls back cleanly if W3-04 primary not yet present |
| W3-04 primary-service-admin | #471 | per-therapist primary service = earliest-created `therapist_services` mapping (no schema change, no UPDATE — respects the 0023 no-grant SELECT/INSERT/DELETE); re-designation = delete+insert; admin "Serviço principal" on `/admin/staff`; W3-03 consumes it unchanged |
| W3-05 tenant-settings-home | #472 | MIGRATION-FREE verdict: per-tenant secrets home is `tenants.settings.secrets` (jsonb, RLS `tenants_tenant_isolation`, not client-exposed); helper `lib/admin/tenant-secret.ts`. Migration head stays 0031. Unblocks W3-06 |
| W3-06 password-gated-appointment-delete | #473 | appointment hard-delete behind a scrypt-hashed tenant password (W3-05 home, admin-only `settings:manage`); refuses when linked notes/records/invoices exist; child-first `RETURNING` delete + PII-free audit snapshot; admin password-change in Administração (initial `1234`) |
| W3-07 location-delete-when-unreferenced | #474 | delete enabled only for zero-appointment locations (else archive-only + disabled control + tooltip); FKs handled non-destructively; archived stays hidden from selection dropdowns (W2-02 behavior preserved) |
| W3-08 agenda-6day-24h | #475 | agenda week view = 6 days Mon–Sat (`WEEK_DAYS` 5→6, propagates to grid + fetch range); 24h confirmed app-wide (central `formatTimeOfDay` + pt-PT `Intl` + native pickers), zero meridiem hits |
| W3-09 working-hours-real-schedule | #476 | guarded idempotent live-DB data op set the dev therapists to Mon–Fri 08:00–20:00 + Sat 09:00–13:00 (primary location); upsert+archive, no delete; **34 archived, 30 active inserted**, zero-delta re-run |
| W3-10 close-superseded-prs | #477 | gh-only housekeeping — confirmed #440→#456, #439→#457, #446→#458 all merged and each already carries its superseded-by comment; no duplicate, no revert/reopen (docs-only board flip) |

### Two on-branch CI-red fixes (caught + fixed on-branch before merge, per the wave chain report)
- **W3-02 (#469) — Playwright hidden-dialog assertion.** The e2e assertion targeted the failure dialog while it was still the inert in-flow overlay (hidden behind the modal drawer, not in the top layer). Fixed on-branch once the dialog was promoted to a `showModal` `<dialog>`; the assertion then resolves against the visible top-layer dialog.
- **W3-08 (#475) — pt-PT Sábado weekday rendering.** The 6-day week extension surfaced a weekday-label render assertion mismatch on the Saturday column (pt-PT `Sábado`); fixed on-branch so the 6th column renders and asserts correctly.
Both were inner-test failures fixed on-branch; both merged green. No `db-tests.yml`/`e2e.yml` workflow files were touched.

### Test suite (post-Wave-03, reported by the wave chain report; not re-run in this read-only docs lane)
- **web suite: 685 passing.**
- **db suite: 56 local + 255 DB-gated passing.**

### Migration bookkeeping (repo-verified this audit)
- Migration head: **0031** (`0031_nesa_contraindications`) — UNCHANGED across Wave 03 (every loop migration-free; W3-05 recon confirmed a migration-free tenant-settings home). `packages/db/migrations/` holds **32** `.sql` files (0000–0031); journal (`meta/_journal.json`) **32 entries** (idx 0–31).
- Supabase mirror parity: `supabase/migrations/` holds **32** `.sql` files — 1:1 with `packages/db/migrations/`, **mirror in parity (32/32)**.
- Live corroboration: `drizzle.__drizzle_migrations` holds **32** apply-records on the dev DB (read-only fingerprint below), consistent with head 0031.

### Dev database fingerprint — LIVE-VERIFIED 2026-07-06 (read-only, guarded; live counts remain authority)
Queried read-only inside a `SET TRANSACTION READ ONLY` transaction against the single dev Supabase project; counts only, no credentials printed, nothing written. Single dev tenant.

| table | count | vs 2026-07-02 baseline | note |
|-------|-------|------------------------|------|
| `patients` | **105** | 105 (unchanged) | all synthetic; zero real patient data |
| `users` | **23** | 12 (+11) | Max's real-therapist entry via admin UI (staff data) + QA/staff accounts — drift EXPECTED |
| `appointments` | **287** | 274 (+13) | external QA activity on the shared dev project — drift external and expected |
| `availability_templates` (total) | **64** | 34 (+30) | W3-09 archived 34 + inserted 30 active = 64; matches the loop op exactly |
| `availability_templates` (active) | **30** | — | exactly the 30 active W3-09 inserted (34 archived) |
| `patient_note_revisions` | **11** | 10 (+1) | one QA-created note revision — drift expected |
| `roles` | **4** | 4 (unchanged) | stable |

- The `availability_templates` split (34 archived / 30 active) reconciles W3-09's data op precisely. `users`/`availability_templates` drift is EXPECTED and NORMAL: Max is entering the clinic's REAL therapists through the admin UI concurrently with this close-out. This is STAFF data (users + availability), NOT patient data — all patient data remains synthetic, and the pre-real-data gates (separate-prod-project, DECISIONS 2026-07-01) still stand for real patient records.
- Live counts are the authority; these fingerprints are a point-in-time read that will keep drifting while Max's therapist entry is in progress.

### Wave 03 process record
- **Zero halts, zero escalations** across all 10 loops. The **halt-desk mailbox pattern** (GREEN↔CYAN filesystem mailbox, `~/osteojp-mailbox/`, ratified at Wave 02 close) ran its SECOND wave with zero escalations needed — no owner-confirmable halt arose during execution. The mechanism stands ready but was not exercised this wave.
- **Single in-flight migration discipline held:** only W3-05 was authorized to author a migration, and recon returned a migration-free verdict, so head stayed 0031. No workflow-file (`db-tests.yml`/`e2e.yml`) edits.
- **Real therapist entry IN PROGRESS (Max, admin UI):** the clinic's real therapist accounts are being entered through the Administração staff surface concurrently with this close-out. This is staff/operational data (users + `availability_templates`), explicitly NOT patient data; it does not touch the pre-real-data patient gates.

## 2026-07-03 - Wave 02 close audit

Wave 02 executed and CLOSED. All 13 loops merged; zero open PRs from the wave (gh-verified).

### Migration bookkeeping (repo-verified this audit)
- Migration head: **0031** (`0031_nesa_contraindications`). `packages/db/migrations/` holds **32** `.sql` files (0000–0031).
- Journal (`meta/_journal.json`): **32 entries**, idx `0`–`31`.
- Supabase mirror parity: `supabase/migrations/` holds **32** `.sql` files — 1:1 with `packages/db/migrations/`, mirror in parity. `0030_patient_note_revisions` and `0031_nesa_contraindications` present in both.
- Wave 02 migrations: **0030** `patient_note_revisions` (append-only patient-note history, #452) and **0031** NESA contraindication flag columns on `patients`/`services` (#453).

### Test suite (post-Wave-02)
- **db suite: 303 passing** (corroborated by the W2-07 close note; +3 vs the 300 recorded at 0030/#452 for the 0031 column tests).
- **web suite: 647 passing** (reported post-W2 total; not re-run in this read-only docs lane).

### Dev database fingerprint — as of wave-02 close, 2026-07-03 (live counts remain authority)
Not re-queried in this read-only docs lane; last-known from wave execution evidence:
- `patients` = **105**, `users` = **12**, `appointments` = **275** (post W2-03 location repoint; the 2 repointed appointments moved between location ids, TOTAL unchanged), `availability_templates` = **34**.
- `locations`: exactly **2 active** rows, on the FK-rich FIXTURE ids, named **`OsteoJP (LV)`** and **`OsteoJP (CB)`**; **3 archived** (the Montemor fixture + the 2 former in-app manual rows). Zero deletes (row count 5→5), per W2-03 / #455 (owner ruling Option A, DECISIONS 2026-07-03).
- `patient_note_revisions` = **10** (0030 backfill: one revision per patient with a non-empty `patients.notes`, author NULL/system).
- Migration head **0031**.

### Wave 02 process record
- **Single-executor GREEN chain**: per the 2026-07-03 ruling, Max's UI lane was closed for the wave; all 13 loops (migration, UI, PURPLE, docs) ran from the GREEN runner. 13/13 merged: W2-01 #452, W2-07 #453, W2-02 #454, W2-03 #455, W2-04 #456, W2-05 #457, W2-06 #458, W2-08 #460, W2-09 #461, W2-10 #462, W2-11 #463, W2-12 #464, W2-13 #465.
- **One escalated halt**: W2-03 location cleanup found the live `locations` state inverted vs the loop's assumption (fixtures archived + holding history, manual rows active); escalated and resolved by owner ruling **Option A** (a bounded one-time repoint of 2 appointments onto the LV fixture id), DECISIONS 2026-07-03.
- **Four on-branch CI fixes**: inner-test failures caught and fixed on-branch before merge during the wave (the db-gate soft-pass defect that let one through is logged as an owner-hold QUESTIONS ticket, 2026-07-03).
- **Halt-desk mailbox pattern (RATIFIED operating pattern)**: the escalated W2-03 halt used a GREEN↔CYAN filesystem mailbox (`~/osteojp-mailbox/`, halt + `ESCALATED` answer archived under `archive/`, ref `halt-20260703T154745Z-W2-03`). First use this wave; ratified as the standing mechanism for a runner to escalate an owner-confirmable halt without stalling the chain. (Process note also on the W2-03 DECISIONS entry.)

### Open questions closed by Wave 02
- **Notas Rápidas write destination** (open since Wave 01 — STATE 2026-06-30 audit finding #1 "Notas rapidas persistence"): **CLOSED by W2-11 (#463)**. Patient notes now flow through the append-only `patient_note_revisions` relation; the dashboard Notas Rápidas card writes a revision for a selected patient, and the notes UI no longer reads or writes `patients.notes` (the column is retained in the DB, untouched).

## 2026-07-02 - Wave 01 close audit (recon-verified through 0028 + clone)

Read-only audit against `main` at `origin/main` (`45f68e4`). No schema changed, no
migration run, no code changed. This section is the current living ground truth; the
`2026-06-30` section below is the prior snapshot (migrations `0000`–`0021`) and is
retained as history, not superseded in place. Everything here is verified against the
merged tree (`packages/db/src/schema.ts`, `packages/db/migrations/`,
`apps/web/lib/scheduling/`), not copied from plans.

### Migration spine 0022–0028 (all merged)

| # | Object | What actually landed | PR |
|---|---|---|---|
| 0022 | `patients.profession`, `patients.region` | Two nullable `text` columns added (`ADD COLUMN IF NOT EXISTS`). `city` NOT re-added (already existed); street `address` NOT dropped (deferred); no `patient_notes` relation created. No RLS/grant change — table-level grants cover the new columns; patient-role column UPDATE grant deliberately excludes both (staff data). | #382 |
| 0023 | `therapist_services` table | Join table `(id, tenant_id, therapist_user_id → users.id, service_id → services.id, created_at)`. Unique `(tenant_id, therapist_user_id, service_id)`; indexes on `(tenant_id)` and `(tenant_id, service_id)`. NO-GRANT append pattern (admin add/remove; revoked verbs throw 42501). | #398 |
| 0024 | `appointments.confirmation_*` axis | Enum `appointment_confirmation_state (pending, confirmed, declined)`. Columns: `confirmation_state` NOT NULL default `pending`, `confirmation_received_at timestamptz` null, `confirmation_channel text` null (free text, not enum). ORTHOGONAL to `status` — never merged. | #403 |
| 0025 | `analytics_events` table | Greenfield append-only KPI/event feed, distinct from `audit_log`. `event_type text` (not enum); KPI dimensions promoted to real indexed columns (`therapist_user_id, patient_id, service_id, location_id, actor_user_id`); `amount_cents_gross integer` (GROSS cents, VAT at report time) + `currency char(3)`; `payload jsonb` default `{}`; `occurred_at` NOT NULL. Also carries the per-appointment status-transition history (`appointment_status_changed` payload holds from_status/to_status) — no standalone status-transition table. POLICY append pattern (SELECT+INSERT only, keeps full grant). Indexes: `(tenant,occurred_at)`, `(tenant,event_type)`, `(tenant,therapist_user_id)`. | #404 |
| 0026 | `appointment_notes` table | Per-visit append-only notes relation `(id, tenant_id, appointment_id → appointments.id, patient_id → patients.id, episode_id → clinical_episodes.id null, author_user_id → users.id, body text, created_at)`. Indexes on tenant, appointment, `(tenant,patient)`, episode. Gated completion is a SOFT WARNING (JP ruling): a completed appointment MAY have no note; `note_present` is recorded on the completion event, not blocked. | #415 |
| 0027 | `appointments.booking_group_id` | Bare `uuid` (no FK), nullable — a shared id relating appointments booked together (two therapists / one patient / one flow). NULL = standalone (every pre-0027 row). Partial index `(tenant, booking_group_id) WHERE booking_group_id IS NOT NULL`. Creation atomicity is app-layer. | #416 |
| 0028 | `appointments.batch_id` | Bare `uuid` (no FK), nullable — a shared id linking appointments created by ONE batch-engine run. NULL = not batch-created. Partial index `(tenant, batch_id) WHERE batch_id IS NOT NULL`. Distinct from `recurrence_parent_id` (which needs a bookable parent). | #417 |

`appointments` now carries both orthogonal axes plus both grouping ids: `status`
(scheduled/confirmed/completed/cancelled/no_show), `confirmation_state`
(pending/confirmed/declined), `booking_group_id`, `batch_id`, alongside the pre-existing
`recurrence_rule`/`recurrence_parent_id`, `room`, and inline `notes`.

### Scheduling code (merged, verified in `apps/web/lib/scheduling/`)

- **`getTherapistAvailability(ctx, query)`** (`day-availability.ts:72`, migration-free, #396):
  read-only, tenant-scoped via `runScoped`. Returns `DayAvailability[]` = per-day
  `booked[]`/`free[]` from `availability_templates` minus booked appointment intervals.
  `cancelled`/`no_show` excluded from booked. Consumed by the batch engine and the UI.
- **`batchSchedule(ctx, input)`** (`batch.ts:52`, engine on 0028): expands a recurrence to
  slots, checks each against `getTherapistAvailability`, books the free ones under one
  `batch_id`, returns `{ batchId, requested, booked[], failures[] }` with structured
  per-slot failures (date, hh:mm). Partial success is expected, not an error. Pure slot
  math isolated in `batch-core.ts`.
- **`cloneAppointment(sourceId, startsAt)`** (`actions.ts:312`, migration-free, #419):
  reads the source INSIDE the tenant-scoped tx (RLS confines to caller's tenant; a
  cross-tenant/missing id → `not_found`, nothing inserted). Pure mapping in `clone-core.ts`
  `buildClonedAppointment`. COPIES patient/practitioner/service/location + duration
  (`ends_at - starts_at` re-applied to the new start); resets lifecycle (`status=scheduled`,
  `confirmation_state=pending`); sets `tenant_id`/`created_by` from JWT; NULLs everything a
  clone must not inherit (confirmation receipt/channel, recurrence, `booking_group_id`,
  `batch_id`, `room`, inline `notes`). The `appointment_notes` relation is never written.
  NO availability enforcement (clinic may override; UI shows availability). Matches its loop
  DoD exactly — no contradiction found.

### Migration bookkeeping (recon-verified)

- Migration head: **0028** (`0028_batch_scheduling`). `packages/db/migrations/` holds 29
  numbered `.sql` files (`0000`–`0028`).
- Journal (`meta/_journal.json`): **29 entries**, idx `0`–`28`, tags `0000_empty_runaways`
  … `0028_batch_scheduling`.
- Supabase mirror parity: `supabase/migrations/` holds **29** `.sql` files — 1:1 with
  `packages/db/migrations/`. In parity.
- Anomaly (benign, dev DB only): the dev `__drizzle_migrations` tracking table holds **28**
  apply-records — orphan re-hashes from dev iteration (a migration re-applied under an
  edited hash during development). Irrelevant on any fresh apply, which replays the 29
  committed journal entries cleanly. NOTE: the wave-close dispatch described this as "28 vs
  26 journal entries"; the committed journal in fact holds 29 entries (0000–0028), so the
  tracking-table delta is a dev-DB artifact, not a journal shortfall. Recording the
  committed count as ground truth.

### Dev database fingerprint (reported by the wave-close dispatch)

Not independently re-queried in this read-only docs lane (no DB credentials used here);
recorded as the operator-provided corrected fingerprint at wave close:

- `patients` = 50, `appointments` = 272, `availability_templates` = 34, `roles` = 4
  (original random UUIDs).
- Seed users `USR_1..5` present under their fixture ids (`de000004-*`), with `role_id`
  FKs resolved by `(tenant_id, slug)` — the #414 fix, not by the `ROLE_*` fixture ids.
- Migration head 0028; mirror in parity (29 files).
- See QUESTIONS.md (2026-07-02) for a latent same-class FK risk on the `users` seed that
  the #414 fix did NOT extend to the downstream `-dev` seeders.

### Dev database fingerprint — LIVE-VERIFIED correction (2026-07-02, post-0029 + FA-1)

Supersedes the "reported by the wave-close dispatch" block above (which was operator-provided
and not re-queried). These are the live values after the 0029 patient-number migration and the
FA-1 users-seed fix ran, Max-confirmed 2026-07-02:

- `patients` = **105** — 50 seed fixtures + **55 QA-created test patients** (created through the
  app during UI QA). All synthetic; zero real patient data.
- `users` = **12** — 5 seed fixtures (`USR_1..5`) + **7 staff / QA accounts**.
- `appointments` = 274, `availability_templates` = 34, `clinical_episodes` = 46,
  `clinical_records` = 78, `roles` = 4.
  - `appointments` 272 → 274 (2026-07-03): +2 drift observed live during the FT-1 / PR #444
    zero-delta seed runs (the seed itself changed nothing; the delta is external QA activity on
    the shared dev project). Drift is external and expected; live counts remain the authority.
- Migration head **0029**. `patients.patient_number` backfilled **contiguous 1..105** per tenant
  (single dev tenant), unique per `(tenant_id, patient_number)`.
- FA-1 landed: seed user FKs now resolve by `(tenant_id, email)` via
  `packages/db/seed/dev-users.ts` (`resolveDevUsers`); no downstream seeder consumes a hardcoded
  `USR_*` id as an FK. The latent risk noted above is closed.

**Premise correction (dated):** earlier fingerprint notes framed the dev DB as fixture-only
("50 patients", "5 users"). That premise is now corrected: the shared dev Supabase project also
carries **staff accounts and QA-created test patients** generated during UI QA. This does NOT
affect the pre-real-data gates (DECISIONS.md 2026-07-01): all dev data remains SYNTHETIC — no
Fisiozero export has been imported, so the separate-prod-project gate before real patient data
stands unchanged. The counts above are the working baseline for future recon; when a seeder or
test asserts "50 patients", read it as the fixture floor, not the live total.

## 2026-07-03 - Wave 01 close-out: lane status + seed:dev env preload

### seed:dev env preload (PR #444, merged 2026-07-03)
- The `seed:dev` chain now auto-loads `packages/db/.env` via Node's `process.loadEnvFile` (no new
  dependency), so `DATABASE_URL` is available without manually sourcing the env. `SEED_DEV_CONFIRM`
  stays SHELL-ONLY and is captured BEFORE the preload; `.env` is asserted not to define it, so the
  opt-in guard is not weakened. The prior manual-sourcing caveat (tracked as QUESTIONS FT-1) is
  RETIRED — the run is now `SEED_DEV_CONFIRM=<ref> pnpm --filter @osteojp/db seed:dev`.

### Max UI-consumption lane status (Wave 01)
- Rows 1–6 MERGED: #383 / #384 / #385, #435 + #393, #442, #441, #445.
- Rows 7–9 were halted, now unblocked/assigned per the 2026-07-03 rulings:
  - Row 7 (fichas-as-tab) UNBLOCKED by DECISIONS 2026-07-03 "Fichas Clínicas placement"; UI lane,
    existing PR #446.
  - Row 8 (no-note indicator) SPLIT: the missing `note_present` capture is a PURPLE backend build
    item first (migration-free, in `updateAppointment`'s completion branch — QUESTIONS Q-ROW8-1
    resolution); Max's UI indicator (#440) lands after it.
  - Row 9 (batch failure pop-up) UNBLOCKED by DECISIONS 2026-07-03 "Batch scheduling is
    partial-success by design"; UI lane, existing PR #439.
- Bodychart originals owed item CLEARED (Max self-served via #413, verified on prod).

### Max side work (2026-07-02, outside the row lane)
- Vercel Preview env fix on `osteojp-platform`: preview deployments now carry DB env vars and share
  the single Supabase project with the deployed app (preview DB isolation tracked as a new
  QUESTIONS ticket, 2026-07-03; reinforces the separate-prod-project pre-real-data gate).
- Prod form-template label re-seed (updated = 6, idempotent).
- QA fixes: #437 (conflict-banner bypass), #438 (Marcações date-range picker), #421 / #425
  (section-nav overflow).

## 2026-06-30 - Wave 01 audit findings

Read-only audit against `main` (commit at `origin/main`). No schema changed, no
migration run. File paths are repo-relative. Migrations inspected: `0000`–`0021`
(the wave brief said `0000`–`0019`; current tree extends to `0021`).

### 1. Notas rapidas persistence

**Verdict: persisted to a dedicated table. Button is fully wired and DB-backed.**

Exact write path:

- Component: `apps/web/app/dashboard/notas-rapidas.tsx` — client component
  `NotasRapidas({ initialNotes })`. Renders a `<form>` whose `action` is the server
  action from `useActionState(saveQuickNotesAction, ...)`, a single
  `<textarea name="notes">` (maxLength 2000), and the Guardar `<Button type="submit">`.
  Mounted at `apps/web/app/dashboard/page.tsx:362` as `<NotasRapidas initialNotes={initialNotes} />`.
- Handler: Guardar is a form submit bound to server action `saveQuickNotesAction`
  (not an API route, not local/session storage, not a no-op).
- Server action: `apps/web/lib/dashboard/actions.ts` (`"use server"`).
  `saveQuickNotesAction` reads `formData.get("notes")`, calls `saveQuickNotes(text)`
  (slices to `NOTES_MAX = 2000`), then `revalidatePath("/dashboard")`.
- DB write: `saveQuickNotes` runs inside `runScoped(ctx, tx => ...)`
  (`apps/web/lib/auth/context.ts:49`, an RLS-scoped Drizzle transaction) and performs
  an upsert:
  `tx.insert(quickNotes).values({ tenantId, staffUserId, content }).onConflictDoUpdate({ target: [quickNotes.tenantId, quickNotes.staffUserId], set: { content, updatedAt } })`.
- Drizzle table: `quickNotes` at `packages/db/src/schema.ts:844` → table `public.quick_notes`.
- Read side: `apps/web/lib/dashboard/notes.ts` `getQuickNotes(ctx)` selects `content`
  where `staffUserId = ctx.userId`; feeds `initialNotes` in `page.tsx`.

Migration `packages/db/migrations/0018_quick_notes.sql` — table `public.quick_notes`
("per-staff scratchpad", one row per `(tenant_id, staff_user_id)`):

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE`
- `staff_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE`
- `content text NOT NULL DEFAULT ''`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`
- `CONSTRAINT quick_notes_tenant_user_uq UNIQUE (tenant_id, staff_user_id)`
- index `quick_notes_tenant_user_idx ON (tenant_id, staff_user_id)`
- RLS enabled; policy `quick_notes_own_row` FOR ALL TO authenticated:
  `USING/WITH CHECK (tenant_id = (select public.jwt_tenant_id()) AND staff_user_id = auth.uid())`;
  grants SELECT, INSERT, UPDATE, DELETE to `authenticated`.

The `onConflictDoUpdate` target matches the `quick_notes_tenant_user_uq` constraint
exactly. The note is scoped per-staff-per-tenant (one mutable row), not append-only.

Stale comment observed (not a functional defect): `apps/web/app/dashboard/page.tsx:360`
reads `{/* Notas rápidas — persisted to tenants.settings.notes. */}`. Persistence is
to `quick_notes`, not `tenants.settings.notes`.

### 2. Appointment history retention

**Verdict: row-level history is retained (one durable row per appointment, never
hard-deleted, current status preserved). A per-appointment status-transition timeline
(old→new over time) is NOT stored in a dedicated history/event table.**

- Table: `appointments` (`packages/db/src/schema.ts:373-412`, DDL
  `packages/db/migrations/0000_empty_runaways.sql:8-26`). `agenda` and `marcacoes`
  are UI route names only (`apps/web/app/agenda/`, `apps/web/app/marcacoes/`), not tables.
- Status column: `status "appointment_status" DEFAULT 'scheduled' NOT NULL`. It is a
  Postgres ENUM (not a check constraint):
  `CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');`
  (`0000_empty_runaways.sql:2`; Drizzle `schema.ts:42-48`).
- Completion / past-date transitions: the row is kept and updated in place. Status
  changes are plain `UPDATE`s to `status` on the same row
  (`apps/web/lib/scheduling/actions.ts:309`, `:371`, `:381`). No scheduled job or
  trigger archives or mutates appointments when their date passes; status only changes
  on explicit user action. Prior status is overwritten on the row (only current status
  persists on the appointments row); the row itself persists.
- Deletes: no `deleted_at` / `is_deleted` column on `appointments` (only `patients`
  has `deleted_at`, `schema.ts:331`). Cancellation is a status value. Hard delete is
  explicitly forbidden in code (`apps/web/lib/scheduling/actions.ts:536-540`,
  comment `// Never hard delete — cancel via the status field only.`, sets
  `status: "cancelled"`). Repo-wide search for `.delete(appointments)` in non-test
  code: zero matches. Deletes are effectively soft via `status = 'cancelled'`; the row
  is never removed.
- History / audit trail for appointments: no dedicated appointment history table,
  status-transition log, or append-only per-appointment event table. Cross-time trace
  exists only via the generic shared `audit_log` table (see section 4). Appointment
  mutations are recorded there by `apps/web/lib/scheduling/audit.ts` with actions
  `appointment.create | appointment.update | appointment.reschedule | appointment.cancel`,
  `entityType: "appointment"`, `entityId: appointmentId`. Audit metadata is limited:
  on update it stores `metadata: { changed: Object.keys(set), scope }`
  (`actions.ts:366`) — which field names changed, not structured old→new status values;
  on cancel `metadata: { reason, scope }` (`actions.ts:548`).

Implication for downstream design sections 2 and 3: "full history retained" holds at
the row level (durable, never deleted, current status preserved). A queryable
per-appointment status-transition timeline is NOT backed by a dedicated history/event
table; only `audit_log` records that a change occurred (action + actor + timestamp +
changed field names), not prior status values.

### 3. Schema reality dump

Source of truth: `packages/db/src/schema.ts`, cross-checked against migrations
`0000`–`0021`. No drift found in the tables below. Structural facts up front:

- There is no dedicated therapist/practitioner table. The care-deliverer is a `users`
  row whose role resolves to `roles.slug = 'therapist'`. Appointments/records reference
  the practitioner as `practitioner_id → users.id`.
- There is no therapist-to-service link of any kind (no join table, no array column,
  no FK). See end of this section.

**`appointments`** (`schema.ts:373-412`; DDL `0000:8-26`; FKs `0000:189-194`)

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| tenant_id | uuid | NO | — | FK → tenants.id ON DELETE cascade |
| patient_id | uuid | NO | — | FK → patients.id ON DELETE no action |
| practitioner_id | uuid | NO | — | FK → users.id ON DELETE no action (the therapist) |
| location_id | uuid | NO | — | FK → locations.id ON DELETE no action |
| service_id | uuid | YES | — | FK → services.id ON DELETE no action |
| room | text | YES | — | room-conflict detection |
| starts_at | timestamptz | NO | — | |
| ends_at | timestamptz | NO | — | |
| status | enum appointment_status | NO | 'scheduled' | scheduled, confirmed, completed, cancelled, no_show |
| recurrence_rule | text | YES | — | RRULE; null = one-off |
| recurrence_parent_id | uuid | YES | — | self-pointer; no FK constraint declared |
| notes | text | YES | — | |
| created_by | uuid | YES | — | FK → users.id ON DELETE no action |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | `$onUpdate` |

Indexes: `appointments_tenant_idx (tenant_id)`, `appointments_tenant_start_idx (tenant_id, starts_at)`,
`appointments_tenant_location_start_idx (tenant_id, location_id, starts_at)` (added 0016),
`appointments_practitioner_start_idx (practitioner_id, starts_at)`,
`appointments_patient_idx (patient_id)`. No unique or check constraints.

**`patients`** (`schema.ts:296-337`; base DDL `0000:125`; identity layer `0010`; reminder prefs `0019`)

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| tenant_id | uuid | NO | — | FK → tenants.id ON DELETE cascade |
| full_name | text | NO | — | |
| date_of_birth | date | YES | — | |
| sex | varchar(16) | YES | — | |
| nif | varchar(20) | YES | — | PT fiscal number |
| email | text | YES | — | |
| phone | varchar(32) | YES | — | |
| address | text | YES | — | |
| postal_code | varchar(16) | YES | — | |
| city | text | YES | — | |
| notes | text | YES | — | |
| auth_user_id | uuid | YES | — | UNIQUE (`patients_auth_user_id_unique`); patient-portal auth principal |
| activated_at | timestamptz | YES | — | |
| merged_into_id | uuid | YES | — | merge-survivor pointer; no FK constraint declared |
| reminder_sms_enabled | boolean | NO | true | added 0019 |
| reminder_email_enabled | boolean | NO | false | added 0019 |
| created_by | uuid | YES | — | FK → users.id |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | `$onUpdate` |
| deleted_at | timestamptz | YES | — | soft delete |

Constraints: PK id; UNIQUE `auth_user_id`; FK tenant_id ON DELETE cascade; FK created_by → users.
Indexes: `patients_tenant_idx (tenant_id)`, `patients_tenant_name_idx (tenant_id, full_name)`,
phone-digits expression index (`0015`). No check constraints.

**Therapist / staff = `users` (+ `roles`)** — no `therapists`/`practitioners`/`staff` table.

`users` (`schema.ts:180-203`; DDL `0000:178`):

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | NO | — (no default) | PK; 1:1 with Supabase auth.users.id |
| tenant_id | uuid | NO | — | FK → tenants.id ON DELETE cascade |
| role_id | uuid | YES | — | FK → roles.id |
| email | text | NO | — | |
| full_name | text | NO | — | |
| is_active | boolean | NO | true | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | `$onUpdate` |

Constraints: PK id; UNIQUE `users_tenant_email_uq (tenant_id, email)`; index `users_tenant_idx (tenant_id)`.

`roles` (`schema.ts:161-178`): id (PK, gen_random_uuid), tenant_id (NO, FK → tenants ON DELETE cascade),
slug (NO; owner | admin | therapist | reception), name (NO), description (YES), created_at (NO, now()).
Constraints: UNIQUE `roles_tenant_slug_uq (tenant_id, slug)`; index `roles_tenant_idx (tenant_id)`.

Per-therapist schedule tables (keyed on `users.id`; define WHEN a therapist works, not what they offer):
- `availability_templates` (`schema.ts:422-466`): recurring weekly hours per
  `(user_id, location_id, weekday, start_time, end_time)`. Checks:
  `availability_templates_weekday_range CHECK (weekday between 0 and 6)`,
  `availability_templates_start_before_end CHECK (start_time < end_time)`;
  unique `availability_templates_dedupe_uq` with `.nullsNotDistinct()`.
- `time_off` (`schema.ts:470-490`): therapist absence blocks keyed on `user_id` (no
  location_id; therapist-wide). Check: `time_off_starts_before_ends CHECK (starts_at < ends_at)`.

**`services`** (`schema.ts:229-254`; DDL `0000:154`)

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| tenant_id | uuid | NO | — | FK → tenants.id ON DELETE cascade |
| location_id | uuid | YES | — | FK → locations.id; null = all locations |
| name | text | NO | — | Osteopatia, Fisioterapia, RPG, NESA, Massagem, etc. |
| description | text | YES | — | |
| duration_min | integer | NO | 60 | |
| price_cents | integer | YES | — | base/catalog price |
| currency | varchar(3) | NO | 'EUR' | |
| is_active | boolean | NO | true | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | `$onUpdate` |

Constraints: PK id; FKs tenant_id (cascade), location_id. Indexes: `services_tenant_idx (tenant_id)`,
`services_tenant_location_idx (tenant_id, location_id)`. No unique-on-name, no check constraints.

**`locations`** (`schema.ts:209-227`; DDL `0000:114`)

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| tenant_id | uuid | NO | — | FK → tenants.id ON DELETE cascade |
| name | text | NO | — | |
| address | text | YES | — | |
| phone | varchar(32) | YES | — | |
| is_active | boolean | NO | true | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | `$onUpdate` |

Constraints: PK id; FK tenant_id (cascade). Index: `locations_tenant_idx (tenant_id)`. No unique/check constraints.

**Therapist-to-service relationship: NONE.** No join table, array column, or FK links a
therapist (`users` row) to the services they provide. `services` has no
`user_id`/`practitioner_id` column; `users` has no services column; no
`therapist_services`/`service_practitioners` table exists (searched schema.ts +
migrations 0000–0021: zero matches). A therapist and a service co-occur only on an
individual `appointments` row (`practitioner_id` + nullable `service_id`) — i.e. per
booking, not as a capability/offering.

**Therapist-to-location:** only via `availability_templates (user_id, location_id)`,
both NOT NULL. No dedicated `user_locations` table — `0001_rls.sql:175-176` confirms:
`TODO v0.1: tighten to patients-they-treat once user_locations / appointment scoping exists.`
`time_off.user_id` is therapist-wide (no location_id).

**Service-to-location:** two mechanisms. (a) `services.location_id` (nullable FK; null
= all locations). (b) `service_location_prices` (`schema.ts:262-290`; DDL `0007`) —
per-location price override layer: columns id, tenant_id, service_id, location_id,
price_cents (NOT NULL), currency char(3) 'EUR', is_active, created_at. Constraints
verbatim (`0007:10-16`):
`CONSTRAINT "service_location_prices_tenant_service_location_uq" UNIQUE("tenant_id","service_id","location_id")`,
`CONSTRAINT "service_location_prices_price_nonneg" CHECK ("service_location_prices"."price_cents" >= 0)`;
FKs to tenants (cascade), services, locations. Index
`service_location_prices_tenant_location_idx (tenant_id, location_id)`. RLS tenant isolation.

For completeness, the only true many-to-many location junction is `patient_locations`
(`schema.ts:342-367`; DDL `0005`): links `patient_id ↔ location_id`, unique
`patient_locations_tenant_patient_location_uq (tenant_id, patient_id, location_id)`.

### 4. Existing event / audit surface

**Verdict: one generic audit table (`audit_log`) exists, scoped to compliance/security
auditing, deliberately PII-free, append-only via RLS. No analytics/KPI/metrics/telemetry
event table exists.**

`audit_log` (`schema.ts:653-674`; CREATE TABLE `0000_empty_runaways.sql:40-50`; RLS
`0001_rls.sql:150-166`). Columns verbatim:

```sql
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

FKs (`0000:199-200`): `tenant_id → tenants.id ON DELETE cascade`;
`actor_user_id → users.id ON DELETE no action`. Indexes (`schema.ts:670-672`):
`audit_log_tenant_idx (tenant_id)`, `audit_log_entity_idx (entity_type, entity_id)`,
`audit_log_created_idx (created_at)`.

Append-only by RLS — SELECT + INSERT policies only, no UPDATE/DELETE policy (both
denied). schema.ts:653 comment: "Append-only. No updated_at, no deletes — RLS will allow
INSERT + SELECT only." Policies:

```sql
CREATE POLICY "audit_log_tenant_select" ON public.audit_log
  FOR SELECT TO authenticated USING (tenant_id = (select public.jwt_tenant_id()));
CREATE POLICY "audit_log_tenant_insert" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
```

Shape: generic actor/action/entity/timestamp/payload. `actor_user_id` (nullable for
system events), `action` (dotted verbs e.g. `patient.update`), `entity_type` +
`entity_id` (target), `metadata jsonb` (PII-free by contract: ids/field-names/status/ISO
timestamps only), `ip varchar(45)`, `created_at`. All domains funnel through this one table.

Writers (all insert into `auditLog`, in the same transaction as the recorded mutation):
- `apps/web/lib/admin/audit.ts` — generic `writeAudit(tx, actor, {action, entityType, entityId, metadata})` (insert :25).
- `apps/web/lib/clinical/audit.ts` — `writeClinicalAudit(...)` (insert :36); exports `clientIp()`.
- `apps/web/lib/scheduling/audit.ts` — `writeAppointmentAudit(...)` (insert :31); hardcodes `entityType: "appointment"`.
- `apps/web/lib/patients/audit.ts` — `writeAudit(tx, ctx, {action: \`patient.${...}\`, entityId, metadata})` (insert :22); hardcodes `entityType: "patient"`.
- Direct: `apps/web/lib/integrations/ifthenpay/ledger-drizzle.ts:81` (`actorUserId: null`, `invoice.payment.recorded`);
  `apps/admin/lib/tenants.ts:118` (`actorUserId: null`, `tenant.status_change`).

Recorded actions / entity_types in use: `patient` (create, update, soft_delete,
restore), `location` (create, update), `service` (create, update), `staff` (invite,
role_change, profile_update), `tenant` (update, status_change), `appointment` (create,
update, reschedule, cancel), `clinical_record` (create, update, version, sign,
review_claim, review_finalize), `clinical_episode` (create), `attachment` (create),
`invoice` (payment.recorded).

`0013_review_finalize_audit.sql` is NOT a table — despite its name it only adds three
columns to `patient_form_submissions`:
`clinical_record_id uuid`, `reviewed_by uuid`, `reviewed_at timestamptz` (in-row
finalize-outcome fields). The corresponding `clinical_record.review_finalize` event is
what gets appended to `audit_log`.

Adjacent non-audit surfaces (none are generic event logs): `ai_ingestion_requests`
(`schema.ts:619`, `0008`) — mutable request-status row, deduped by
`(tenant_id, idempotency_key)`; `migration_staging_rows` (`schema.ts:727`, `0014`) —
mutable import staging; `quick_notes` (`schema.ts:844`, `0018`) — one mutable note per
staff; `clinical_records.supersedes_id` (`schema.ts:568`) — self-FK version chain
(append-only clinical-record version history, but the domain table itself, not a log).

Net for a future KPI event layer: the only existing audit/event surface is `audit_log`,
shape `(id, tenant_id, actor_user_id, action, entity_type, entity_id, metadata jsonb, ip,
created_at)`, append-only, tenant-isolated, written synchronously in-transaction. Its
purpose is compliance/security auditing with PII-free metadata, not analytics. No
existing KPI/metrics/analytics/telemetry event table.
