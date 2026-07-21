# Loop W10-04b - Catalogo precos reais (Wave 10 Dados Reais e Isolamento)

GATE: **Wave 10 Dados Reais e Isolamento, CATALOG RECONCILIATION, two-phase, OWNER-GATED CATALOG WRITE WINDOW, OWNER-MERGE.** Reconciles the cloud service catalog (services, per-location prices, packs) against the clinic's OFFICIAL printed price lists (embedded below, authoritative for names and prices). **Phase 1 is read-only** (delta report). **Phase 2 writes ONLY after the owner replies `AUTORIZO CATALOGO plan vN`** - a SECOND authorized cloud-write window, distinct from the spent `AUTORIZO LIMPEZA` window, and **catalog tables ONLY**. Runs strictly AFTER W10-04c merged and BEFORE W10-05 starts. Starts from **fresh `origin/main`**; never stacked.

**Standing-rule note (not a violation):** the cloud is REAL-DATA-ONLY (W10-02). The catalog (services / prices / packs) IS real clinic data - reconciling it to the official price lists is legitimate real-data maintenance, NOT synthetic data. **Any step touching a PATIENT-DOMAIN table (patients, appointments, clinical_records, episodes, notes, pack_instances, etc.) is an instant VIOLATION and a HALT.**

---

## OFFICIAL PRICE LISTS (authoritative for names + prices; money in integer cents; durations are NOT on the lists)

**LINDA-A-VELHA (LV / `LOC_LAV`), em vigor 2026-01-01 - services:**
| Printed name | Price | Cents |
|---|---|---|
| 1a consulta / Avaliacao (Osteopatia, Fisioenergetica/Kinesiologia/Posturologia) | 75,00 | 7500 |
| Osteopatia | 70,00 | 7000 |
| Fisioenergetica/Kinesiologia/Posturologia | 70,00 | 7000 |
| R.P.G. Reeducacao Postural Global | 60,00 | 6000 |
| Fisioterapia | 55,00 | 5500 |
| Tratamento Terapeutico | 55,00 | 5500 |
| Tratamento NESA | 50,00 | 5000 |
| Drenagem Linfatica Manual (Metodo Wodere) | 60,00 | 6000 |
| Pressoterapia/Drenagem Linfatica Mecanica | 35,00 | 3500 |
| Pilates Terapeutico Aula individual | 50,00 | 5000 |
| Pilates mensal 1x semana grupo 4-5 pessoas | 125,00 | 12500 |
| Pilates mensal 2x semana grupo 4-5 pessoas | 195,00 | 19500 |

**LV - packs (base service in parentheses is the executor's mapping to confirm, not on the printed list):**
| Printed name | Price | Cents |
|---|---|---|
| 10 sessoes NESA | 390,00 | 39000 |
| 5 sessoes Osteopatia | 325,00 | 32500 |
| 10 sessoes Osteopatia | 595,00 | 59500 |
| 5 sessoes Fisioterapia 2x semana | 237,50 | 23750 |
| 10 sessoes Fisioterapia 2x semana | 450,00 | 45000 |
| 5 sessoes Pressoterapia/Drenagem Linfatica Mecanica | 150,00 | 15000 |
| 10 sessoes Drenagem Linfatica Manual (Metodo Wodere) | 500,00 | 50000 |
| 10 sessoes Tratamento Terapeutico | 450,00 | 45000 |

**CASTELO BRANCO (CB / `LOC_CB`), em vigor 2026-03-02 - services:**
| Printed name | Price | Cents |
|---|---|---|
| Osteopatia/Posturologia | 60,00 | 6000 |
| Fisioterapia | 45,00 | 4500 |
| Pressoterapia | 30,00 | 3000 |
| Sessao Familia/Amigos (2 pessoas ao mesmo tempo) | 60,00 | 6000 |
| Medicina Chinesa/Acupuntura | 45,00 | 4500 |
| Massagem 4 Maos (2 terapeutas) | 70,00 | 7000 |
| Pilates com Maquinas 1x/semana/mes | 125,00 | 12500 |
| Pilates com Maquinas 2x/semana/mes | 195,00 | 19500 |
| Pilates Aula Experimental (1a vez) | 20,00 | 2000 |
| Pilates Aula Pontual | 35,00 | 3500 |
| NESA | 50,00 | 5000 |

**CB - packs:**
| Printed name | Price | Cents |
|---|---|---|
| Fisioterapia 5 sessoes | 200,00 | 20000 |
| Fisioterapia 10 sessoes | 350,00 | 35000 |
| Pressoterapia 5 sessoes | 125,00 | 12500 |
| Medicina Chinesa/Acupuntura 5 sessoes | 200,00 | 20000 |
| Medicina Chinesa/Acupuntura 10 sessoes | 350,00 | 35000 |
| NESA 10 sessoes | 350,00 | 35000 |

**Durations:** NOT on the printed lists. Existing platform durations (`services.duration_min`, default 60) STAY unchanged. Flag ONLY services whose `duration_min` is missing/null (none expected, since the column defaults to 60) - do not invent durations.

---

## Field 1. Scope and ground truth

Reconcile the cloud catalog to the official lists per location, in two phases: Phase 1 produces a versioned DELTA REPORT (read-only); Phase 2, only after `AUTORIZO CATALOGO plan vN`, applies exactly the approved plan to the CATALOG TABLES ONLY. Each location keeps its OWN prices (cross-location pricing ruling, Q-W8-01-1 CLOSED 2026-07-21: printed lists authoritative; a service absent from a location's list is NOT offered there). Money is integer cents.

Ground truth (recon at authoring 2026-07-21, embed - the executor verifies + extends read-only, executor runs with ZERO memory; all file:line refs verified at authoring):

- **Catalog model (three tables, `packages/db/src/schema.ts`):**
  - **`services`** (`:248-277`): `location_id` nullable (`:255`, "null = all locations"), `price_cents` nullable base (`:260`), `currency` (`:261`), `is_active` (`:262`), `duration_min` default 60 (`:259`), `contraindication_sensitive` (`:266`).
  - **`service_location_prices`** (`:285-313`): the per-location price OVERRIDE - `service_id` + `location_id` + `price_cents` + `is_active`, UNIQUE `(tenant_id, service_id, location_id)` (`:305-309`). **"Offered at location L" = an ACTIVE `service_location_prices` row exists for `(service, L)`** (`isServiceOfferedAtLocation`, `apps/web/lib/admin/services.ts:277-297`; deliberately does NOT consult the base `services.price_cents`). Added by migration `0007`.
  - **`service_packs`** (`:322-351`): **HAS a nullable `location_id`** (`:332`, "null = all locations"), `base_service_id` (`:329`), `session_count` (`:334`, `> 0`), `price_cents` (`:335`), `is_active` (`:337`). Added by migration `0037` (head).
- **PER-LOCATION PACK PRICING IS NATIVELY SUPPORTED (confirmed, NOT a feature gap):** a pack is scoped to a location by its own `service_packs.location_id`, and the price is on the pack row (`price_cents`). The exact scenario - **LV "10 sessoes NESA" 39000 vs CB "NESA 10 sessoes" 35000** - is two DISTINCT location-scoped rows, and is ALREADY seeded that way (`packages/db/seed/wave08-catalog.ts:81` LV Pacote 10 NESA 39000 / `:95` CB NESA 10 sessoes 35000). There is NO `service_pack_location_prices` side table and none is needed. **So per-location pack pricing does NOT need a feature question; state it as supported and reconcile packs per location as separate rows.**
- **Service layer (`apps/web/lib/admin/`):** `services.ts` - `resolveServicePriceCents` (`:240-266`, override-then-base), `setServiceLocationPrices` (`:325-396`, upsert on the unique or clear-to-base, one audit row), `isServiceOfferedAtLocation` (`:277-297`), `listServiceOfferings` (`:305-318`), `getReferencedServiceIds` (`:157-170`, the 4 FK relations into `services.id`: appointments, therapist_services, service_location_prices, analytics_events). `packs.ts` - `listPacks` (`:40-57`), `createPack` (`:84-112`, `location_id` from input), `updatePack` (`:114-139`), `setPackActive`, `getReferencedPackIds` (`:161-169`, via `patient_pack_instances`), `deletePack` (`:177-199`, reference-guarded).
- **Locations:** LV = `LOC_LAV`, CB = `LOC_CB` (dev seed). Montemor has NO catalog (do not invent one).
- **The 3 frozen legacy service rows are `is_active = false` and STAY FROZEN:** "Pilates Terapeutico" 40.00, "NESA" 39.00, "Massagem Terapeutica" 50.00 (W8-01a POST-EXECUTION NOTE, `docs/loops/wave-08/W8-01a-services-catalog-packs-schema-seed.md:154-161`). **Do NOT reactivate, rename, delete, or map them** in this loop. Their future mapping (for a later Fisiozero import ONLY, no cloud change now) is ruled in DECISIONS 2026-07-21: Pilates Terapeutico 40 -> Pilates Terapeutico Aula individual (LV); NESA 39 -> canonical NESA; Massagem Terapeutica 50 -> Tratamento Terapeutico (LV). That mapping is NOT executed here.
- **Renames via UPDATE, never delete-recreate:** a canonical `services` row rename is an UPDATE of `name` (historic `appointments.service_id` references must survive); never delete-and-recreate.
- **Post-purge cloud (W10-02, DECISIONS 2026-07-20):** services 25, service_location_prices 23, service_packs 14, locations 2, tenants 1 (patient-domain is the accepted residue island - OUT of scope here). Phase 1 reads the live counts fresh.

### Phase 1 (READ-ONLY) - the DELTA REPORT
Read the cloud `services`, `service_location_prices`, and `service_packs` ONLY (NO patient-domain tables). Diff against the official lists per location and produce `docs/recon/W10-04b-catalog-delta.md` with, per location (LV, CB):
1. **Services to ADD** - a printed service with NO active `service_location_prices` row at that location (offer it by adding the active price row at the printed cents; if the canonical `services` row does not exist, note it).
2. **Prices to CORRECT** - an active price row whose `price_cents` differs from the printed cents (report old -> new in cents).
3. **Rows offered WITHOUT a printed entry** - an active `service_location_prices` row at a location whose service is NOT on that location's printed list -> **propose DEACTIVATING** that location price row (set `is_active = false`; do NOT delete). This is the offered-only-where-priced reconciliation (each location keeps only what its list prints).
4. **Pack deltas** - packs to add / prices to correct / packs to deactivate, per location, using the `service_packs.location_id` per-location rows (per-location pack pricing supported).
5. **Frozen-legacy check** - report whether ANY cloud row still references the 3 frozen legacy services (`getReferencedServiceIds` + active price rows + packs; expected 0 post-purge). State the count explicitly.
6. **Naming mismatches -> QUESTIONS, never auto-rename** - where a printed per-location name differs from the canonical `services.name`, file it as a question with a recommended default; DO NOT auto-rename. Known examples to resolve (confirm against the live rows): LV "Tratamento NESA" vs CB "NESA" vs the canonical row; CB "Osteopatia/Posturologia" (one printed line) vs the canonical Osteopatia + Posturologia split; the CB "Pilates com Maquinas" vs LV "Pilates mensal ... grupo" products; "R.P.G. Reeducacao Postural Global". Recommended default per mismatch: **keep the existing canonical `services.name`; treat the printed per-location wording as an owner-confirmable display-alias question**, never a silent rename.
7. **End the report with a versioned PROPOSED CATALOG PLAN** (`PLAN v1`): ordered steps, the exact expected before/after row count per step, the table each step touches (`services` / `service_location_prices` / `service_packs` ONLY), and a BLOCKED/QUESTIONS section (naming mismatches, any missing canonical service row, any duration-null service). Version the plan so the owner's `AUTORIZO CATALOGO plan vN` can name it.

### Phase 2 (WRITE) - only after `AUTORIZO CATALOGO plan vN`
Mirror the W10-02 protocol exactly:
- **Preconditions:** Phase-1 delta report merged AND the owner replied with the exact phrase `AUTORIZO CATALOGO` + the plan version. No other wording opens the window.
- **Read-only pre-flight against the EXACT plan:** re-read the live catalog; if it drifted from the plan's expected pre-state, HALT with ZERO writes (re-version the plan) until quiescent + owner re-confirmed.
- **Atomic apply** of exactly the approved plan (one transaction), CATALOG TABLES ONLY, money in cents, renames via UPDATE never delete-recreate, frozen rows untouched.
- **Per-step before/after counts** pasted as evidence; **HALT on any mismatch** (unexpected count, FK surprise, or any patient-domain table appearing in scope).
- **Any step touching a patient-domain table is an instant VIOLATION -> HALT-LOUD**, regardless of authorization.

**Scope:** a versioned delta report (Phase 1) and, after `AUTORIZO CATALOGO plan vN`, an atomic catalog-tables-only reconciliation (Phase 2) so each location's `services` offerings + per-location prices + packs match its official printed list. No patient-domain write. No schema change, no migration (the model already supports everything, head stays `0037`). Naming mismatches and any missing canonical row are QUESTIONS, never auto-decided.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W10-04c's merge; `git worktree add ../osteojp-w10-04b-catalogo origin/main -b osteojp-w10-04b-catalogo`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Phase 1 read (catalog tables only, inside `SET TRANSACTION READ ONLY`):** read `services`, `service_location_prices`, `service_packs`; NO patient-domain table. Counts + rows (name/location/price cents/active), no PII (catalog has none). Diff against the official lists per location.
3. **Write `docs/recon/W10-04b-catalog-delta.md`** with sections 1-7 above, ending in the versioned PROPOSED CATALOG PLAN. Commit; this is the artifact the owner reviews.
4. **HALT for owner review + authorization:** post the delta report + the plan version; HALT. Phase 2 does NOT start until the owner replies `AUTORIZO CATALOGO plan vN` (and the naming-mismatch questions are ruled where a rename would otherwise be needed).
5. **[Phase 2, gated] Pre-flight:** re-read the live catalog; assert it matches the plan's expected pre-state; HALT with ZERO writes on any drift.
6. **[Phase 2, gated] Atomic apply:** execute exactly the approved plan (catalog tables only), one step at a time, pasting before/after counts; renames via UPDATE; frozen rows untouched; HALT on any mismatch or any patient-domain table in scope.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. the offered-only-where-priced + rename-preserves-references tests), `pnpm build`, `pnpm test:e2e` where a catalog surface changed. JSON.parse both i18n files. Confirm `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files (the model is unchanged; head stays `0037`).

## Field 3. Definition of done (machine-verifiable)
- **Delta-report PROOF (Phase 1):** `docs/recon/W10-04b-catalog-delta.md` exists with per-location adds / price corrections (cents) / offered-without-printed-entry deactivation proposals / pack deltas / the frozen-legacy reference count / the naming-mismatch questions / the versioned plan. Paste the section headers + the plan.
- **Per-location-pricing PROOF:** the report states per-location pack pricing is natively supported (`service_packs.location_id`) and reconciles packs as per-location rows (LV 10-NESA 39000, CB NESA-10 35000, etc.).
- **Frozen-legacy PROOF:** the report states the reference count for the 3 frozen legacy services (expected 0 post-purge) and confirms they are untouched (not reactivated/renamed/deleted/mapped).
- **Naming-mismatch PROOF:** every printed-vs-canonical name difference is a QUESTION with a recommended default; NO auto-rename occurred.
- **Authorization PROOF (Phase 2):** the owner phrase `AUTORIZO CATALOGO plan vN` is pasted; the write window opened only after it.
- **Per-step evidence PROOF (Phase 2):** each plan step shows before -> action (catalog table named) -> after count matching the plan; renames via UPDATE preserved historic `appointments.service_id` references.
- **Catalog-only PROOF:** NO patient-domain table appears in any write; `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The delta report path + section headers + versioned plan, the per-location-pricing statement, the frozen-legacy reference count, the naming-mismatch questions, (Phase 2) the `AUTORIZO CATALOGO` phrase + the per-step before/after ledger + the catalog-only proof, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W10-04c). **No schema change, no migration** - the model (services / service_location_prices / service_packs, per-location pack pricing) already supports everything; head stays `0037`. If a migration seems needed, HALT.
- **CATALOG TABLES ONLY (`services`, `service_location_prices`, `service_packs`).** ANY step touching a patient-domain table (patients, appointments, clinical_records, episodes, notes, `patient_pack_instances`, etc.) is an instant VIOLATION -> HALT-LOUD, regardless of authorization. `AUTORIZO CATALOGO` authorizes catalog reconciliation ONLY.
- **The `AUTORIZO CATALOGO` window is a SECOND, catalog-only authorized cloud write**, distinct from the spent `AUTORIZO LIMPEZA` window. It does not reopen patient-domain writes. Phase 1 is strictly read-only.
- **The 3 frozen legacy rows stay frozen** - never reactivate, rename, delete, or map them here (their future-import mapping is DECISIONS 2026-07-21, not executed this loop).
- **Money is integer cents, never float** (75,00 -> 7500; 237,50 -> 23750). Currency on the column. **Each location keeps its own prices** (cross-location ruling, Q-W8-01-1 closed).
- **Renames via UPDATE on the canonical `services` row, NEVER delete-recreate** (historic `appointments.service_id` must survive). Naming mismatches are QUESTIONS with recommended defaults, never auto-renamed.
- **Durations stay as-is** (`duration_min`); flag only a null duration, never invent one.
- pt-PT diacritics in any names quoted; both i18n files JSON.parse if any string added; no emoji; plain hyphens only; no em/en dashes. DB access only through `packages/db`; audit mutations (rule 6). **Never force-push / `--admin`.**
- **Standing test-data rule (post W10-02):** the catalog is REAL data (legitimate); patient-domain synthetic data lives ONLY on local `127.0.0.1`; any E2E uses local synthetic data. NO patient-domain cloud write.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W10-04c's merge.
- Phase 2 is reached without the exact `AUTORIZO CATALOGO` + matching plan version, or the live catalog drifted from the plan's expected pre-state - HALT with ZERO writes.
- ANY step would touch a PATIENT-DOMAIN table - instant HALT-LOUD (violation), regardless of authorization.
- A printed service has no canonical `services` row and reconciling would require CREATING a service whose name/identity is ambiguous vs a frozen or existing row - HALT to QUESTIONS (do not guess identity; match by id, never by name, since the frozen "NESA" 39.00 and a canonical NESA share the display name).
- Reconciliation would require reactivating/renaming/deleting a frozen legacy row, or a delete-recreate that orphans historic `appointments.service_id` - HALT (frozen rows untouched; rename via UPDATE only).
- A schema change or migration seems required - HALT (the model already supports per-location prices and packs; head stays `0037`).

## Field 7. Report back
The delta report path + versioned plan, the per-location-pricing statement, the frozen-legacy reference count, the naming-mismatch questions, (Phase 2) the `AUTORIZO CATALOGO` phrase + per-step before/after ledger + catalog-only proof, suite counts, PR number.

## Merge policy (embed, Wave 10 Dados Reais e Isolamento)
- **W10-04b is OWNER-MERGE and carries the OWNER-GATED CATALOG WRITE WINDOW.** Phase 1 (the read-only delta report) HALTs for owner review; Phase 2 opens ONLY on the exact phrase `AUTORIZO CATALOGO plan vN` and writes CATALOG TABLES ONLY. The per-step before/after evidence is pasted BEFORE the owner merges. All required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) green (read from the checks API NOT the banner) is NECESSARY. GREEN NEVER self-merges the write.
- **Runs strictly AFTER W10-04c merged and BEFORE W10-05** (owner-ordered sequence), fresh `origin/main`, never stacked. Catalog tables only; any patient-domain touch is a violation and a HALT. Immutability/append-only never defeated. No migration (head stays `0037`). Workflow files NEVER touched. Plain hyphens only. HALT-LOUD on any deviation from the approved plan.
