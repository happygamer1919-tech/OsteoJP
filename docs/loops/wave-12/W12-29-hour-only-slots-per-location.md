# Loop W12-29 - Hour-only slots per-location toggle (CB ON) (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, FEATURE, migration-gated. OWNER-MERGE (migration + booking-source-of-truth). CYAN pre-merge audit mandatory. Portal-safety critical.** Per-location slot granularity (default 30 min, 60 for Castelo Branco), persisted; per the Q-W9-00-3 ruling. Build the per-location toggle regardless of the global-vs-per-location scope question (Q-W12-02). One migration in flight, one PR in flight. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Add a per-location slot-granularity setting (default 30, CB=60), persisted, consumed by the booking source of truth + the agenda grid, WITHOUT changing LV or the patient portal's LV behaviour. This is not a cosmetic filter - the 30-min grid is baked into the booking expansion.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **30-min is hardcoded in multiple places:** `apps/web/lib/scheduling/time.ts:17` `SLOT_MINUTES = 30`; `daySlots()` steps by `SLOT_MINUTES` (`time.ts:226-232`); `minToPx` hardcodes `/ 30` (`agenda-grid.tsx:35`); `SLOT_HEIGHT = 48` per 30-min (`agenda-grid.tsx:29`); availability step `availability-panel.tsx:152-157`; blocked-time `blocked-time-core.ts:110-112`.
- **The booking source of truth expands in 30-min SQL:** `listOpenSlots` -> `apps/api/lib/appointments/store.ts:316-370` uses `generate_series(..., interval '30 minutes')` (step HARDCODED in SQL, `:340-344`); `durationMin` only sets the window end, not the step. HTTP `GET /api/v1/booking/slots` (`route.ts`).
- **The portal wizard consumes the SAME `listOpenSlots`** (`apps/portal/app/portal/booking/BookingFlow.tsx` step 3 -> `getOpenSlots` -> `/api/v1/booking/slots`). A platform-wide change would silently halve LV's + the portal's bookable slots - which is why Q-W9-00-3 ruled PER-LOCATION.
- **The ruling (Q-W9-00-3 CLOSED, DECISIONS 2026-07-21):** per-location granularity, default 30 min, 60 for Castelo Branco; LV + the portal UNCHANGED. Migration-gated (persisted per location).
- **Rodica now asks for it globally** (register Q-W12-02: global vs per-location). **Build the per-location toggle regardless** - it satisfies CB and is the only option that does not silently change LV/portal; if the owner later rules global, the per-location setting is set to 60 everywhere (no rework).
- **Design:** add a decoupled `locations.slot_granularity_min` (smallint, NOT NULL, default 30) migration; `listOpenSlots` reads the location's granularity for the step (parameterise the `generate_series` interval, tenant-scoped); the agenda grid reads the location's granularity for the row step + `minToPx`/`SLOT_HEIGHT` math (so CB shows hourly rows); LV stays 30; the portal reads the same per-location value so LV portal behaviour is unchanged and CB portal (if bookable) follows the ruling.

**Scope:** one migration (`locations.slot_granularity_min`, decoupled) + `listOpenSlots` parameterisation + the agenda grid per-location step + tests (LV unchanged; CB hourly; portal LV unchanged). One migration in flight; head +1; manual `drizzle-kit` direct apply (5432, cwd `packages/db`). Cloud REAL DATA ONLY; verify on local + Preview.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-29-hour-only`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Migration (decoupled):** add `locations.slot_granularity_min` (smallint, NOT NULL, default 30), mirrored both migration dirs; `tenant_id`/RLS on `locations` unchanged; a coverage test. Seed CB=60 (owner-gated DATA, or via the admin UI in a follow-up).
3. **`listOpenSlots` parameterisation:** replace the hardcoded `interval '30 minutes'` with the location's granularity (tenant-scoped, validated); `durationMin` still sets the window end. Do NOT change the horizon or the timezone handling.
4. **Agenda grid:** read the location's granularity for `daySlots`/`minToPx`/`SLOT_HEIGHT` so CB renders hourly rows and LV stays 30-min; keep the W12-02 hour-rule-edge fix consistent.
5. **Portal-safety:** confirm the portal wizard reads the per-location value; LV portal slots are byte-identical before/after; a portal guard/test asserts LV unchanged.
6. **CYAN pre-merge audit** (migration + booking-source-of-truth); manual live-apply journal; Preview app + portal smoke.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` scoped.

## Field 3. Definition of done (machine-verifiable)
- **Migration PROOF:** `locations.slot_granularity_min` added (decoupled, default 30); head +1; CYAN CLEAN; manual live-apply journal; coverage test green.
- **CB-hourly PROOF:** an e2e/unit shows CB (granularity 60) produces hourly slots in `listOpenSlots` + hourly agenda rows.
- **LV-unchanged PROOF:** an e2e/unit shows LV (granularity 30) slots + agenda rows are unchanged; a portal test shows LV portal slots byte-identical before/after.
- **Booking-integrity PROOF:** `listOpenSlots` step is the location's granularity; horizon/timezone unchanged.
- **Gates green** incl. Preview app + portal smoke.

## Field 4. Verification (paste evidence)
The migration + CYAN + journal, the CB-hourly test, the LV-unchanged test + portal guard, the booking-integrity check, the Preview smoke, suite counts, the Preview URL (owner sees CB hourly + LV unchanged), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **One migration in flight, one PR in flight.**
- **PER-LOCATION per the ruling** - LV + the portal's LV behaviour MUST NOT change; a platform-wide change is rejected (it would halve LV/portal slots). Build the per-location toggle regardless of Q-W12-02.
- **`listOpenSlots` is the booking source of truth feeding the portal** - parameterise carefully, tenant-scoped, validated granularity; do NOT change the horizon/timezone.
- **Coupled-flags lesson:** the granularity column is a SEPARATE migration; do not fold into unrelated location migrations.
- **Migration ships tenant_id intact + RLS unchanged + a coverage test + a CYAN pre-merge audit**; live-apply manual (direct 5432). CB=60 seeding is owner-gated DATA. Cloud REAL DATA ONLY; verify on local `127.0.0.1` + Preview.
- pt-PT + en both; no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- The change would alter LV or the portal's LV slot behaviour - HALT (per-location, LV/portal unchanged is the ruling).
- The migration lacks its coverage test, or the granularity cannot be threaded through `listOpenSlots` tenant-scoped - HALT.
- Q-W12-02 (global vs per-location) is ruled GLOBAL after all - still build per-location + set 60 everywhere (no rework); do not hardcode a platform-wide step.

## Field 7. Report back
The migration + CYAN + journal, the CB-hourly test, the LV-unchanged test + portal guard, the Preview smoke, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-29 is OWNER-MERGE (migration + booking source of truth feeding the portal).** NOT `[SELF-MERGE-OK]`. Required checks + all three Vercel deploys green (checks API not banner) NECESSARY; **CYAN pre-merge audit mandatory**; the owner merges (OWNER VISUAL GATE on the CB-hourly agenda).
- One migration in flight, one PR in flight, fresh `origin/main`, never stacked. Workflow files never touched. HALT-LOUD on any LV/portal behaviour change or a missing coverage test.
