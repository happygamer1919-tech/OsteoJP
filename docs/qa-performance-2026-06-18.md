# Phase 6 Performance Audit — 2026-06-18

**Method:** Static source-code review. No load tests run.

**Targets (from plan):**
- Agenda week view: page load < 1 s
- Patient search: < 300 ms

**Files audited:**
- `apps/web/app/agenda/page.tsx`
- `apps/web/app/agenda/appointment-drawer.tsx`
- `apps/web/lib/scheduling/data.ts`
- `apps/web/app/patients/page.tsx`
- `apps/web/lib/patients/queries.ts`
- `supabase/migrations/0000_empty_runaways.sql` (all indexes)
- `supabase/migrations/0005_patient_merge_multilocation.sql`
- `supabase/migrations/0010_patient_identity_layer.sql`

---

## Findings

### P1 — Blocker

---

**1. `getAgendaOptions` fetches ALL patients with no LIMIT**

- **File:** `apps/web/lib/scheduling/data.ts:138–145`
- **Issue:** The `patientRows` query inside `getAgendaOptions` selects every non-deleted patient in the tenant with no `LIMIT` or pagination:

  ```ts
  tx.select({ id: patients.id, label: patients.fullName })
    .from(patients)
    .where(isNull(patients.deletedAt))
    .orderBy(asc(patients.fullName))
  ```

  This result is passed to the appointment-creation `<Combobox>` in `appointment-drawer.tsx:256` for client-side filtering. Every agenda page load — including the initial page render — fetches and transfers the full patient list from DB → app server → browser. At 2,000 patients this adds hundreds of milliseconds; at 5,000 (post-migration) it becomes the dominant cost and threatens the < 1 s agenda target. `getAgendaOptions` is called in a `Promise.all` that blocks the page render (`agenda/page.tsx:63–71`), so this delay is on the critical path.

- **Severity:** P1 — threatens < 1 s agenda target
- **Recommended fix:** Remove `patientRows` from `getAgendaOptions`. Replace the patient `<Combobox>` in `appointment-drawer.tsx` with a search-as-you-type approach: call the existing `searchPatients` (or a thin API route wrapping it) as the user types, returning ≤ 50 matches. This is the same pattern already used on the `/patients` page.

---

**2. Patient phone search: per-row `regexp_replace` with no index**

- **File:** `apps/web/lib/patients/queries.ts:79`
- **Issue:** When the search query contains digits, `searchPatients` adds this condition:

  ```ts
  sql`regexp_replace(coalesce(${patients.phone}, ''), '[^0-9]', '', 'g') like ${`%${digits}%`}`
  ```

  `regexp_replace(…)` is evaluated on every patient row in the tenant's active slice before the `LIKE` can filter. No index can be used on a computed expression like this. The result is a guaranteed full sequential scan on all active patients any time the search string contains a digit. On a post-migration table of several thousand patients this will exceed the 300 ms target.

- **Severity:** P1 — sequential scan on every digit-containing search
- **Recommended fix:** Normalize phone digits at write time. Options:
  1. Add a `phone_digits` generated column (`GENERATED ALWAYS AS (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) STORED`) and index it: `CREATE INDEX patients_phone_digits_idx ON patients (tenant_id, phone_digits)`. Change the search condition to `like(patients.phoneDigits, '%' + digits + '%')`.
  2. Alternatively, normalize `phone` to digits-only in the write path and store both the display value and the digit string. Option 1 is safer — it avoids changing the existing write path.

---

### P2 — Fix

---

**3. Patient full-name search: `ILIKE '%text%'` bypasses the B-tree index**

- **File:** `apps/web/lib/patients/queries.ts:75`
- **Issue:**

  ```ts
  ilike(patients.fullName, nameLike)  // nameLike = '%text%'
  ```

  A leading `%` wildcard prevents Postgres from using the `patients_tenant_name_idx` B-tree index on `(tenant_id, full_name)`. The B-tree can only serve prefix searches (`text%`). For any infix search the planner falls back to a sequential scan of the tenant's patient rows. At launch this is fast (< 200 patients), but will regress as the patient list grows post-migration.

  The code comment at line 58 notes "within a single tenant's row count this stays well under the 300 ms target" — accurate for launch, but this is a latency time-bomb as the data grows.

- **Severity:** P2 — passes at launch; degrades at scale
- **Recommended fix:** Enable `pg_trgm` and add a GIN trigram index in a new migration (0015 is the next free slot):

  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX patients_name_trgm_idx ON patients
    USING gin (full_name gin_trgm_ops);
  ```

  Postgres will automatically use this index for `ILIKE '%text%'` once it exists. The B-tree `patients_tenant_name_idx` can then be narrowed to serve just `listPatients` ordering.

---

**4. Patient NIF search: prefix `ILIKE` with no index on `patients.nif`**

- **File:** `apps/web/lib/patients/queries.ts:77`
- **Issue:**

  ```ts
  ilike(patients.nif, `${escapeLike(digits)}%`)
  ```

  A prefix search (`digits%`) CAN use a B-tree index — but no index on `patients.nif` exists in any migration. Every NIF search therefore does a sequential scan on the tenant's patient rows.

- **Severity:** P2 — sequential scan on every NIF search
- **Recommended fix:** Add a composite B-tree index in migration 0015:

  ```sql
  CREATE INDEX patients_nif_idx ON patients (tenant_id, nif);
  ```

  Postgres can use `(tenant_id, nif)` for prefix searches because `tenant_id = ?` (from RLS) anchors the left side and `nif LIKE 'digits%'` uses prefix scanning on the right side.

---

### P3 — Nit

---

**5. `getAgendaOptions` stable reference data fetched fresh on every page load**

- **File:** `apps/web/lib/scheduling/data.ts:117–157`
- **Issue:** Therapists, locations, and services are fetched fresh on every agenda page load with no caching. These lists change at most a few times per year (new therapist hired, new location opened). Fetching them on every navigation adds 3 unnecessary DB round-trips to the agenda's critical path.
- **Severity:** P3 — minor latency; low-frequency data
- **Recommended fix:** Wrap the therapist, location, and service sub-queries in `unstable_cache` with `revalidate: 60` (or longer). Alternatively, use `React.cache()` to deduplicate within a single request if concurrent callers exist. Do not cache the patient sub-query — it should be removed per finding #1 above.

---

**6. `listAppointments` composite index does not cover `location_id`**

- **File:** `apps/web/lib/scheduling/data.ts:81–101` and `supabase/migrations/0000_empty_runaways.sql`
- **Issue:** `listAppointments` commonly filters on both `starts_at` (date range) and `location_id` for location-filtered agenda views. The existing indexes are:
  - `appointments_tenant_start_idx(tenant_id, starts_at)` — serves date range with tenant
  - `appointments_practitioner_start_idx(practitioner_id, starts_at)` — serves practitioner filter

  Neither index includes `location_id`. A location-filtered week view uses `appointments_tenant_start_idx` to narrow by date, then applies a post-scan filter on `location_id`. At small appointment counts this is negligible.

- **Severity:** P3 — low impact at launch; worth adding before heavy use
- **Recommended fix:** Add a covering index in migration 0015:

  ```sql
  CREATE INDEX appointments_tenant_start_location_idx
    ON appointments (tenant_id, starts_at, location_id);
  ```

  This enables index-only scans for the most common multi-filter agenda query (date range + location).

---

## Index coverage summary

| Table | Column(s) queried | Index exists? | Index type | Serves the query? |
|---|---|---|---|---|
| `appointments` | `(tenant_id, starts_at)` | ✅ `appointments_tenant_start_idx` | B-tree | Yes — full-week, no filter |
| `appointments` | `(practitioner_id, starts_at)` | ✅ `appointments_practitioner_start_idx` | B-tree | Yes — therapist-filtered view |
| `appointments` | `(tenant_id, starts_at, location_id)` | ❌ Missing | — | No — post-scan filter |
| `patients` | `(tenant_id, full_name)` ORDER BY | ✅ `patients_tenant_name_idx` | B-tree | Yes — for `listPatients` ordering |
| `patients` | `full_name ILIKE '%text%'` | ❌ No GIN/trgm | — | No — falls back to seq scan |
| `patients` | `nif ILIKE 'digits%'` | ❌ Missing | — | No — seq scan |
| `patients` | `regexp_replace(phone,…) LIKE '%digits%'` | ❌ Unindexable as-is | — | No — per-row compute |

---

## N+1 query check

- **`listAppointments`** — single JOIN query (patients, users, locations, services). No N+1. ✅
- **`getAppointment`** — same single JOIN query. No N+1. ✅
- **`listPatients` / `searchPatients`** — single query per call. No N+1. ✅
- **`getAgendaOptions`** — 4 parallel queries in `Promise.all`. No N+1. ✅

---

## Caching summary

| Layer | Caching present? | Recommendation |
|---|---|---|
| `listAppointments` | ❌ None | Not needed — query is bounded and changes frequently |
| `getAgendaOptions` (therapists/locations/services) | ❌ None | `unstable_cache(revalidate: 60)` — stable data |
| `getAgendaOptions` (patients) | ❌ None | Remove entirely (see finding #1) |
| `searchPatients` | ❌ None | Not needed — user-typed query, always fresh |

---

## Summary

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | **P1** | `lib/scheduling/data.ts:138` | `getAgendaOptions` fetches unbounded patient list — blocks agenda load |
| 2 | **P1** | `lib/patients/queries.ts:79` | Phone search runs `regexp_replace` on every row — seq scan, unindexable |
| 3 | **P2** | `lib/patients/queries.ts:75` | `ILIKE '%name%'` bypasses B-tree index — needs GIN trgm index |
| 4 | **P2** | `lib/patients/queries.ts:77` | NIF prefix search has no index on `patients.nif` |
| 5 | **P3** | `lib/scheduling/data.ts:117` | Stable reference data (therapists/locations/services) not cached |
| 6 | **P3** | `lib/scheduling/data.ts:96` | No covering index for location-filtered agenda view |

**2 P1s, 2 P2s, 2 P3s.** The two P1s are the critical path to hitting the plan targets. Finding #1 (unbounded patient fetch on the agenda critical path) is the highest-priority fix — it blocks the < 1 s agenda target at any meaningful patient count. Finding #2 (phone regex) blocks the < 300 ms search target for digit-containing queries.
