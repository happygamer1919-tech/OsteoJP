# W12-03 - Serviços delete + Pilates-to-Pacotes: data plan (Part B, OWNER-GATED)

Status: **Part A (code) shipped in this PR. Part B (real-prod data writes) BLOCKED and HALTED** pending three gates (below). No production data was read or written by GREEN.

## Part A - code (shipped, this PR)
- `deleteService` now cascades a service's OWN `service_location_prices` rows (config) inside the delete tx, then hard-deletes, **iff** the real-history guard set is empty. Guard set (never cascaded): `appointments`, `therapist_services`, `analytics_events`, `service_packs.base_service_id`. `service_location_prices` is no longer a blocker (it was, which is why every catalog service was archive-only).
- The Admin > Serviços blocked-delete tooltip now NAMES the blocking class ("tem marcações" / "está associado a terapeutas" / "tem registos de estatística" / "está num pacote").
- Pure decision unit tests: `apps/web/lib/admin/service-delete.test.ts` (own-price-only deletable; real-history stays guarded; names the blocker in order).
- Net effect: a service blocked ONLY by its own price overrides (Rodica's archived "-" services, IF history-free) becomes deletable through the normal Admin control; anything with real history stays archive-only with a legible reason.

## Part B - the data actions (BLOCKED - do NOT execute without all three gates)

### Gate 1 - owner authorization phrase (absent)
Real-prod data writes require an explicit owner authorization phrase for this data window (W10-02 discipline). None supplied. No prod write occurs without it.

### Gate 2 - local rehearsal (blocked: local Supabase down)
The plan must be rehearsed on local `127.0.0.1` (seed equivalents, run the ops, verify per-row before/after, prove zero appointment/analytics harm) BEFORE any prod apply. The local Docker/Supabase stack is currently DOWN, so the rehearsal cannot run yet. Bring the stack up (`supabase db reset` + `node apps/web/e2e/seed/seed-e2e.mjs` or the dev seed) to rehearse.

### Gate 3 - prod diagnosis access (absent)
The exact 3 "-" services are Rodica's archived+renamed rows; GREEN has no prod credentials (secrets live in Vercel/Supabase dashboards) and the cloud is READ-ONLY / real-data-only. The owner (or a read-only prod query) must enumerate them + their per-guard-class reference breakdown.

## B1 - remove the 3 archived "-" services (if history-free)
1. Enumerate (read-only, prod): `services` where `name = '-'` AND `is_active = false` (tenant-scoped). For each, count references per guard class: `appointments`, `therapist_services`, `analytics_events`, `service_packs.base_service_id`, and `service_location_prices` (config).
2. Decision per service:
   - **History-free** (only `service_location_prices`, or nothing): deletable via the Part-A path (Admin > Serviços > Eliminar, now enabled), which removes its price overrides + the row in one tx. Record before/after: `services` count -1, its `service_location_prices` rows -N, all guard tables unchanged.
   - **Carries appointments / analytics / therapist_services / pack**: CANNOT be hard-deleted. Archive is its terminal state. HALT to a Q with the finding (loop Field 6). Never cascade history.
3. Owner visual-checks the 3 are gone from Serviços; the agenda/estatística are unaffected.

## B2 - move the 2 LAV Pilates group services to Pacotes
Targets (from `packages/db/seed/wave08-catalog.ts:63-64`, Linda-a-Velha):
- "Pilates mensal 1x/semana - grupo" - 12500 cents (EUR 125,00)
- "Pilates mensal 2x/semana - grupo" - 19500 cents (EUR 195,00)

These are `services` rows, not packs. Move = create `service_packs` rows + archive the originating services (do NOT hard-delete if they carry appointment/analytics history).

- **Per-location pricing:** NOT needed. Both are LAV-only (single location); `service_packs` carries a single `price_cents` + single `location_id`, which fits. So there is **no W12-20 dependency** for these two (W12-20 per-location pack pricing is irrelevant to single-location packs).
- **OPEN DECISION - session_count (owner/Rodica):** `service_packs.session_count` is required (> 0). Recommended default: **1x/semana = 4 sessions/month, 2x/semana = 8 sessions/month.** Confirm with Rodica before creating the pack rows; do not guess if she uses a different monthly count.
- **base_service_id:** the pack's `base_service_id` must point at an ACTIVE service (a Pilates session service). If the originating "grupo" service is archived, the pack still needs a valid base service - confirm which service each pack decrements (owner), or keep the base service active-but-not-directly-bookable.
- Steps: create the 2 `service_packs` rows (name, session_count, price_cents, location_id = LAV, base_service_id); archive the 2 originating `services` rows (is_active=false; never hard-delete history-bearing rows). Per-row before/after: `service_packs` +2, `services` (the 2) is_active true->false, guard tables unchanged. Owner sees the 2 as Pacotes.

## Discipline for the prod window (when unblocked)
Per-row before/after counts pasted; HALT-on-mismatch (any count off by an unexpected row aborts the window); zero writes to any guard table; no PII in logs; OLD project never touched. NEW prod strings only (`dfotoodqvmjhbdcxyaxf` @ `aws-0-eu-central-1.pooler.supabase.com`).
