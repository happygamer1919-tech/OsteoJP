# Loop W8-01a - Services catalog + pack model schema + catalog seed (Wave 08 Dados e KPI)

GATE: **Wave 08 Dados e KPI, MIGRATION loop, RECON-FIRST, with a CATALOG OWNER CONFIRMATION HALT before any cloud write.** Delivers the pack model (net-new schema), reconciles the services catalog to the "offered only where priced" semantic on the EXISTING per-location price model, and seeds the owner's real catalog. **Runs AFTER W8-02 (`0036`) is merged and `origin/main` fast-forwarded** (one migration in flight). Starts from **fresh `origin/main`**; never stacked. **OWNER-MERGE with live-apply evidence**, and additionally a **CATALOG OWNER CONFIRMATION HALT** before the narrow cloud data write.

---

## AUTHORING RECON CORRECTION (read first - the briefing premise was partly wrong)

Two claims in the wave briefing were checked against `origin/main` at authoring (2026-07-15) and are corrected here so the executor does not re-build what already exists:

1. **Per-location pricing ALREADY EXISTS on main.** It is NOT a thing to "design and migrate" from scratch. The `service_location_prices` table is live (`packages/db/src/schema.ts:276-304`, migration `0007_service_location_prices.sql` present in BOTH `packages/db/migrations/` and `supabase/migrations/`), with a full read/write service layer in `apps/web/lib/admin/services.ts`: `resolveServicePriceCents()` (`~240-266`, override-then-base resolution), `listServiceLocationPrices()` (`~219-233`), `setServiceLocationPrices()` (`~273-344`), and an admin per-location price form already rendered in `apps/web/app/admin/services/page.tsx`. **The current model is an OVERRIDE layer:** `services.price_cents` (`schema.ts:251`, NULLABLE) is a base/catalog price and `services.location_id` (`schema.ts:246`, NULLABLE, "null = all locations"); a `service_location_prices` row for a `(service, location)` pair overrides the base for that location. So this loop EXTENDS the existing pricing, it does not create a price table.
2. **There is NO duplicate "Fisioterapia" row in the dev seed.** The dev seed (`packages/db/seed/dev-reference.ts:89-100`) has five clean services (Osteopatia, Fisioterapia, Massagem Terapeutica, Pilates Terapeutico, NESA), one row each, `onConflictDoNothing`. The briefing's "duplicate Fisioterapia rows (absorb that housekeeping)" is therefore not a dev-seed condition. If duplicates exist, they can only be in the LIVE tenant catalog (an earlier partial/placeholder import): the housekeeping is a LIVE-DB recon + reconcile-by-rename (never delete-recreate), see Scope step 5.

**What is genuinely net-new in this loop:** (a) the **pack model** (no pack/bundle/session-count table exists anywhere on main - confirmed by grep), and (b) the **"a service is offered ONLY at locations where a price exists" semantic**, which the current base-price-plus-override model does NOT encode today (a service with a base price is implicitly offered everywhere). Both are in scope. The scope is unchanged from the briefing; only the implementation path (extend, not re-create) is corrected to match ground truth.

---

## Field 1. Scope and ground truth

Recon the current services + per-location-price model, extend it so a service is offered only where a price exists, add a pack model (pack = a bookable service type linked to a base service with a session count and a pack price; plus per-patient pack instances tracking remaining sessions), and seed the owner's real catalog for both locations. All money is integer cents on the column (never float); a EUR 75.00 price seeds as `7500`.

Ground truth (recon at authoring 2026-07-15, embed - executor runs with ZERO memory):
- **`services` table (`packages/db/src/schema.ts:239-268`):** `id`, `tenantId` (not null, FK tenants, cascade), `locationId` (`schema.ts:246`, NULLABLE, "null = all locations"), `name` (not null), `description` (nullable), `durationMin` (default 60), `priceCents` (`schema.ts:251`, NULLABLE base price), `currency` (varchar(3) default EUR), `isActive` (default true), `contraindicationSensitive` (`schema.ts:257`, the NESA soft-warning flag, 0031 - do NOT repurpose), `createdAt`, `updatedAt`. Indexes on `tenant_id` and `(tenant_id, location_id)`.
- **`service_location_prices` table (`packages/db/src/schema.ts:276-304`):** `id`, `tenantId` (not null), `serviceId` (not null, FK services), `locationId` (not null, FK locations), `priceCents` (not null, cents), `currency` (char(3) default EUR), `isActive` (default true), `createdAt`. Unique `(tenant_id, service_id, location_id)`; check `price_cents >= 0`.
- **Services service layer (`apps/web/lib/admin/services.ts`):** `listServices()` (`~42-58`, returns ALL rows, no isActive filter, `ServiceView`), `createService()` (`~72-95`), `updateService()` (`~97-123`), `setServiceActive()` (`~127-146`, soft archive, never hard-delete), `deleteService()` (`~180-206`, reference-guarded hard delete), `getReferencedServiceIds()` (`~157-170`, checks appointments + therapistServices + serviceLocationPrices + analyticsEvents), `listServiceLocationPrices()` (`~219-233`), `resolveServicePriceCents()` (`~240-266`), `setServiceLocationPrices()` (`~273-344`).
- **Locations (`packages/db/src/schema.ts:219-237`) are a table, not an enum.** Dev seed (`packages/db/seed/dev-reference.ts:79-87`): **Linda-a-Velha** (`LOC_LAV = de000002-0000-0000-0000-000000000001`), **Castelo Branco** (`LOC_CB = de000002-0000-0000-0000-000000000002`), **Montemor-o-Novo** (`LOC_MTN = de000002-0000-0000-0000-000000000003`). This loop seeds LV + CB catalogs; Montemor has no catalog in the owner's data (do not invent one).
- **Appointments reference a service by `serviceId` (`packages/db/src/schema.ts:468`, NULLABLE FK services, NO ACTION).** Historic marcacoes point at existing service rows; those references MUST stay intact. Renames happen on the canonical `services` row (an UPDATE of `name`), NEVER by delete-and-recreate (which would orphan or break the FK and lose history).
- **No pack model exists** (grep for pack/bundle/session_count/packInstances returns nothing on main). This loop creates it.
- **Migrations:** BOTH `packages/db/migrations/` AND `supabase/migrations/`, lock-step numbers, plus the drizzle snapshot under `packages/db/migrations/meta/`. After W8-02 lands `0036`, **the next number is `0037`** (fetch + list both dirs at execution to confirm).

### CANONICAL CATALOG (GROUND TRUTH INPUT - owner confirms before any cloud write)

Transcribed from the owner's photographed price tables. Prices are EUR, stored as integer cents. This is the seed target for the LIVE tenant; the executor presents it back to the owner (the CATALOG OWNER CONFIRMATION HALT) before writing to the cloud.

**Location LV (Linda-a-Velha) - services, prices em vigor 2026-01-01:**
- 1a consulta/Avaliacao (Osteopatia ou Fisioenergetica/Kinesiologia/Posturologia) - 75.00
- Osteopatia - 70.00
- Fisioenergetica/Kinesiologia/Posturologia - 70.00
- R.P.G. Reeducacao Postural Global - 60.00
- Fisioterapia - 55.00
- Tratamento Terapeutico - 55.00
- Tratamento NESA - 50.00
- Drenagem Linfatica Manual (Metodo Wodere) - 60.00
- Pressoterapia/Drenagem Linfatica Mecanica - 35.00
- Pilates Terapeutico aula individual - 50.00
- Pilates mensal 1x/semana grupo (4 a 5 pessoas) - 125.00
- Pilates mensal 2x/semana grupo (4 a 5 pessoas) - 195.00

**Location LV (Linda-a-Velha) - packs:**
- Pacote 10 NESA - 390.00
- Pacote 5 Osteopatia - 325.00
- Pacote 10 Osteopatia - 595.00
- Pacote 5 Fisioterapia (2x semana) - 237.50
- Pacote 10 Fisioterapia (2x semana) - 450.00
- Pacote 5 Pressoterapia/Drenagem Linfatica Mecanica - 150.00
- Pacote 10 Drenagem Linfatica Manual (Metodo Wodere) - 500.00
- Pacote 10 Tratamento Terapeutico - 450.00

**Location CB (Castelo Branco) - services, prices em vigor 2026-03-02:**
- Osteopatia/Posturologia - 60.00
- Fisioterapia - 45.00
- Pressoterapia - 30.00
- Sessao Familia/Amigos (2 pessoas ao mesmo tempo) - 60.00
- Medicina Chinesa/Acupuntura - 45.00
- Massagem 4 Maos (2 terapeutas) - 70.00
- Pilates com Maquinas 1x/semana/mes - 125.00
- Pilates com Maquinas 2x/semana/mes - 195.00
- Pilates Aula Experimental (1a vez) - 20.00
- Pilates Aula Pontual - 35.00
- NESA - 50.00

**Location CB (Castelo Branco) - packs:**
- Fisioterapia 5 sessoes - 200.00
- Fisioterapia 10 sessoes - 350.00
- Pressoterapia 5 sessoes - 125.00
- Medicina Chinesa/Acupuntura 5 sessoes - 200.00
- Medicina Chinesa/Acupuntura 10 sessoes - 350.00
- NESA 10 sessoes - 350.00

**Business rule on record (MANUAL enforcement - the platform NEVER auto-charges):** a pack/group session counts as CONSUMED on a no-show or on a cancellation under 24h. This is enforced by staff using the manual adjust control (W8-01c), never by an automatic charge or auto-decrement rule in the platform.

**Not migrated (Fisiozero artifacts):** "Campo - R.P.G." is NOT a placeholder - R.P.G. (Reeducacao Postural Global) migrates as a real LV service (60.00, above). "campo 9 - Externos" IS a placeholder and is DROPPED (not migrated).

**Known catalog gaps (record in QUESTIONS.md for one owner/JP batch, do not invent prices):** CB is missing 1a consulta, Drenagem Linfatica Manual, Tratamento Terapeutico, and Osteopatia packs; LV is missing Medicina Chinesa, Massagem 4 Maos, and Sessao Familia. These are recorded as open questions, NOT seeded with guessed values.

### Schema design (this loop)

- **"Offered only where priced" semantic:** recon the cleanest way to encode it on the existing model. **Recommended default:** derive "offered at location L" from the PRESENCE of an active `service_location_prices` row for `(service, L)` - a service with no price row at a location is not offered there - and treat `services.price_cents` (the nullable base) as a fallback/default only, not as an implicit "offered everywhere" signal. If encoding this cleanly requires a DESTRUCTIVE change to the existing base-price model (e.g. dropping/repurposing `services.price_cents`, or backfilling/removing existing rows), that is OWNER-CONFIRMABLE and a HALT (Field 6), not a self-decided change - it touches live pricing behaviour. Prefer an additive, non-destructive encoding.
- **Pack model (net-new, migration `0037`):**
  - A **pack definition** table (e.g. `service_packs`): `id`, `tenant_id` (not null + RLS), `base_service_id` (FK services - the service each session draws down), `name`, `session_count` (integer, > 0), `price_cents` (integer cents), `currency`, location scoping consistent with the pricing model (a pack is offered at a location the same way a service is), `is_active`, timestamps. A pack is itself a bookable type.
  - A **per-patient pack instance** table (e.g. `patient_pack_instances`): `id`, `tenant_id` (not null + RLS), `patient_id` (FK patients), `pack_id` (FK service_packs), `sessions_total`, `sessions_remaining`, `purchased_at`/`created_at`, `status`, timestamps. Tracks the remaining sessions for one patient's purchase of one pack. Every new domain table ships `tenant_id` + an RLS policy + an isolation test in THIS PR (rule 1/2 + project RLS rule).
  - Decrement/registration/adjust LOGIC and booking wiring are W8-01c; this loop delivers the schema + seed only, but the tables must support them (a monotonic remaining count, a manual adjust audit trail).

### Seed (this loop)

- **Dry-run against local `127.0.0.1` first:** seed the full canonical catalog (LV + CB services + per-location prices + packs) into the local DB; paste the row counts (services created/renamed, service_location_prices rows, packs). Money as cents.
- **CATALOG OWNER CONFIRMATION HALT:** present the final catalog back to the owner as a table (name, location, price, type service|pack, sessions for packs) exactly as it will be written. The owner confirms the transcription before ANY cloud write. This is a hard stop (Field 6).
- **One authorized narrow cloud write:** after owner confirmation, write the catalog to the LIVE tenant in one narrow, audited operation; paste the row counts. Renames land on the canonical `services` rows (UPDATE name), never delete-recreate; historic `appointments.serviceId` references stay intact. Placeholder rows (e.g. "campo 9 - Externos") are deactivated/removed only if unreferenced (reuse `getReferencedServiceIds` + the reference-guarded delete path); a referenced placeholder is renamed, not deleted.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` already contains W8-02's `0036` (this loop runs after it); `git worktree add ../osteojp-w8-01a-services-catalog-packs origin/main -b osteojp-w8-01a-services-catalog-packs`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **RECON, report first:** confirm the services + service_location_prices model, the resolve/set price seams, the absence of a pack model, the exact next migration number (fetch + list both dirs, expected `0037`), and how appointments reference services. Paste findings. Confirm the LIVE catalog state (duplicates? placeholders? what exists vs the canonical catalog) read-only.
3. **Migration `0037` (both dirs + snapshot):** the two pack tables (+ RLS + isolation test) and any additive column(s) needed for the "offered only where priced" encoding. No destructive change to `services.price_cents` without a Field-6 HALT.
4. **Service layer:** extend `apps/web/lib/admin/services.ts` (or a sibling packs module) with pack CRUD + an "is this service offered at location L" resolver built on `service_location_prices` presence. Reuse the existing price resolver. Audited (rule 6).
5. **Seed dry-run (local 127.0.0.1):** seed the full catalog; paste row counts. Renames via UPDATE, never delete-recreate. Drop "campo 9 - Externos" only if unreferenced; migrate R.P.G. as a real service.
6. **CATALOG OWNER CONFIRMATION HALT:** present the final catalog table; owner confirms; ONLY THEN the one narrow cloud write; paste cloud row counts.
7. **QUESTIONS:** record the known catalog gaps (CB missing 1a consulta / Drenagem Linfatica Manual / Tratamento Terapeutico / Osteopatia packs; LV missing Medicina Chinesa / Massagem 4 Maos / Sessao Familia) as one owner/JP batch. Record the pack no-show/under-24h business rule as a MANUAL-enforcement decision (DECISIONS).
8. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation for BOTH new pack tables + a test that "offered" tracks price presence + historic serviceId references survive a rename), `pnpm build`, `pnpm test:e2e` where a user-facing surface changed. JSON.parse both i18n files in the gate. W5-13 `ficha-medica-compat.test.ts` is not touched by this loop (no ficha/template change) - state that.
9. **Live-apply evidence (OWNER-MERGE):** apply `0037` to the live DB, paste applied-migration evidence (both pack tables + RLS present), THEN the catalog write evidence, THEN the owner merges. Fetch-and-fast-forward before each live-DB operation.

## Field 3. Definition of done (machine-verifiable)
- **Migration PROOF:** `0037` present in BOTH migration dirs (same number) + snapshot; the two pack tables each carry `tenant_id` + an RLS policy + an isolation test in this PR. Paste the diff + the two isolation tests passing. NO `.github/workflows/` file in the diff.
- **Offered-only-where-priced PROOF:** a service with no active `service_location_prices` row at a location is NOT offered there; a service with one IS. Paste the resolver test. NO destructive change to `services.price_cents` (or, if one was unavoidable, it went through a Field-6 owner HALT - reference it).
- **Rename-not-recreate PROOF:** a canonical service rename preserves historic `appointments.serviceId` references (no orphan, no delete-recreate). Paste the test.
- **Seed dry-run PROOF (local):** row counts for services (created/renamed), service_location_prices, and packs against `127.0.0.1`. Paste them.
- **CATALOG OWNER CONFIRMATION PROOF:** the final catalog table presented to the owner + the owner's confirmation recorded, BEFORE the cloud write.
- **Cloud write PROOF (OWNER-MERGE):** the narrow, audited cloud write row counts, pasted before the owner merges; historic references intact.
- **Gaps PROOF:** the QUESTIONS entry listing the CB + LV catalog gaps; the DECISIONS entry recording the pack no-show/under-24h MANUAL-enforcement rule. Paste both.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The recon report + LIVE catalog read-only state, the `0037` diff + both isolation tests, the offered-only-where-priced + rename-not-recreate tests, the local seed row counts, the catalog table + owner confirmation, the cloud write row counts, the QUESTIONS gaps entry + DECISIONS business-rule entry, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (which already contains W8-02's `0036`). **One migration in flight:** W8-01a's `0037` runs only after `0036` merged. **Fetch-and-fast-forward before EACH live-DB operation.**
- **Extend, do not re-create, the pricing model.** `service_location_prices` + the price resolver already exist. No destructive change to `services.price_cents` without an owner HALT.
- **Money is integer cents on the column, never float** (75.00 -> 7500). Currency on the column.
- **Renames on the canonical `services` row (UPDATE name), NEVER delete-and-recreate.** Historic `appointments.serviceId` references must survive. Reference-guarded delete only for unreferenced placeholders.
- **No cloud write before the CATALOG OWNER CONFIRMATION HALT.** SYNTHETIC/local data for the dry-run; the single cloud write is the ONLY authorized live write and only after owner confirmation.
- **Do NOT invent prices for the known gaps** (CB 1a consulta, etc.); record them in QUESTIONS.
- Every new domain table ships `tenant_id` + RLS + an isolation test in this PR (rule 1/2 + project RLS rule). DB access only through `packages/db`. Audit mutations (rule 6). PII never logged (rule 7).
- pt-PT i18n (both files, keep-both on rebase, JSON.parse both); no emoji; UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. **SYNTHETIC-DATA-ONLY for verify** (the cloud catalog write is the single authorized exception, gated by owner confirmation).
- **Standing test-data rule (Wave 08):** never run destructive QA against patient **Maria Joao Silva** (`triboimax635+maria@gmail.com`); use **disposable test patients only**; the reference therapist for tests is **Tiago Reis**.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT yet contain W8-02's `0036` (this loop must run after it).
- Encoding "offered only where priced" requires a DESTRUCTIVE change to `services.price_cents` or existing pricing rows - HALT (owner-confirmable, live pricing behaviour), do not self-decide.
- The LIVE catalog recon finds duplicates/placeholders whose reconciliation would DELETE a service still referenced by historic marcacoes - HALT; reconcile by rename, never by delete-recreate.
- The pack model would need more than the two tables described, or a change to appointments/marcacoes beyond a nullable link - HALT and re-scope (W8-01c owns the booking link).
- The owner does NOT confirm the catalog at the CONFIRMATION HALT, or the transcription has a discrepancy - HALT; do not write to the cloud on unconfirmed data.
- The live-apply or catalog write cannot run (DB access blocked / credentials only the owner holds) - HALT with the exact blocker; the owner applies + merges.
- A second migration would be needed - HALT (this loop is one migration).

## Field 7. Report back
The recon report + LIVE catalog state, the `0037` diff + isolation tests, the semantic + rename tests, the local seed counts, the catalog confirmation, the cloud write counts, the QUESTIONS + DECISIONS entries, suite counts, PR number.

## Merge policy (embed, Wave 08 Dados e KPI)
- **W8-01a is OWNER-MERGE (migration loop) AND carries the CATALOG OWNER CONFIRMATION HALT.** All required checks green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) green, read from the checks API NOT the banner, is NECESSARY. Additionally: (1) the catalog is confirmed by the owner BEFORE the cloud write, and (2) the `0037` live-apply + catalog write evidence is pasted BEFORE the owner merges. GREEN NEVER self-merges.
- **One migration in flight:** W8-01a's `0037` starts only after W8-02's `0036` merged and `origin/main` is fast-forwarded. Never stacked, strict sequence, fresh `origin/main` after each merge. W8-01b + W8-01c (migration-free, GREEN self-merge) run only after W8-01a merged.
- Workflow files are NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/data/reality mismatch; any immutability-bypass claim escalates instantly.

---

## POST-EXECUTION NOTE (2026-07-15) — cloud seed done, 3 legacy rows frozen (Option A amended)

Owner-confirmed cloud seed applied: 22 canonical / 23 prices / 14 packs / 3 frozen legacy
(total 25 services on tenant OsteoJP), reconciled by rename-not-recreate (marcação references
intact). Three pre-existing ambiguous rows were DEACTIVATED, not mapped: "Pilates Terapêutico"
(40.00), "NESA" (39.00), "Massagem Terapêutica" (50.00). **Expected end state after the JP
batch: each legacy row is either MAPPED onto a canonical row (rename, never delete-recreate) or
DROPPED, by explicit owner instruction.** Tracked in docs/QUESTIONS.md 2026-07-15 (JP BATCH).
