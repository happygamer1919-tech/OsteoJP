# Loop W4-19 - Appointments: optional secondary patient + secondary therapist (booking panel, linked display data, primary-only semantics) (recon-first, ONE pre-approved migration if required)

GATE: **LAST in Wave 04.** Runs after W4-18. UI + server + (conditionally) schema. **Recon-first migration stance:** migration-free if recon proves a genuine one; otherwise **ONE migration (0032) is PRE-APPROVED by the owner for this loop — the single migration in flight, and the ONLY Wave 04 loop allowed to fire one** (DECISIONS 2026-07-06 "Secondary participants on appointments"). Conforms to `docs/design/UI-STYLE.md` (W4-13; exists once W4-13 has merged).

## Field 1. Scope and ground truth
Staff scenario (Rodica): some appointments involve a **second patient** or a **second therapist**. Today an appointment carries **exactly one** patient (`patient_id`) and one practitioner (`practitioner_id`). This loop adds **one optional secondary of each**, as **linked, persisted display data** — NOT UI-only.

**The UI requirement (booking panel):**
- One extra field **directly under Paciente**, labelled **`Paciente 2 (opcional)`**.
- One extra field **directly under Terapeuta**, labelled **`Terapeuta 2 (opcional)`**.
- Both **visually de-emphasized** (greyed / collapsed / secondary styling) since they are rarely used. Conform to `docs/design/UI-STYLE.md` (W4-13).

**Owner rulings embedded (DECISIONS 2026-07-06 — do NOT re-ask):**
- **Both secondary fields are OPTIONAL.** The **primary patient and primary therapist stay REQUIRED and unchanged.**
- **Primary-only semantics EVERYWHERE:**
  - **Availability** enforcement/panel (`getTherapistAvailability`) reads the **primary therapist only**; the secondary therapist's availability is neither checked nor shown.
  - **Service auto-select** (W3-03 / W4-03) and **location auto-select** (W4-12) fire from the **primary therapist only**; selecting a secondary therapist triggers **no auto-fill**.
  - **`analytics_events` money attribution** (0025) stays on the **primary** pair; secondary participants are never attributed.
  - **AI recording pipeline contract UNCHANGED:** `patient_id` and `doctor_id` remain the **primary** pair; the idempotency key (`patient_id` + `consultation_started_at` + `consultation_ended_at`) is **untouched**.
  - **`confirmation_state` and the `status` lifecycle axes are UNTOUCHED** by secondary participants.
- **Secondary participants are LINKED DISPLAY DATA:** visible on the **appointment details** and on the **agenda appointment card** (compact — e.g. a `+1` badge with names on hover or in details). **Agenda renders the appointment under the PRIMARY therapist column only.** Rendering the appointment under BOTH therapist columns is a **recorded follow-up candidate, NOT this loop.**
- **Hard-delete + clinical-note guards (W3-06) must account for secondary linkage** in the child-first delete order.

**Ground truth (locked mechanisms — GREEN runs with ZERO memory; do not assume anything not written here):**
- **`appointments`** (`packages/db/src/schema.ts`): `patient_id → patients.id` (ON DELETE NO ACTION), `practitioner_id → users.id` (the therapist, ON DELETE NO ACTION), `location_id`, `service_id` (nullable), `status` enum (`scheduled`…), `confirmation_state` (0024), `booking_group_id` (0027, bare uuid), `batch_id` (0028, bare uuid), `recurrence_*`, `room`, `notes`. **There is currently NO secondary-participant column.**
- **`booking_group_id` (0027) is NOT the same feature.** It relates **separate appointment rows** booked together ("two therapists / one patient / one flow") — each row keeps its OWN primary practitioner, availability, and analytics. The requirement here is **one row** carrying an optional secondary as de-emphasized display data with **primary-only semantics**. **Recon MUST evaluate whether `booking_group_id` already satisfies the need and explicitly rule it in or out** (default: it does NOT — it is multi-row grouping, not single-row secondary display data).
- **Booking paths that write `appointments`** (from the W4-12 recon): **Nova marcação**, **Agendar lote**, and **batch rebook** share the single drawer (`apps/web/app/agenda/appointment-drawer.tsx`, `form.*`); **patient schedule-again** copies the source appointment server-side (`clone-core.ts` `buildClonedAppointment`, `actions.ts` `cloneAppointment`).
- **`cloneAppointment` (owner ruling): the clone COPIES the secondary fields AS-IS** (it does NOT NULL them the way it NULLs `booking_group_id`/`batch_id`/`room`/`notes`/confirmation/recurrence). Schedule-again reproduces the same two participants.
- **W3-01 (#468) creation invariant:** create + batch **hardcode** `status = scheduled` / `confirmation_state = pending`, never from payload. **Secondary fields NEVER affect the Estado invariant.**
- **W3-06 (#473) hard-delete:** password-gated appointment hard-delete; refuses when linked notes/records/invoices exist; **child-first `RETURNING` delete + PII-free audit snapshot.** Secondary columns live ON the appointment row (deleting the row removes them; no child rows to cascade), but the **reference guards that protect a participant from deletion must count secondary linkage** — see the ripple note below.
- **`getTherapistAvailability`** (`apps/web/lib/scheduling/day-availability.ts:72`): read-only, tenant-scoped; the source for the booking availability panel. Reads the primary practitioner.
- **`batchSchedule`** (`apps/web/lib/scheduling/batch.ts`): expands a recurrence to slots and books free ones under one `batch_id`; its input payload shape is a recon point (does the batch flow carry the secondary fields, and does each created row persist them?).
- **RLS:** `appointments` is RLS-enabled with tenant isolation keyed on the JWT `tenant_id`; a **new column is covered by the existing table policy** (no new policy needed). But a bare FK does **not** verify tenant match — the **secondary participant must belong to the SAME tenant** (app-layer discipline, exactly as `patient_id`/`practitioner_id` do today via `runScoped`). This must be enforced and proven.

All UI copy is **pt-PT via i18n keys** (no hardcoded strings, no emoji). All build/verify work is **synthetic-data-only**; verify on the **E2E seed tenant**.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-19-secondary-participants origin/main -b osteojp-w4-19-secondary-participants`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-19-secondary-participants`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **RECON — report BEFORE building, paste every ripple point:**
   - **Migration decision:** whether a **genuinely migration-free** representation exists (evaluate `booking_group_id` 0027 and any existing nullable slot — and explicitly rule it in/out), OR the two-nullable-columns shape is required. **Paste the recommendation with rationale.** Default recommendation (below) if recon confirms no migration-free path.
   - **Every booking path writing `appointments`:** Nova marcação, Agendar lote, batch rebook (shared drawer), patient schedule-again / `cloneAppointment`. State which expose the two fields and how each persists them.
   - **`cloneAppointment` / `buildClonedAppointment`:** confirm the copy-as-is requirement (secondary fields copied, not NULLed).
   - **`batchSchedule` payload shape:** whether/how the batch flow carries + persists the secondary fields.
   - **Appointment details rendering** + **agenda card rendering** (where the `+1` badge and names go; primary-column-only render).
   - **W3-06 hard-delete child order** AND the **participant-side reference guards** that must now count secondary linkage — specifically the **W4-01 therapist-delete reference guard** (a therapist referenced as `secondary_practitioner_id` must count as referenced → deactivate-only, never silent hard-delete) and the **patient references** (a patient referenced as `secondary_patient_id`). Paste which guards need the extra reference check.
   - **`analytics_events` writes** (money attribution stays primary — confirm no secondary attribution path).
   - **W3-01 Estado creation invariant** (secondary fields must not feed `status`/`confirmation_state`).
   - **Auto-selects:** the therapist-selection effect (W3-03 Serviço + W4-12 Localização) must fire from the **primary** field only; the secondary therapist field must NOT hook those effects.
   - **Patient-side / appointment-listing surfaces:** any surface that lists appointments (e.g. the patient-detail marcações list). **Recommended default:** an appointment lists under the **primary** patient/therapist only; the secondary linkage is visible on the appointment's own details + agenda card, NOT injected into the secondary participant's list (keeps primary-only semantics; avoids scope creep). State the default taken.
3. **Migration (only if recon requires it) — DEFAULT SHAPE:** author **`packages/db/migrations/0032_*.sql`** adding **two nullable columns** to `appointments`:
   - `secondary_patient_id uuid NULL REFERENCES patients(id) ON DELETE NO ACTION` (matches the primary `patient_id` FK behavior),
   - `secondary_practitioner_id uuid NULL REFERENCES users(id) ON DELETE NO ACTION` (matches the primary `practitioner_id` FK behavior),
   - partial indexes mirroring the 0027/0028 pattern: `(tenant_id, secondary_patient_id) WHERE secondary_patient_id IS NOT NULL` and `(tenant_id, secondary_practitioner_id) WHERE secondary_practitioner_id IS NOT NULL`.
   Exactly ONE extra of each (owner ruling); **junction tables ONLY if recon surfaces a hard blocker** with the nullable-FK shape (surface it, do not silently switch). No change to RLS policy (existing table policy covers new columns); Drizzle schema updated to match.
4. **Migration discipline (if fired):** mirror via `node scripts/sync-supabase-migrations.mjs` then run its **`--check`** so `packages/db/migrations/` and `supabase/migrations/` are 1:1 (**parity 33/33, head 0032**) BEFORE the PR opens; add a **db RLS/isolation test** proving tenant isolation still holds for a row carrying secondary columns AND that a **cross-tenant secondary id cannot be written/read** (same-tenant integrity, app + RLS). NEVER touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`.
5. **Booking drawer:** add `Paciente 2 (opcional)` directly under Paciente and `Terapeuta 2 (opcional)` directly under Terapeuta, de-emphasized per UI-STYLE.md; wire both into the shared `form.*` and every write path so they persist. The secondary therapist field does **NOT** hook the Serviço/Localização auto-fill effects (primary-only).
6. **Persistence + clone + batch:** all create paths persist the two fields; `buildClonedAppointment` copies them as-is; `batchSchedule` carries + persists them per the recon decision.
7. **Rendering:** appointment details show both secondary participants; the agenda card shows a compact `+1` badge with names (hover/details); the card renders under the **primary therapist column only** (both-columns is the recorded follow-up, not built).
8. **Guards:** W3-06 child-first delete accounts for secondary linkage; the W4-01 therapist-delete reference guard (and patient references) count `secondary_practitioner_id`/`secondary_patient_id` as references so a referenced secondary participant is never silently hard-deleted.
9. **Update the affected Playwright specs on-branch** (booking drawer + agenda card + details) — **never touch `db-tests.yml`/`e2e.yml`.** **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS), `pnpm build`, `pnpm test:e2e`.

## Field 3. Definition of done (machine-verifiable)
- **Recon report pasted** covering EVERY ripple point in Field 2.2, incl. the `booking_group_id` rule-in/out and the migration-vs-migration-free recommendation with rationale.
- **Three bookings on the E2E seed tenant persist + render** (details + agenda card): (1) an appointment with a **secondary patient**, (2) one with a **secondary therapist**, (3) one with **both**. Paste the DB-persist evidence (ids/enums only, PII-free) + the details/card render evidence.
- **Plain single booking regresses ZERO:** a booking with only the primary patient + primary therapist behaves exactly as today. Paste the test.
- **Auto-selects fire from PRIMARY only:** Serviço (W3-03/W4-03) + Localização (W4-12) auto-fill on the primary therapist selection; selecting a secondary therapist triggers no auto-fill. Paste the test.
- **Primary-only semantics proven:** availability reads the primary; `analytics_events` attributes the primary; the AI-recording `patient_id`/`doctor_id` + idempotency key are the primary pair (unchanged); `status`/`confirmation_state` unaffected (W3-01 invariant holds). State + cite the tests.
- **Guards account for secondary linkage:** W3-06 child-first delete + the therapist/patient reference guards count the secondary FKs. Paste the guard test (a therapist referenced only as a secondary is deactivate-only, not hard-deleted).
- **Clone copies secondary as-is:** schedule-again reproduces both participants. Paste the test.
- **Migration status:** if a migration fired — **head 0032, mirror parity 33/33** (`sync-supabase-migrations.mjs --check` clean), and the **RLS/isolation db test green**; paste the `--check` output + the migration `git diff --name-only`. If recon found a migration-free path — paste the `git diff --name-only origin/main` showing ZERO files under `packages/db/migrations/`/`supabase/migrations/` and state the representation used.
- **No workflow files touched:** `git diff --name-only origin/main` shows ZERO changes under `.github/workflows/`. Paste it.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report (all ripple points + booking_group_id ruling + migration recommendation), the three secondary-booking persist+render evidences (PII-free), the zero-regression single-booking test, the primary-only auto-select test, the primary-only-semantics citations, the reference-guard test, the clone-copies-secondary test, the migration status (head/parity/`--check`/RLS test OR the migration-free diff), the no-workflow-change diff, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-19-secondary-participants` off `origin/main`; never edit the primary clone.
- **Migration stance:** **recon-first.** Migration-free if genuinely possible; else **ONE pre-approved migration 0032** (two nullable columns default; junction only on a proven hard blocker, surfaced not silent). This is the **single migration in flight** and the **only Wave 04 loop allowed to fire one**. If fired: `packages/db/migrations/` authored, mirrored + `--check` clean (**parity 33/33, head 0032**), RLS/isolation db test in the SAME PR (CLAUDE.md RLS rule). **NEVER touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`.**
- **Primary is untouched + required:** primary patient/therapist stay required; **all primary-only semantics hold** (availability, auto-selects, analytics attribution, AI-recording primary pair + idempotency key, Estado/lifecycle axes). Secondary is optional, de-emphasized, primary-only-semantic display data.
- **Agenda renders under the primary therapist column only** — do NOT render under both columns (that is the recorded follow-up candidate).
- **Redesign/field additions WILL move Playwright selectors:** update the affected specs **on-branch**.
- **LIVE-DATA CAUTION:** real therapist accounts (Max's) + their `availability_templates`/`therapist_services` on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` are **never modified or deleted** — a secondary reference must never trigger a mutation of a real account. Verify against **E2E seed tenant fixtures** only.
- **Conform to `docs/design/UI-STYLE.md`** (W4-13). The two fields are de-emphasized secondary styling; refinement, not rebrand.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- **pt-PT via i18n keys**, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload; the secondary participants must be same-tenant.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record the resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- Recon shows the **two-nullable-columns shape cannot express the requirement** (e.g. a hard blocker forces junction tables, or "exactly one extra of each" proves insufficient) — surface the blast radius of a junction-table shape and recommend before building; do NOT silently switch shapes.
- Making the secondary participant same-tenant-safe would require **relaxing RLS** or a cross-tenant read — STOP; the secondary must be same-tenant, enforced app-layer as the primary is.
- A primary-only-semantic guarantee **cannot be preserved** (e.g. an availability/analytics/auto-select path would start consuming the secondary) — STOP; primary-only is a hard ruling.
- The secondary linkage **cannot be added to the delete/reference guards** without changing W3-06's password gate or the W4-01 therapist-delete ruling — surface it; the gates/rulings are fixed, only the reference set widens.
- `docs/design/UI-STYLE.md` is **absent** (W4-13 not yet merged) when this loop starts — surface the ordering violation (this loop runs after W4-18, which depends on W4-13); do not invent a style system.
- A required change would force editing a `packages/ui` primitive whose ripple extends beyond booking/agenda — surface the blast radius.

## Field 7. Report back
Recon report (all ripple points, booking_group_id ruling, migration recommendation), the two-field booking drawer + persistence + clone + batch + rendering + guards, the three secondary-booking persist+render evidences, the zero-regression + primary-only auto-select + primary-only-semantics + reference-guard + clone-copies-secondary tests, the migration status (head 0032 / parity 33/33 / `--check` / RLS test — OR the migration-free diff), the no-workflow-change diff, the DECISIONS entry, e2e summary, suite counts, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge (this batch has no runner self-merge authority; classic stop-and-report). A refused or blocked merge is a HALT reported to Ivan.
