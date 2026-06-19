# Performance Confirmation — phone_digits + location index EXPLAIN ANALYZE

**Date:** 2026-06-19  
**Environment:** dev Supabase `ufbkzbyghvxtosyrkgjq` (EU Frankfurt pooler, direct port 5432)  
**Tenant:** `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`  
**Connection:** `postgresql://postgres.[ref]:[REDACTED]@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`  
**Run by:** automated QA agent via Node.js `postgres@3.4.9` — READ ONLY  

---

## Summary

| Migration | Index expected | Index found in dev DB | Verdict |
|---|---|---|---|
| 0015 — `phone_digits` column + index | `patients_phone_digits_idx`, `patients_full_name_trgm_idx` | Neither present; `phone_digits` column itself missing | **MISSING — migration not applied** |
| 0016 — `appointments_tenant_location_start_idx` | `appointments_tenant_location_start_idx` | Not present; query falls back to `appointments_tenant_start_idx` | **MISSING — migration not applied** |

**Both migrations (0015 and 0016) have not been applied to the dev Supabase project `ufbkzbyghvxtosyrkgjq`.** The findings below document the failed query (1a), the seq-scan baseline (1b), and the fallback index plan (2).

---

## Schema inspection (pre-run)

### Indexes actually present on `patients`

```
patients_auth_user_id_unique  UNIQUE BTREE (auth_user_id)
patients_pkey                 UNIQUE BTREE (id)
patients_tenant_idx           BTREE (tenant_id)
patients_tenant_name_idx      BTREE (tenant_id, full_name)
```

`phone_digits` column: **absent**  
`patients_phone_digits_idx`: **absent**  
`patients_full_name_trgm_idx`: **absent**  
`pg_trgm` extension: not confirmed active

### Indexes actually present on `appointments`

```
appointments_patient_idx             BTREE (patient_id)
appointments_pkey                    UNIQUE BTREE (id)
appointments_practitioner_start_idx  BTREE (practitioner_id, starts_at)
appointments_tenant_idx              BTREE (tenant_id)
appointments_tenant_start_idx        BTREE (tenant_id, starts_at)
```

`appointments_tenant_location_start_idx`: **absent**

---

## Query 1a — Phone search (canonical, requires migration 0015)

### SQL

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, full_name, phone
FROM patients
WHERE phone_digits LIKE '912%'
  AND tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
LIMIT 20;
```

### EXPLAIN ANALYZE output

```
QUERY FAILED: column "phone_digits" does not exist (pg_code: 42703)
```

### Verdict

Query aborted at planning time. The `phone_digits` generated column added by migration 0015 does not exist on the `patients` table in the dev database. Migration 0015 has not been applied. No execution plan was produced.

---

## Query 1b — Phone search baseline (raw `phone` column, no dedicated index)

This query uses the existing `phone` column to demonstrate the pre-migration query path and confirm what plan the database currently uses for phone search.

### SQL

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, full_name, phone
FROM patients
WHERE phone LIKE '%912%'
  AND tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
LIMIT 20;
```

### EXPLAIN ANALYZE output

```
Limit  (cost=0.14..2.37 rows=1 width=130) (actual time=1.311..1.311 rows=0 loops=1)
  Buffers: shared hit=1
  ->  Index Scan using patients_tenant_name_idx on patients  (cost=0.14..2.37 rows=1 width=130) (actual time=1.308..1.309 rows=0 loops=1)
        Index Cond: (tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'::uuid)
        Filter: ((phone)::text ~~ '%912%'::text)
        Buffers: shared hit=2
Planning:
  Buffers: shared hit=76
Planning Time: 3.613 ms
Execution Time: 1.404 ms
```

### Verdict

The planner uses `patients_tenant_name_idx` (btree on `tenant_id, full_name`) to narrow by tenant, then applies a per-row `phone LIKE '%912%'` filter. This is a heap fetch + row filter, not an index seek on the phone value — it will degrade linearly with patient count. This is precisely the problem migration 0015 is designed to solve. No `phone_digits` index scan is possible until 0015 is applied.

---

## Query 2 — Location-filtered agenda (requires migration 0016)

### SQL

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT a.id, a.starts_at, a.patient_id
FROM appointments a
WHERE a.location_id = '00000000-0000-0000-0000-000000000001'
  AND a.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
  AND a.starts_at >= now()
ORDER BY a.starts_at
LIMIT 50;
```

### EXPLAIN ANALYZE output

```
Limit  (cost=0.15..2.37 rows=1 width=40) (actual time=0.007..0.007 rows=0 loops=1)
  Buffers: shared hit=2
  ->  Index Scan using appointments_tenant_start_idx on appointments a  (cost=0.15..2.37 rows=1 width=40) (actual time=0.006..0.006 rows=0 loops=1)
        Index Cond: ((tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'::uuid) AND (starts_at >= now()))
        Filter: (location_id = '00000000-0000-0000-0000-000000000001'::uuid)
        Buffers: shared hit=2
Planning:
  Buffers: shared hit=5
Planning Time: 0.204 ms
Execution Time: 0.032 ms
```

### Verdict

The planner fell back to `appointments_tenant_start_idx` (btree on `tenant_id, starts_at`). It applies `location_id` as a post-scan row filter rather than as an index condition. This is the exact pre-migration behaviour migration 0016 is designed to fix: without `appointments_tenant_location_start_idx`, every location-scoped week view must heap-fetch all appointments for the tenant within the time range and then filter by location. The new composite index `(tenant_id, location_id, starts_at)` would allow the planner to range-scan directly on `(tenant_id, location_id)` and seek on `starts_at`, eliminating the per-row location filter.

The 0.032 ms execution time reflects an empty result set (the placeholder `location_id = '00000000-0000-0000-0000-000000000001'` matched no rows). The plan shape — specifically `Filter: (location_id = ...)` rather than an `Index Cond:` — confirms the index is missing.

---

## Action required

1. **Apply migration 0015** (`0015_patients_phone_digits_index.sql`) to dev project `ufbkzbyghvxtosyrkgjq`.  
   Command: `supabase db push --project-ref ufbkzbyghvxtosyrkgjq` (or target the dev branch if branching is in use).  
   After applying: re-run Query 1a and verify `Index Scan using patients_phone_digits_idx`.

2. **Apply migration 0016** (`0016_agenda_location_start_idx.sql`) to dev project.  
   After applying: re-run Query 2 and verify `Index Scan using appointments_tenant_location_start_idx` with `Index Cond: (location_id = ...)` instead of a `Filter:`.

3. **Re-run this document** after both migrations are applied and replace the plan outputs above with confirmed index-hit outputs.
