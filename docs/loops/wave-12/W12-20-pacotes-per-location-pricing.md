# Loop W12-20 - Pacotes per-location pricing parity (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, FEATURE, migration-gated. OWNER-MERGE (migration). OWNER VISUAL GATE surface. CYAN pre-merge audit mandatory.** Servicos has per-location pricing (`service_location_prices`); Pacotes (`service_packs`) does not. Give Pacotes the same per-location pricing capability, mirroring the services pattern. One migration in flight, one PR in flight. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Add a per-location price override for packs mirroring `service_location_prices`, its "gerir" UI on `/admin/services`, and its resolution semantics (override wins, else inherit the pack base price). Reuse the services pattern; do not invent a new shape.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **Servicos per-location pricing EXISTS as an override junction:** `service_location_prices` (`schema.ts:285-313`, migration 0007) - `(service_id, location_id, price_cents NOT NULL, is_active)`, unique `(tenant_id, service_id, location_id)`; a row WINS for that (service, location), absent -> inherit `services.price_cents`; `is_active` toggles the override off. UI: `apps/web/app/admin/services/page.tsx:207-214` (`price__<locationId>` inputs) -> `setServiceLocationPricesAction` (`actions.ts:111-125`) -> `setServiceLocationPrices` (`services.ts:325-395`, null clears -> DELETE, non-null upserts).
- **Pacotes = `service_packs`, single price, NO per-location override:** `service_packs` (`schema.ts:322-351`, migration 0037) has ONE `price_cents NOT NULL` + ONE `location_id` (null=all); there is NO `service_pack_location_prices` table. UI: same page `PacksSection` (`page.tsx:289-...`), single `price` + single `locationId` (`page.tsx:337-356`); domain `apps/web/lib/admin/packs.ts` (single `priceCents`/`locationId`). Actions `createPackAction`/`updatePackAction`/... (`actions.ts:132-170`).
- **Parity target:** a `service_pack_location_prices` table mirroring `service_location_prices` (`(pack_id, location_id, price_cents NOT NULL, is_active)`, unique `(tenant_id, pack_id, location_id)`, `tenant_id` + RLS + FK `ON DELETE no action` to keep history-safe), a resolver (override wins, else `service_packs.price_cents`), a per-location price grid in `PacksSection` mirroring the services grid, and consumption wherever a pack price is displayed/charged. Decouple from the pack's single `price_cents` (keep it as the base/fallback; do not fold the migration into 0037's shape edits).

**Scope:** one migration (the pack price-override table + RLS + isolation test in-PR) + the resolver + the admin grid + consumers + tests. One migration in flight; head advances by one; manual `drizzle-kit` direct apply (5432, cwd `packages/db`). Verify on local + Preview; cloud REAL DATA ONLY.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-20-pacotes-prices`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Migration:** add `service_pack_location_prices` mirroring `service_location_prices` (tenant_id, pack_id FK, location_id FK, price_cents NOT NULL, is_active, unique `(tenant_id, pack_id, location_id)`, FK `ON DELETE no action`), mirrored in `packages/db/migrations/` + `supabase/migrations/`, with RLS keyed on the tenant claim + an isolation test in the SAME PR.
3. **Resolver + domain:** a `setPackLocationPrices` mirroring `setServiceLocationPrices` (null clears -> DELETE, non-null upserts) + a pack-price resolver (override wins, else base).
4. **UI:** a per-location price grid in `PacksSection` mirroring the services grid (`price__<locationId>` inputs) + its action; update every pack-price consumer to use the resolver.
5. **CYAN pre-merge audit** (migration); manual live-apply journal; Preview smoke.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation), `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` scoped.

## Field 3. Definition of done (machine-verifiable)
- **Migration PROOF:** `service_pack_location_prices` created (mirror parity to `service_location_prices`); isolation test in-PR; CYAN CLEAN; manual live-apply journal; head +1.
- **Resolver PROOF:** a test shows override wins for its (pack, location), else the pack base price is used; null clears the override.
- **UI PROOF:** an e2e sets a per-location pack price in `/admin/services` and asserts it resolves for that location.
- **Parity PROOF:** the pack override shape/behaviour matches `service_location_prices` (paste the two schemas side by side).
- **Gates green** incl. RLS isolation + Preview smoke.

## Field 4. Verification (paste evidence)
The migration + isolation test + CYAN + journal, the resolver test, the per-location pack-price e2e, the parity comparison, the Preview smoke, suite counts, the Preview URL + steps, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **One migration in flight, one PR in flight.**
- **Mirror the services pattern**; do not invent a divergent per-location shape; keep the pack's single `price_cents` as the base/fallback (decoupled; coupled-flags lesson).
- **Migration ships tenant_id + RLS + an isolation test in-PR + a CYAN pre-merge audit**; FK `ON DELETE no action` (history-safe); live-apply manual (direct 5432, cwd `packages/db`).
- Cloud REAL DATA ONLY; verify on local `127.0.0.1` + Preview; money = integer cents, currency on the column, never floats; pt-PT + en both; no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- The pack price-override migration lacks its RLS isolation test - HALT.
- Per-location pack pricing cannot mirror the services shape cleanly (e.g. packs need a different resolution rule) - HALT to a Q with the finding + recommended default (mirror services exactly).
- It cannot fit one migration / one PR - SPLIT (do not stack).

## Field 7. Report back
The migration + isolation test + CYAN + journal, the resolver test, the per-location pack-price e2e, the parity comparison, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-20 is OWNER-MERGE (migration).** NOT `[SELF-MERGE-OK]`. Required checks (DB-gated tests incl. RLS isolation, Lint+typecheck+test, Playwright E2E) + all three Vercel deploys green (checks API not banner) NECESSARY; **CYAN pre-merge audit mandatory**; the owner merges (OWNER VISUAL GATE on the pricing grid).
- One migration in flight, one PR in flight, fresh `origin/main`, never stacked. Workflow files never touched. HALT-LOUD on missing isolation test.
