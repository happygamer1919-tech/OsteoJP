# Loop W8-01c - Booking a pack: registration, decrement, manual adjust (Wave 08 Dados e KPI)

GATE: **Wave 08 Dados e KPI, migration-free.** Wires packs into appointment creation on the model from W8-01a: booking a pack registers a per-patient instance and consumes the first session; later bookings show and decrement the remaining count; staff can manually adjust (consume/restore) a session for the under-24h rule; remaining sessions surface on the agenda and the patient profile. **Runs AFTER W8-01a (`0037`) is merged** (and can follow W8-01b). Starts from **fresh `origin/main`**; never stacked. **GREEN self-merge** (migration-free).

## Field 1. Scope and ground truth

Make a pack bookable and consumable at appointment creation, tracked per patient, with a manual staff adjust for the no-show/under-24h rule, and surface the remaining count where the appointment is seen.

Ground truth (recon at authoring 2026-07-15, embed - executor runs with ZERO memory):
- **The pack tables (definitions + per-patient instances) ship in W8-01a (`0037`).** This loop consumes them; it adds NO schema (migration-free). The per-patient instance table tracks `sessions_total` + `sessions_remaining` per `(patient, pack)`.
- **Appointment creation** is the Agenda create drawer (`apps/web/app/agenda/`, the appointment drawer / `AppointmentDrawer`), whose service options come from `getAgendaOptions` (active-only services, per W6-01b creation-active-only). Appointments reference a service via `appointments.serviceId` (`packages/db/src/schema.ts:468`, nullable FK). W6-03 already supports a preselected+locked patient on the create drawer (deep-link path) - reuse that patient-context plumbing; do not rebuild it.
- **Booking a pack:** when the chosen bookable type is a PACK, for a patient with NO active instance of that pack, booking REGISTERS a new instance (session count 10 or 5 per the pack definition) and consumes session 1 (remaining = total - 1). For a patient WITH an active instance, booking DECREMENTS remaining by 1 and the UI shows the remaining count. A booking that would take remaining below 0 is blocked (no negative balances) with a clear pt-PT message; registering a fresh instance is the path when none is active.
- **Manual adjust (the under-24h rule):** staff get a manual control to CONSUME or RESTORE one session on an instance (for a no-show or an under-24h cancellation counting as consumed - the platform NEVER auto-charges or auto-decrements on cancellation; enforcement is manual per the W8-01a business rule). Every adjust is audited (rule 6) and never drives a charge.
- **Surfacing:** the remaining-sessions count shows on the agenda (where a pack appointment renders) and on the patient profile (`apps/web/app/patients/[id]/`). Keep it a plain count + pack name; no new chrome pattern.
- **i18n:** pt-PT + en for pack booking, remaining count, and adjust controls. JSON.parse both files in the gate.

**Scope:** appointment creation offers packs as bookable types (active packs only, W6-01b); booking a pack registers a new instance (+consume session 1) when none is active, else decrements and shows the remaining count; a staff manual adjust control consumes/restores a session (under-24h rule, audited, never a charge); the agenda and the patient profile surface remaining sessions. Regression tests on registration, decrement, and adjustment. E2E via disposable patients only. Migration-free.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W8-01a's `0037`; `git worktree add ../osteojp-w8-01c-booking-packs origin/main -b osteojp-w8-01c-booking-packs`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **RECON:** confirm the W8-01a instance API, the Agenda create-drawer + `getAgendaOptions` seam, the `appointments.serviceId` link, and the patient-profile render point. Paste findings.
3. **Bookable packs:** surface active packs as bookable types in the create drawer (active-only per W6-01b creation rule), distinct from plain services.
4. **Registration + decrement:** booking a pack with no active instance registers one (total 10 or 5) and consumes session 1; with an active instance, decrement by 1 and show remaining; block below 0 with a clear message. All in one tenant-scoped, audited transaction.
5. **Manual adjust:** a staff control to consume/restore one session on an instance (under-24h rule), audited, never a charge.
6. **Surfacing:** remaining sessions on the agenda (pack appointment) and the patient profile.
7. **Tests:** regression tests on registration (fresh instance + consume 1), decrement (remaining shown + decremented, blocked below 0), and adjustment (consume/restore + audit). E2E (disposable patients): book a pack for a disposable patient (registers + consumes 1), book again (remaining decrements), adjust a session (restore), verify agenda + profile show the count.
8. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`. JSON.parse both i18n files. Confirm `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Registration PROOF:** booking a pack for a patient with no active instance creates an instance (total 10 or 5) and consumes session 1 (remaining = total - 1). Paste the test.
- **Decrement PROOF:** a subsequent booking decrements remaining and the UI shows the count; a booking below 0 is blocked with a clear message. Paste the test.
- **Adjust PROOF:** the manual consume/restore control changes remaining by exactly 1 and writes an audit row; it never triggers a charge. Paste the test.
- **Surfacing PROOF:** remaining sessions render on the agenda and the patient profile. Paste it.
- **E2E PROOF (disposable patients):** the full book -> decrement -> adjust flow on a disposable patient. Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The recon report, the migration-free diff, the registration/decrement/adjust regression tests, the surfacing proof, the disposable-patient E2E, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W8-01a's `0037`). **Migration-free:** consume the W8-01a tables; if a schema change surfaces, HALT (do not add a migration here).
- **The platform NEVER auto-charges and NEVER auto-decrements on cancellation.** The no-show/under-24h consumption is MANUAL (the staff adjust control) per the W8-01a business rule. No automatic billing.
- **No negative balances.** A booking that would take remaining below 0 is blocked; registering a new instance is the correct path when none is active.
- **Reuse the existing create-drawer patient context (W6-03)** and `getAgendaOptions`; do not rebuild booking plumbing. DB access only through `packages/db`. Audit every mutation (rule 6).
- pt-PT i18n (both files, JSON.parse both); no emoji; UI-STYLE.md + 55/25/20 equity. **Never force-push / `--admin`.** Plain hyphens only. **SYNTHETIC-DATA-ONLY / DISPOSABLE PATIENTS for verify.**
- **Standing test-data rule (Wave 08):** never run destructive QA against patient **Maria Joao Silva** (`triboimax635+maria@gmail.com`); use **disposable test patients only**; the reference therapist for tests is **Tiago Reis**.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W8-01a's `0037`.
- Wiring packs into booking needs a schema change (e.g. an appointment->instance link) not delivered by W8-01a - HALT (convert to a W8-01a follow-up; do not add a migration here).
- The consume/restore or block-below-0 rule cannot be enforced tenant-scoped and audited without weakening a control - HALT.

## Field 7. Report back
The recon report, the migration-free diff, the registration/decrement/adjust tests, the surfacing proof, the disposable-patient E2E, suite counts, PR number.

## Merge policy (embed, Wave 08 Dados e KPI)
- **W8-01c is GREEN self-merge (migration-free).** GREEN self-merge once ALL required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API NOT the banner. If a migration surfaces, HALT and convert to an OWNER-MERGE follow-up (do not add a migration in this loop).
- **Runs after W8-01a merged** (and may follow W8-01b), fresh `origin/main`, never stacked. Workflow files NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/data/reality mismatch.
