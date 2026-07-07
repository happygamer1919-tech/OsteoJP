# Loop W4-12 - Nova marcação: Localização auto-fill from a therapist's single-location assignment (owner addition, recon-first, migration-free)

GATE: none. Owner mid-loop addition (Ivan, 2026-07-06), sequenced after W4-03 closes and before W4-04 in the original dispatch; executed alongside the running chain (does not depend on W4-03's unbuilt fix — it hooks the existing therapist-selection event). UI + server, migration-free. Recon-first.

## Field 1. Scope and ground truth
In booking, selecting a Terapeuta auto-fills the **Localização** field from that therapist's location assignment — mirroring the W3-03 Serviço auto-fill, on the SAME selection event.

Owner ruling embedded (Ivan, 2026-07-06):
- **Exactly one active location** assigned to the therapist → **auto-fill** Localização with it.
- **Zero or multiple** active locations → **no auto-fill**; manual selection stays.
- The auto-filled value is **always editable**; a user's manual location pick is **never clobbered**.

Ground truth (locked mechanisms — GREEN runs with ZERO memory):
- **Therapist ↔ location association lives in `availability_templates` (migration 0006)** — there is NO dedicated `therapist_locations` join and NO `location_id` on `users`. A therapist's locations are the DISTINCT `location_id` of their `is_active = true` availability rows, at locations that are themselves `is_active = true`. Multi-location is supported (1:N).
- **Two active locations exist on the E2E seed tenant:** LOCATION_A (Linda-a-Velha) and LOCATION_B (Consultório B); LOCATION_ARCHIVED is inactive.
- **The booking Localização field** (`apps/web/app/agenda/appointment-drawer.tsx`) defaults to `options.locations[0]?.id` on create — it is NEVER empty, so "don't clobber a manual pick" cannot use the empty-guard the Serviço auto-fill uses; it needs a `userChangedLocation` ref (set on the location Select's onChange), symmetric to `userChangedTherapist`.
- **The therapist-selection event** is the `useEffect` keyed on `form.practitionerId`; the Serviço auto-fill (W3-03) already fires there via `getTherapistServices`. Location auto-fill hooks the SAME effect with an independent `getTherapistLocations` fetch — different field, no clobber, no race (guards read fresh after the await).
- **Booking does NOT enforce availability** (`createAppointment`, actions.ts): seeding availability_templates for a therapist has no booking side effects.

**SECOND-COMPONENT-PATH RULE (mandatory):** recon ALL booking paths that render Localização. Findings: **Nova marcação**, **Agendar lote**, and **batch rebook** all share the single drawer `form.locationId` (one fix covers all three); **patient schedule-again** copies the source appointment's `locationId` server-side (`clone-core.ts`) and has no therapist-driven location field — correctly unaffected.

**LIVE-DATA CAUTION:** real therapist accounts on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` are never modified. Build + verify use the E2E seed tenant only. All UI copy is pt-PT via existing i18n keys (`header.location`, `appointment.selectLocation`); no new strings. Migration-free — derived from existing `availability_templates`.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-12-location-auto-select origin/main -b osteojp-w4-12-location-auto-select`; assert toplevel + clean tree. HALT (Field 6) on failure.
2. **Recon, report BEFORE building:** where the therapist↔location association lives (proven: `availability_templates`, not a join table); single-vs-multi cardinality (multi supported); every Localização-rendering booking path (the three drawer paths + schedule-again); the therapist-selection event and how Serviço auto-fill is wired; interaction so Serviço + Localização both fire on one event without racing/clobbering.
3. **Read helper:** `getTherapistLocationIds(ctx, therapistId)` — DISTINCT active `location_id` from `availability_templates` ⋈ active `locations`, tenant-scoped via `runScoped` (mirrors `getTherapistServiceIds`). Server action `getTherapistLocations` (mirrors `getTherapistServices`).
4. **Decision:** pure `pickAutoFillLocation(activeLocationIds, { userChangedTherapist, userChangedLocation })` — exactly-one → the id; zero/multiple → null; only on a real therapist change; never over a manual pick. Extracted so the ruling is unit-testable in the node test env.
5. **Wire the drawer:** `userChangedLocation` ref set on the Localização Select's onChange; in the practitionerId effect, fetch `getTherapistLocations` and apply `pickAutoFillLocation` — on the SAME event as the Serviço auto-fill, independent setForm.
6. **Tests:** unit — `pickAutoFillLocation` across all owner-ruling branches (0/1/many, both guards). e2e (Chromium) on the E2E seed tenant — a single-location therapist auto-fills Localização + Serviço on one selection and stays editable; a multi-location therapist auto-fills Serviço (proving the effect ran) but leaves Localização untouched. Dedicated seed therapists (`therapistLocOne`, `therapistLocMulti`), isolated from other specs.
7. **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** association source (availability_templates), cardinality (multi), all-paths audit (three drawer paths + schedule-again), the shared therapist-selection event.
- **Single-location auto-fill:** selecting a single-location therapist in Nova marcação auto-fills Localização, editable + honored; paste the e2e.
- **Zero/multiple → no auto-fill:** a multi-location (or unassigned) therapist leaves Localização untouched; paste the e2e.
- **Combined on one event:** Serviço + Localização both auto-fill on a single therapist selection; paste the e2e.
- **Every affected path covered:** the three drawer paths inherit the fix; schedule-again unaffected (copies source) — stated.
- **No UPDATE / no schema change:** read-only derivation from `availability_templates`; state so.
- **Suite counts** pasted (web + db) with green lint/typecheck/test/build.

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only origin/main`, the `pickAutoFillLocation` unit test, the single-location + multi-location e2e, suite counts, and the PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-12-location-auto-select` off `origin/main`.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change; derive from `availability_templates`. Any proven schema need is a HALT (Field 6), classification SCOPE.
- **LIVE-DATA CAUTION:** never modify real therapist accounts / their `availability_templates` on dev tenant `3a2d0711-...`. Verify against E2E seed tenant fixtures.
- **Synthetic-data-only** for build + verify.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- pt-PT via existing i18n keys, no new strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context.

## Field 6. Halt loud if
On any blocker, HALT via the mailbox (classification as noted) with the exact mismatch, options, and a recommended default. Never guess a product decision.
- Recon proves a **schema change is required** (e.g. the association does not live in existing tables) — HALT, classification **SCOPE**, recommended default.
- Fixing the drawer location auto-fill would **clobber a manual pick or race the Serviço auto-fill** in a way not resolvable with the guards — surface it.
- A change would force editing a shared `packages/ui`/`packages/db` primitive whose ripple extends beyond booking — surface it.

## Field 7. Report back
Recon report, the read helper + decision fn + drawer wiring, the unit + e2e tests, migration-free proof, suite counts, the DECISIONS entry, and the PR number. Merge gate: four legs (DoD evidence, ALL required checks SUCCESS polled, zero changes to `db-tests.yml`/`e2e.yml`, branch current server-side, never force-push). Self-merge on full green per the standing GREEN dispatch; flip BACKLOG DONE.
