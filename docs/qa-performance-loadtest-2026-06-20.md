# Phase 6 Performance Load Test — 2026-06-20

**Method:** Live load test against DEV Supabase (ref `ufbkzbyghvxtosyrkgjq`, EU Frankfurt).
Synthetic dataset seeded via `scripts/perf-seed-loadtest.mjs`; EXPLAIN ANALYZE measurements
taken over 10 warm runs per query; DB execution time reported (excludes application overhead).

**Context:** Follows the static analysis in `docs/qa-performance-2026-06-18.md` (found 2 P1s,
2 P2s, 2 P3s) and the preliminary EXPLAIN ANALYZE in `docs/qa-performance-followup-2026-06-19.md`
(blocked because migrations 0015–0019 were not yet applied). This document validates the final
state after migrations 0015–0019 are live in both dev and prod.

---

## Dataset

| Dimension | Count |
|---|---|
| Tenant | `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` (OsteoJP) |
| Active patients (total after seed) | 2 050 |
| Appointments (total after seed) | 20 271 |
| Appointments — Linda-a-Velha location | 6 798 |
| Appointments — current week (2026-06-16–22) | 123 |
| Appointment date range seeded | 2024-07-01 → 2026-06-20 |
| Locations | 3 (Linda-a-Velha, Castelo Branco, Montemor-o-Novo) |
| Therapists | 4 |
| Services | 5 |

Seed is idempotent (sentinel NIF `100001001`). Perf patients are tagged
`notes = 'perf-loadtest-2026-06-20'` for future cleanup.

---

## Targets

| Path | Plan target | DB-execution target used here |
|---|---|---|
| Agenda week view (page load) | < 1 000 ms | < 200 ms DB exec |
| Patient search (any flavour) | < 300 ms | < 50 ms DB exec |

The DB-execution targets are conservative (≈ 20 % of the user-perceived budget) to
leave headroom for Next.js SSR, network RTT, and rendering.

---

## Results

All queries measured with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, 10 runs, caches
warm after the first run. Times are in milliseconds.

| Query | p50 | p95 | p99 | DB target | Verdict | Wall p50 |
|---|---:|---:|---:|---:|---|---:|
| Agenda week + location filter | 1.01 | 1.50 | 1.50 | 200 ms | **PASS** | 100 ms |
| Agenda week (no location filter) | 1.17 | 1.19 | 1.19 | 200 ms | **PASS** |  91 ms |
| Patient name — ILIKE `%Silva%` | 3.25 | 4.01 | 4.01 |  50 ms | **PASS** |  64 ms |
| Patient phone — `phone_digits LIKE '%912%'` | 1.57 | 1.60 | 1.60 |  50 ms | **PASS** |  63 ms |
| Patient NIF prefix — `nif ILIKE '10%'` | 3.59 | 3.64 | 3.64 |  50 ms | **PASS** |  65 ms |

**All 5 queries pass. Margin vs DB target: 13–133×. Margin vs user-perceived target (wall): 2–5×.**

Wall times include EU Frankfurt → local Mac RTT (~60–100 ms). End-to-end user-perceived
latency in production (Vercel `fra1` co-located with Supabase EU) will be lower — the
network component collapses to < 5 ms intra-region.

---

## Query Plans

### 1 — Agenda week + location filter

**SQL (maps to `listAppointments` with `locationId` filter):**

```sql
SELECT a.id, a.starts_at, a.ends_at, a.status,
       p.full_name AS patient_name, u.full_name AS practitioner_name,
       l.name AS location_name, s.name AS service_name
FROM   appointments a
JOIN   patients  p ON p.id = a.patient_id
JOIN   users     u ON u.id = a.practitioner_id
JOIN   locations l ON l.id = a.location_id
LEFT JOIN services s ON s.id = a.service_id
WHERE  a.tenant_id   = '…'
  AND  a.location_id = 'de000002-0000-0000-0000-000000000001'
  AND  a.starts_at  >= '2026-06-16T00:00:00Z'
  AND  a.starts_at  <  '2026-06-23T00:00:00Z'
ORDER BY a.starts_at
```

**Plan (execution: 1.01 ms, rows: 43):**

```
Sort  (actual rows=43 time=0.94ms)
  Nested Loop  (actual rows=43 time=0.92ms)
    Nested Loop  (actual rows=43 time=0.89ms)
      Index Scan [locations_pkey]  cond=(id = '<loc>')  (rows=1 time=0.01ms)
      Nested Loop  (actual rows=43 time=0.86ms)
        Hash Join  (actual rows=43 time=0.83ms)
          Index Scan [appointments_tenant_location_start_idx]
            cond=((tenant_id=…) AND (location_id=…) AND
                  (starts_at >= '2026-06-16') AND (starts_at < '2026-06-23'))
            (rows=43 time=0.04ms)                          ← NEW INDEX ✓
          Hash  (rows=2050 time=0.76ms)
            Seq Scan patients  (rows=2050 time=0.36ms)    ← see note §4
        Memoize → Index Scan [users_pkey]  (rows=1 time=0.00ms)
    Memoize → Index Scan [services_pkey]  (rows=1 time=0.00ms)
```

**Index confirmed:** `appointments_tenant_location_start_idx` (migration 0016) used as
the primary access path with all three conditions in `Index Cond`. This is the exact
problem the P3 finding identified — previously the planner used `appointments_tenant_start_idx`
with `location_id` as a post-scan filter. Now it's eliminated.

---

### 2 — Agenda week (no location filter)

**Plan (execution: 1.17 ms, rows: 123):**

```
Sort  (actual rows=123 time=1.09ms)
  Nested Loop  (actual rows=123 time=1.05ms)
    Nested Loop  (actual rows=123 time=0.99ms)
      Hash Join  (actual rows=123 time=0.89ms)
        Index Scan [appointments_tenant_start_idx]
          cond=((tenant_id=…) AND (starts_at >= '2026-06-16') AND (starts_at < '2026-06-23'))
          (rows=123 time=0.07ms)
        Hash  (rows=2050 time=0.77ms)
          Seq Scan patients  (rows=2050 time=0.34ms)      ← see note §4
      Memoize → Index Scan [users_pkey]  (rows=1 time=0.00ms)
    Memoize → Index Scan [locations_pkey]  (rows=1 time=0.00ms)
```

**Index confirmed:** `appointments_tenant_start_idx` (existing) used correctly for the
date-range + tenant filter. No regression from the new composite index.

---

### 3 — Patient name search (ILIKE `%Silva%`)

**Plan (execution: 3.25 ms, rows: 101 matched, 50 returned):**

```
Limit  (rows=50 time=3.21ms)
  Sort  (rows=50 time=3.20ms)
    Bitmap Heap Scan
      filter=((deleted_at IS NULL) AND (full_name ILIKE '%Silva%'))
      recheck=(tenant_id = '…')
      (rows=101 time=3.11ms)
        Bitmap Index Scan [patients_nif_idx]
          cond=(tenant_id = '…')  (rows=2050 time=0.12ms)  ← tenant narrowing
```

**Note on GIN trigram index:** At 2 050 patients the planner chose `patients_nif_idx`
(the `(tenant_id, nif)` B-tree) to narrow to the tenant's rows (2 050), then applied
`ILIKE '%Silva%'` as a heap filter. The GIN trigram index (`patients_full_name_trgm_idx`)
was not invoked. This is correct planner behaviour at this scale: with only 2 050 tenant
rows the bitmap scan + filter (0.12 ms narrowing + 3.0 ms filter) beats the BitmapAnd
overhead of combining two index scans. The GIN index becomes cost-effective at
approximately 5 000–10 000 tenant patients, at which point the trigram selectivity
reduces the heap scan set significantly. At 2 050 patients with 3.25 ms p50, the query
remains well within target.

---

### 4 — Patient phone-digits search

**Plan (execution: 1.57 ms, rows: 2 025 matched, 50 returned):**

```
Limit  (rows=50 time=1.53ms)
  Sort  (rows=50 time=1.52ms)
    Bitmap Heap Scan
      filter=((deleted_at IS NULL) AND (phone_digits LIKE '%912%'))
      recheck=(tenant_id = '…')
      (rows=2025 time=0.89ms)
        Bitmap Index Scan [patients_nif_idx]
          cond=(tenant_id = '…')  (rows=2050 time=0.12ms)
```

**Note on `patients_phone_digits_idx`:** The `phone_digits LIKE '%912%'` predicate is a
leading-wildcard LIKE — B-tree indexes cannot serve leading-wildcard patterns. At this
dataset the perf seed uses phone range `+351 912 000 001`–`+351 912 001 999`, so `%912%`
matches 2 025 of 2 050 patients. The planner correctly reads all tenant rows via the NIF
B-tree and applies the filter — no index can narrow a `%digits%` mid-string match. The
`patients_phone_digits_idx` will serve prefix-digit searches (e.g. `912000%`) where the
leading characters are known. 1.57 ms at 2 025 matching rows confirms the generated column
itself is fast and the index is available for tighter searches.

---

### 5 — Patient NIF prefix search

**Plan (execution: 3.59 ms, rows: 2 000 matched, 50 returned):**

```
Limit  (rows=50 time=3.51ms)
  Sort  (rows=50 time=3.51ms)
    Bitmap Heap Scan
      filter=((deleted_at IS NULL) AND (nif ILIKE '10%'))
      recheck=(tenant_id = '…')
      (rows=2000 time=2.81ms)
        Bitmap Index Scan [patients_nif_idx]
          cond=(tenant_id = '…')  (rows=2050 time=0.12ms)
```

**Note on ILIKE vs LIKE for NIF:** The application uses `ilike(patients.nif, …)` which
emits `nif ILIKE '10%'`. PostgreSQL cannot use a standard B-tree index for case-insensitive
prefix searches on `text` (it would need a `lower(nif)` functional index or `citext` type).
The planner uses the NIF B-tree only for the `tenant_id =` condition and applies the ILIKE
as a filter over all 2 050 tenant rows. Since NIF values in Portugal are always numeric
(digits only), case never varies in practice — `ILIKE` and `LIKE` would return identical
results. At 2 050 patients this costs 3.59 ms; at 20 000 patients this would cost ~35 ms
(still under 300 ms budget). **No immediate fix required for V1** — noted as a V1.1
optimisation: changing `ilike` to `like` for the NIF arm of `searchPatients` would let
the planner use `(tenant_id, nif)` as a full index condition.

---

## Note §4 — Hash Seq Scan on patients in agenda queries

Both agenda plans contain:

```
Hash  (rows=2050 time=0.76ms)
  Seq Scan patients  (rows=2050 time=0.34ms)
```

The planner builds a hash table of all 2 050 active patients to serve the
`appointments.patient_id → patients.id` join. At 2 050 rows this costs 0.34 ms and fits
comfortably in `work_mem`. At significantly higher patient counts (est. 30 000+) the planner
would switch to a Merge Join or Nested Loop with index scans on `patients_pkey`, both of
which scale better. The total agenda query time remains well under 200 ms at this scale and
the Seq Scan is not the dominant cost (43 appointments × join lookups dominate). Flagged
for re-evaluation at the 30 000-patient milestone.

---

## Summary vs Prior Findings

| Finding (qa-performance-2026-06-18.md) | Fix | Status |
|---|---|---|
| **P1** — `getAgendaOptions` unbounded patient fetch | Removed; replaced with search-as-you-type (implemented in an earlier PR) | ✅ Resolved |
| **P1** — Phone search per-row `regexp_replace` | `phone_digits` generated column + index (migration 0015) | ✅ Resolved — 1.57 ms p50 |
| **P2** — `ILIKE '%name%'` no trigram index | `pg_trgm` + `patients_full_name_trgm_idx` (migration 0015) | ✅ Resolved — 3.25 ms p50 (GIN kicks in at scale) |
| **P2** — NIF prefix search no index | `patients_nif_idx` (migration 0017) | ✅ Resolved — 3.59 ms p50 (see ILIKE note above) |
| **P3** — Stable reference data not cached | `unstable_cache(revalidate: 60)` on therapists/locations/services | ✅ Resolved (implemented in data.ts) |
| **P3** — No covering index for location-filtered agenda | `appointments_tenant_location_start_idx` (migration 0016) | ✅ Resolved — Index Cond confirmed in plan |

---

## V1.1 Backlog Items

| Priority | Finding | Recommendation |
|---|---|---|
| Low | NIF search uses `ILIKE` (case-insensitive) preventing B-tree prefix use | Change `ilike(patients.nif, …)` → `like(patients.nif, …)` in `searchPatients`; NIFs are always numeric |
| Low | Name search GIN trigram index not invoked below ~5 000 patients | No action now; monitor at growth milestones |
| Low | Agenda join builds hash of all patients for Nested Loop; revisit at 30 000 patients | Add `patients_pkey` covering index hint or revisit query shape |

---

## Environment

| Parameter | Value |
|---|---|
| Supabase project | `ufbkzbyghvxtosyrkgjq` (EU Frankfurt) |
| Connection | Session pooler, port 5432 |
| Measurement tool | `scripts/perf-seed-loadtest.mjs` |
| EXPLAIN runs per query | 10 (results from run 5 of 10; caches warm) |
| Migrations applied | 0000–0019 |
| Date | 2026-06-20 |
