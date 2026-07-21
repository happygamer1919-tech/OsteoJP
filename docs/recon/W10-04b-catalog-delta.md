# W10-04b catalog delta report - PHASE 1 (read-only) - Wave 10 Dados Reais e Isolamento

> Loop: `docs/loops/wave-10/W10-04b-catalogo-precos-reais.md`. Phase 1, authored 2026-07-21. **Read-only: CATALOG TABLES ONLY (`services`, `service_location_prices`, `service_packs`, `locations`), NO patient-domain table, NO write.** All reads inside `SET TRANSACTION READ ONLY` on the cloud DB (real catalog data; reconciling it to the official price lists is legitimate real-data maintenance, not synthetic). Ends in a versioned **PROPOSED CATALOG PLAN (PLAN v1)** that Phase 2 executes ONLY after the owner replies `AUTORIZO CATALOGO plan v1`.

## Headline

**The cloud catalog is ALREADY fully reconciled to the official printed lists** for both locations - services and packs. Every printed service is offered at the correct per-location price; every printed pack exists at the correct per-location price. There is **ONE genuine state anomaly** (a canonical service flagged inactive while it is offered + packed) proposed as the single Phase-2 write. Frozen legacy rows are inactive with zero references and are untouched.

Live counts (fresh read): `services` 25 (21 active, 4 inactive), `service_location_prices` 23 (all active), `service_packs` 14 (all active), `locations` 2 (CB `de..002`, LV `de..001`). Money in integer cents throughout.

## 1. Services to ADD (a printed service with no active price row at that location)

**LV: NONE.** All 12 printed LV services have an active `service_location_prices` row at LV at the printed cents.
**CB: NONE.** All 11 printed CB services have an active `service_location_prices` row at CB at the printed cents.

## 2. Prices to CORRECT (active price row cents != printed cents)

**LV: NONE.** **CB: NONE.** Every active price row matches its printed price to the cent:

| Loc | Service (canonical name) | Printed | Cloud (active price row) | Match |
|---|---|---:|---:|:--:|
| LV | 1.ª consulta / Avaliação (Osteopatia ou Fisioenergética/…) | 7500 | 7500 | ✓ |
| LV | Osteopatia | 7000 | 7000 | ✓ |
| LV | Fisioenergética/Kinesiologia/Posturologia | 7000 | 7000 | ✓ |
| LV | R.P.G. — Reeducação Postural Global | 6000 | 6000 | ✓ |
| LV | Fisioterapia | 5500 | 5500 | ✓ |
| LV | Tratamento Terapêutico | 5500 | 5500 | ✓ (see §7 anomaly) |
| LV | Tratamento NESA | 5000 | 5000 | ✓ |
| LV | Drenagem Linfática Manual (Método Wodere) | 6000 | 6000 | ✓ |
| LV | Pressoterapia / Drenagem Linfática Mecânica | 3500 | 3500 | ✓ |
| LV | Pilates Terapêutico — aula individual | 5000 | 5000 | ✓ |
| LV | Pilates mensal 1x/semana — grupo (4 a 5 pessoas) | 12500 | 12500 | ✓ |
| LV | Pilates mensal 2x/semana — grupo (4 a 5 pessoas) | 19500 | 19500 | ✓ |
| CB | Osteopatia/Posturologia | 6000 | 6000 | ✓ |
| CB | Fisioterapia | 4500 | 4500 | ✓ |
| CB | Pressoterapia | 3000 | 3000 | ✓ |
| CB | Sessão Família/Amigos (2 pessoas ao mesmo tempo) | 6000 | 6000 | ✓ |
| CB | Medicina Chinesa/Acupuntura | 4500 | 4500 | ✓ |
| CB | Massagem 4 Mãos (2 terapeutas) | 7000 | 7000 | ✓ |
| CB | Pilates com Máquinas 1x/semana/mês | 12500 | 12500 | ✓ |
| CB | Pilates com Máquinas 2x/semana/mês | 19500 | 19500 | ✓ |
| CB | Pilates — Aula Experimental (1.ª vez) | 2000 | 2000 | ✓ |
| CB | Pilates — Aula Pontual | 3500 | 3500 | ✓ |
| CB | NESA | 5000 | 5000 | ✓ |

23 active price rows = 12 LV + 11 CB. Every row maps to a printed entry; every printed entry has a row. **No corrections.**

## 3. Rows offered WITHOUT a printed entry (propose deactivate)

**NONE.** There is no active `service_location_prices` row at a location whose service is absent from that location's printed list. The offered set already equals the printed set at each location. **No deactivations proposed.**

## 4. Pack deltas (per location, using `service_packs.location_id`)

**LV packs (8): all present at the printed price. CB packs (6): all present at the printed price. No adds, no corrections, no deactivations.**

| Loc | Pack (cloud name) | base service | n | Printed | Cloud | Match |
|---|---|---|---:|---:|---:|:--:|
| LV | Pacote 10 — NESA | Tratamento NESA | 10 | 39000 | 39000 | ✓ |
| LV | Pacote 5 — Osteopatia | Osteopatia | 5 | 32500 | 32500 | ✓ |
| LV | Pacote 10 — Osteopatia | Osteopatia | 10 | 59500 | 59500 | ✓ |
| LV | Pacote 5 — Fisioterapia (2x semana) | Fisioterapia | 5 | 23750 | 23750 | ✓ |
| LV | Pacote 10 — Fisioterapia (2x semana) | Fisioterapia | 10 | 45000 | 45000 | ✓ |
| LV | Pacote 5 — Pressoterapia / Drenagem Linfática Mecânica | Pressoterapia / Drenagem Linfática Mecânica | 5 | 15000 | 15000 | ✓ |
| LV | Pacote 10 — Drenagem Linfática Manual (Método Wodere) | Drenagem Linfática Manual (Método Wodere) | 10 | 50000 | 50000 | ✓ |
| LV | Pacote 10 — Tratamento Terapêutico | Tratamento Terapêutico | 10 | 45000 | 45000 | ✓ |
| CB | Fisioterapia — 5 sessões | Fisioterapia | 5 | 20000 | 20000 | ✓ |
| CB | Fisioterapia — 10 sessões | Fisioterapia | 10 | 35000 | 35000 | ✓ |
| CB | Pressoterapia — 5 sessões | Pressoterapia | 5 | 12500 | 12500 | ✓ |
| CB | Medicina Chinesa/Acupuntura — 5 sessões | Medicina Chinesa/Acupuntura | 5 | 20000 | 20000 | ✓ |
| CB | Medicina Chinesa/Acupuntura — 10 sessões | Medicina Chinesa/Acupuntura | 10 | 35000 | 35000 | ✓ |
| CB | NESA — 10 sessões | NESA | 10 | 35000 | 35000 | ✓ |

### Per-location pack pricing - CAPABILITY ANSWER (owner asked explicitly)

**Per-location pack pricing is NATIVELY SUPPORTED and already in use - it is NOT a feature gap.** A pack is scoped to a location by its own `service_packs.location_id`, and the price lives on the pack row (`price_cents`). The exact scenario the owner raised - **the same "10 sessões NESA" pack priced differently per location** - is already two distinct location-scoped rows in the cloud:
- **LV "Pacote 10 — NESA" = 39000** (`location_id = LV`, base = Tratamento NESA)
- **CB "NESA — 10 sessões" = 35000** (`location_id = CB`, base = NESA)

There is no `service_pack_location_prices` side table and none is needed. No schema change; head stays `0037`.

## 5. Frozen-legacy reference check

The 3 frozen legacy `services` rows are all `is_active = false` and carry **ZERO references** (matched by id, not name - the frozen "NESA" shares a display name with the active CB "NESA"):

| Frozen row | id | price | appts | therapist_services | slp (active) | analytics | pack_base |
|---|---|---:|---:|---:|---:|---:|---:|
| Pilates Terapêutico | `de000003-…0004` | 4000 | 0 | 0 | 0 (0) | 0 | 0 |
| NESA | `42edf26c-…aa85` | 3900 | 0 | 0 | 0 (0) | 0 | 0 |
| Massagem Terapêutica | `de000003-…0003` | 5000 | 0 | 0 | 0 (0) | 0 | 0 |

**All three are untouched by this loop** - not reactivated, renamed, deleted, or mapped. Their future Fisiozero-import mapping (DECISIONS 2026-07-21) is NOT executed here.

## 6. Naming mismatches -> QUESTIONS (no auto-rename)

Every printed per-location name maps to an existing canonical `services` row with a matching name, so **no rename is required**. Two low-priority display nuances are filed as owner-confirmable questions (recommended default: keep the canonical name; do not rename):

- **Q-W10-04b-1 (NESA naming triad, informational).** Three rows share the "NESA" token by design: the active CB service **"NESA"** (`270fb115`, offered CB 5000), the active LV service **"Tratamento NESA"** (`7e3359a7`, offered LV 5000), and the **frozen "NESA"** (`42edf26c`, inactive 3900). The two active rows match their printed lists exactly (CB prints "NESA", LV prints "Tratamento NESA"); the frozen row is a separate id. **Default: keep as-is** (match by id, never name). No rename.
- **Q-W10-04b-2 (1.ª consulta wording, cosmetic).** The LV printed line "1a consulta / Avaliacao (Osteopatia, Fisioenergetica/Kinesiologia/Posturologia)" uses a comma where the canonical name uses "ou": "1.ª consulta / Avaliação (Osteopatia **ou** Fisioenergética/Kinesiologia/Posturologia)". Same service, same 7500 price. **Default: keep the canonical wording** (cleaner); treat the printed comma form as a display alias, not a rename.

## 7. STATE anomaly + PROPOSED CATALOG PLAN v1

### The one anomaly (a state inconsistency, not a price/offer error)

**"Tratamento Terapêutico" (`a3c1ced1-7e7f-4d40-b0c6-ead758147180`) has `services.is_active = false`, yet it is OFFERED at LV** (active `service_location_prices` row 5500) **AND is the base of the active LV pack** "Pacote 10 — Tratamento Terapêutico" (45000). It is on the official LV list as a standalone 5500 service. Because the LV booking dropdown filters on `services.is_active` (same filter class as the W9-07 finding), an inactive base row **hides "Tratamento Terapêutico" from the LV booking dropdown even though it has an active price row** - so LV cannot currently book it. This is the single reconciliation gap. It is **NOT** one of the 3 frozen legacy rows (those are `de..0003`/`42edf26c`/`de..0004`); `a3c1ced1` is a canonical service mis-flagged inactive.

### PLAN v1 (one write step; CATALOG TABLES ONLY; money in cents; no migration; frozen rows untouched)

| # | Step (catalog table) | Before | After | Expected rows |
|---|---|---|---|---:|
| 1 | `UPDATE services SET is_active = true WHERE id = 'a3c1ced1-7e7f-4d40-b0c6-ead758147180'` (name = "Tratamento Terapêutico") - makes the LV-offered, LV-packed service bookable, matching the official LV list. | `is_active = false` | `is_active = true` | 1 |

**That is the ONLY proposed write.** Everything else in the catalog already matches the official lists (0 service adds, 0 price corrections, 0 deactivations, 0 pack changes). No `services` rename (UPDATE-only would apply if there were one; there is none). No `service_location_prices` or `service_packs` change. No patient-domain table. No schema change (head stays `0037`).

**Expected end state after PLAN v1:** `services` active 22 (was 21), inactive 3 (the frozen legacy trio only); everything else unchanged. All 12 LV + 11 CB services and all 8 LV + 6 CB packs offered at the printed prices, with "Tratamento Terapêutico" now bookable at LV.

### BLOCKED / QUESTIONS section

- **If the owner intends "Tratamento Terapêutico" to NOT be bookable at LV** (sold only inside the 10-session pack), then step 1 is declined and the anomaly is accepted as deliberate - but then the standalone LV price row (5500) should arguably be deactivated too for consistency (a different one-line step). **Default: flip it active** (the official LV list prints it as a standalone 5500 service, so it should be bookable). Confirm flip-active (default) vs leave-inactive.
- Q-W10-04b-1 / Q-W10-04b-2 (naming) above - no rename by default.
- No missing canonical service row (every printed service maps to an existing row). No null-duration service (all `duration_min` = 60). No frozen-row change.

---

**Phase 2 gate:** this report is the artifact for owner review. Phase 2 (the single `services.is_active` UPDATE, or an owner-amended plan) opens ONLY after the owner replies with the exact phrase **`AUTORIZO CATALOGO plan v1`** (or a re-versioned plan if the owner amends step 1). Until then, ZERO catalog write. HALTING for owner review.
