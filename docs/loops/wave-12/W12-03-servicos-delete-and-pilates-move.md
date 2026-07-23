# Loop W12-03 - Servicos delete diagnosis + remove 3, move 2 Pilates to Pacotes (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, DEFECT + DATA. OWNER-MERGE (real-prod data action). Migration-free code; data writes owner-gated.** CB: 3 services cannot be deleted (Rodica archived + renamed "-"); also move 2 Pilates services from Servicos to Pacotes. Recon shows service delete is reference-GUARDED BY DESIGN (not a bug); the 3 are blocked by their own per-location price rows. Diagnose, make the blocked-delete UX name the blocker, safely remove the 3 if truly reference-free-after-cleanup, and re-model the 2 Pilates as packs. Starts from **fresh `origin/main`**; one PR/one data window in flight; never stacked.

## Field 1. Scope and ground truth

Two parts: (A) a CODE clarification of the guarded-delete path (name the blocking reference; optionally allow deleting a service's OWN config-only price overrides as part of its delete), migration-free; (B) a DATA action on real prod - remove the 3 archived "-" services if they are safely reference-free after config cleanup, and move the 2 Pilates grupo services to Pacotes (`service_packs`). Part B is owner-gated (real data), rehearsed on local first.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **Delete is a reference-GUARDED hard delete (owner ruling 2026-07-06), working as designed:** `apps/web/lib/admin/services.ts:180-206` (`deleteService`) throws `AdminError("has_references")` if ANY row references the service; only zero-reference services are hard-deleted. UI disables the control with `admin.services.deleteBlockedTooltip` (`apps/web/app/admin/services/page.tsx:181-197`). Guard set = `getReferencedServiceIds` (`services.ts:157-169`): `appointments.service_id`, `therapist_services.service_id`, `service_location_prices.service_id`, `analytics_events.service_id` - all FK `ON DELETE no action` (migrations `0000:193`, `0023:40`, `0007:15`, `0025:53`). `service_packs.base_service_id` (`0037:66`) also blocks at DB level.
- **Why Rodica's 3 cannot delete:** any service with a `service_location_prices` override row (every seeded catalog service has one) trips `has_references` on that alone -> she archived (`is_active=false`) + renamed "-" instead. `service_location_prices` rows are CONFIG (a price override), not clinical/booking history; `appointments`/`analytics_events`/`therapist_services` are the history that must NEVER be cascaded.
- **Recommended default (code, migration-free):** (1) the blocked-delete tooltip/message NAMES which reference class blocks (e.g. "tem marcacoes" vs "tem precos por local" vs "esta num pacote"), so archive-vs-delete is legible; (2) OPTIONALLY, in `deleteService`'s tx, delete the service's OWN `service_location_prices` rows first (config, safe) and then hard-delete IFF the remaining guard set (`appointments`/`analytics_events`/`therapist_services`/`service_packs`) is empty - so a service blocked ONLY by its own price overrides becomes deletable, while any with real history stays archive-only. Do NOT touch the appointments/analytics/therapist_services/pack guards.
- **The 3 services + the 2 Pilates are REAL prod data:** the Pilates targets are seed `CATALOG_SERVICES` (`packages/db/seed/wave08-catalog.ts:63-64`, LAV: "Pilates mensal 1x/semana - grupo" 12500, "Pilates mensal 2x/semana - grupo" 19500), i.e. `services` rows, not packs. Moving them to Pacotes = create `service_packs` rows (session_count + price; `service_packs` has a single `price_cents` + single `location_id`, `schema.ts:322-351`) and archive the originating `services` rows (do NOT hard-delete a service that has appointment/analytics history).
- **Every real-prod write is owner-gated + rehearsed on local:** the exact rows (the 3 to remove, the 2 to re-model) are enumerated, rehearsed on local `127.0.0.1`, then applied to prod ONLY under an explicit owner authorization phrase, per-row before/after counts, HALT-on-mismatch (the W10-02 discipline). If any of the 3 turns out to have appointment/analytics history, it CANNOT be hard-deleted - archive stays its terminal state; HALT to a Q.

**Scope:** (A) `apps/web/lib/admin/services.ts` + the blocked tooltip i18n (both files) + tests; (B) a documented, owner-gated data plan (`docs/recon/W12-03-servicos-data-plan.md`) enumerating the 3 removals + the 2 Pilates re-models, rehearsed on local, applied to prod under owner authorization with pasted before/after counts. ZERO migration/workflow. Part B never runs without the owner phrase.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-03-servicos`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Diagnose (read-only):** confirm the guard set + that each of the 3 "-" services is blocked, and by WHICH reference class (query counts per guard table for each). Confirm the 2 Pilates services' ids + that they are `services` rows. Write `docs/recon/W12-03-servicos-data-plan.md` with the enumerated rows + per-service reference breakdown.
3. **Code (Part A, migration-free):** make the blocked-delete message name the blocking class (i18n both files); OPTIONALLY extend `deleteService` to remove the service's own `service_location_prices` rows in-tx then hard-delete iff the real-history guard set is empty. Add unit tests: (a) a service blocked only by its own price overrides becomes deletable; (b) a service with appointments/analytics/therapist_services/pack stays `has_references`; (c) the message names the blocker.
4. **Rehearse Part B on local `127.0.0.1`:** seed equivalents of the 3 + the 2 Pilates; run the removal + the pack re-model; verify per-row before/after counts + that no appointment/analytics row was harmed. Paste the rehearsal.
5. **Apply Part B to prod - OWNER-GATED:** ONLY after the owner supplies the exact authorization phrase for this data window, apply the enumerated removals + Pilates re-models to prod, per-row before/after counts, HALT-on-mismatch; the pack rows created + the originating services archived (never hard-deleted if they carry history). Paste the prod before/after.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` shows only `apps/web/lib/admin/services.ts` (+ page tooltip), the two i18n files, tests, and the data-plan doc - ZERO migration/workflow.

## Field 3. Definition of done (machine-verifiable)
- **Diagnosis PROOF:** per-service reference breakdown for the 3 "-" services (which guard class blocks each); the data-plan doc committed.
- **Code PROOF:** the three unit tests (own-price-only deletable; real-history stays guarded; message names the blocker) green; the tooltip/message diff pasted.
- **Rehearsal PROOF:** local before/after counts for the 3 removals + 2 Pilates re-models, showing zero appointment/analytics harm.
- **Prod-apply PROOF (owner-gated):** the owner authorization phrase quoted; prod per-row before/after counts; the 2 pack rows created; the originating services archived; HALT-on-mismatch not triggered.
- **No-schema PROOF:** `git diff --name-only origin/main` ZERO migration/workflow.
- **Gates green.**

## Field 4. Verification (paste evidence)
The reference breakdown + data plan, the three unit tests, the local rehearsal counts, the owner-gated prod before/after counts, the no-schema diff, suite counts, preview URL (owner sees the 3 gone + the 2 Pilates as Pacotes), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Migration-free:** the code change is guard/tx logic + i18n only; no schema/column/enum/migration.
- **NEVER cascade appointment/analytics/therapist_services/pack references** - only a service's OWN `service_location_prices` config rows may be removed as part of its delete; a service with real history stays archive-only.
- **Part B is a REAL-PROD data write - owner-gated.** No prod write without the explicit owner authorization phrase; rehearse on local `127.0.0.1` first; per-row before/after + HALT-on-mismatch (W10-02 discipline). The cloud is REAL DATA ONLY; synthetic stays on local.
- **CYAN pre-merge audit is NOT required** (no migration, no RLS) but the prod data window is owner-gated regardless.
- pt-PT diacritics; both i18n files JSON.parse; no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.** No PII in logs.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- Any of the 3 "-" services has appointment/analytics/therapist_services history (not just its own price overrides) - it CANNOT be hard-deleted; archive is its terminal state; HALT to a Q with the finding.
- The owner authorization phrase for the prod data window is absent - do Part A (code) + the local rehearsal + the plan, and HALT Part B (no prod write).
- Moving the 2 Pilates to Pacotes appears to need per-location pack pricing (which Pacotes lacks; that is W12-20) - HALT to a Q on whether the Pilates packs need per-location prices before the move, or move at the single price now.

## Field 7. Report back
The reference breakdown, the code + tests, the local rehearsal, the owner-gated prod counts, the no-schema diff, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-03 is OWNER-MERGE (real-prod data action).** Even though the CODE is migration-free and non-visual, Part B writes real production data, so the loop is owner-merge, NOT `[SELF-MERGE-OK]` (owner ruling 2026-07-23 reserves self-merge for backend defects with NO data/prod action). Required checks + all three Vercel deploys green (checks API not banner) are necessary; the owner authorizes the data window and merges.
- Runs after the visual defects, fresh `origin/main`, one PR + one data window in flight, never stacked. Workflow files never touched. HALT-LOUD on any history-bearing service or a missing authorization phrase.
