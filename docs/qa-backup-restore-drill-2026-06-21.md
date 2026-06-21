# QA — Logical Backup/Restore Drill — 2026-06-21

**Performed by:** Claude Code  
**Date:** 2026-06-21  
**Prod project:** `jaxmkwoxjcgzkwxgbayx` (Supabase EU Frankfurt, PostgreSQL 17.6)  
**Local restore target:** PostgreSQL 17.10 (homebrew, ARM64 macOS, throwaway)  
**Purpose:** Validate that a complete logical backup of prod can be produced and cleanly restored; establish a baseline RTO and confirm data integrity independent of Supabase PITR.

---

## 1. Scope and Method

### What was tested
- `pg_dump` with `--format=custom --schema=public --no-owner` against prod via session pooler
- `pg_restore` into a throwaway local PostgreSQL 17 instance
- Row-count parity for all 15 populated key tables
- Index count parity per table
- RLS enabled status on all 21 tables
- RLS policy count parity per table
- Spot-checks: tenant/location names, clinical_record status distribution, form template keys, audit_log action distribution, roles
- Immutability trigger (`clinical_records_enforce_immutability`) — live fire test
- Foreign key constraint count

### What was NOT tested
- Storage bucket contents (Supabase Storage, not included in logical dump by design)
- Supabase Auth (`auth.*` schema — excluded from `--schema=public`)
- Cross-database sequences from Supabase-managed schemas
- Drizzle migration tracking table (lives in `drizzle.__drizzle_migrations`, excluded)

---

## 2. Timing and Size

| Metric | Value |
|--------|-------|
| Dump method | `pg_dump -Fc --schema=public --no-owner` |
| Dump source | Prod via session pooler (port 5432, EU Frankfurt) |
| **Dump time** | **18 s** |
| **Dump size** | **139 KB** |
| **Restore time** | **1 s** |
| **Measured RTO (dump + restore)** | **~19 s** |

_RTO above is "logical backup only" — does not include time to provision a new Postgres instance, restore Supabase Auth, or update DNS. A full disaster-recovery RTO via this method would be ~15–30 min including instance setup. Supabase PITR (Pro plan) achieves sub-5-min RPO and sub-10-min RTO without manual steps — see §6._

---

## 3. Row-Count Parity

All counts are exact (not approximate). Prod baseline captured immediately before the dump; restored counts captured immediately after restore.

| Table | Prod rows | Restored rows | Match? |
|-------|-----------|---------------|--------|
| `patients` | 54 | 54 | ✓ |
| `appointments` | 0 | 0 | ✓ |
| `clinical_episodes` | 4 | 4 | ✓ |
| `clinical_records` | 2 | 2 | ✓ |
| `attachments` | 0 | 0 | ✓ |
| `invoices` | 0 | 0 | ✓ |
| `audit_log` | 40 | 40 | ✓ |
| `migration_staging_rows` | 0 | 0 | ✓ |
| `quick_notes` | 0 | 0 | ✓ |
| `form_templates` | 5 | 5 | ✓ |
| `tenants` | 1 | 1 | ✓ |
| `users` | 4 | 4 | ✓ |
| `locations` | 2 | 2 | ✓ |
| `services` | 7 | 7 | ✓ |
| `roles` | 4 | 4 | ✓ |

**Result: 15/15 tables ✓ — perfect parity.**

---

## 4. Schema Integrity

### RLS enabled
All 21 tables have `relrowsecurity = true` in the restored DB. ✓

### Index count parity

| Table | Prod | Restored | Match? |
|-------|------|----------|--------|
| `ai_ingestion_requests` | 5 | 5 | ✓ |
| `appointments` | 6 | 6 | ✓ |
| `attachments` | 3 | 3 | ✓ |
| `audit_log` | 4 | 4 | ✓ |
| `availability_templates` | 4 | 4 | ✓ |
| `clinical_episodes` | 3 | 3 | ✓ |
| `clinical_records` | 6 | 6 | ✓ |
| `form_templates` | 3 | 3 | ✓ |
| `invoices` | 3 | 3 | ✓ |
| `locations` | 2 | 2 | ✓ |
| `migration_staging_rows` | 4 | 4 | ✓ |
| `patient_form_submissions` | 4 | 4 | ✓ |
| `patient_locations` | 4 | 4 | ✓ |
| `patients` | 7 | 6 | ⚠ −1 (see note) |
| `quick_notes` | 3 | 3 | ✓ |
| `roles` | 3 | 3 | ✓ |
| `service_location_prices` | 3 | 3 | ✓ |
| `services` | 3 | 3 | ✓ |
| `tenants` | 2 | 2 | ✓ |
| `time_off` | 2 | 2 | ✓ |
| `users` | 3 | 3 | ✓ |

**⚠ patients index deviation:** `patients_full_name_trgm_idx` (GIN trigram) did not restore because `pg_trgm` is a Supabase-bundled extension not installed on the throwaway local PG17. This is expected in any non-Supabase environment. On a Supabase restore (real DR path), this extension would be present. See §5.

### RLS policy count parity

Prod has 21 tables with policies totalling 35 policies. Restored DB has 34 policies — one deviation:

| Table | Prod | Restored | Notes |
|-------|------|----------|-------|
| `quick_notes` | 1 | 0 | `quick_notes_own_row` references `auth.uid()` from Supabase's `auth` schema; fails silently in vanilla Postgres. Expected. On Supabase restore this would be present. |
| All other tables | — | — | Exact match ✓ |

### Foreign key constraints
55 FK constraints restored. ✓

### Immutability trigger
`clinical_records_enforce_immutability` trigger present and live-tested:
```
UPDATE on signed record → ERROR: clinical_records <id>: status=signed is finalized and immutable; create a new versioned record (addendum) instead
```
✓ Trigger fires correctly on the restored DB.

---

## 5. Expected Deviations (Not Failures)

These are expected differences between a restore into bare PostgreSQL vs a restore into Supabase:

| Item | Reason | Impact on real DR? |
|------|--------|-------------------|
| `patients_full_name_trgm_idx` missing | `pg_trgm` extension not installed on local PG17 | None — Supabase bundles pg_trgm; would be present after `CREATE EXTENSION pg_trgm` |
| `quick_notes_own_row` policy missing | References `auth.uid()` from Supabase `auth` schema, absent locally | None — auth schema present on Supabase restore target |
| `CREATE SCHEMA public` error | Public schema already exists in local PG17 | Benign — pg_restore continues |
| Supabase Auth data absent | `--schema=public` intentionally excludes `auth.*` | Restore of Supabase Auth requires separate `supabase db dump --data-only --schema auth` or Supabase dashboard export |
| Storage files absent | Object storage not in pg_dump | Restore of files requires `supabase storage cp` or bucket-level sync |
| `drizzle.*` schema absent | Excluded by `--schema=public` | Drizzle migration history can be re-registered from `_journal.json` if needed |

---

## 6. Recommended Production Layer: Supabase PITR (Pro)

This drill validates the **floor**: a logical backup-and-restore procedure achieves:
- RPO: ~0 minutes if dump is taken continuously (or the last dump age)
- RTO: ~19 s for data load + ~10–30 min for instance provisioning and Supabase Auth restore

Supabase PITR (available on the Pro plan) provides a substantially better baseline:

| Capability | Logical dump (this drill) | Supabase PITR (Pro) |
|-----------|--------------------------|---------------------|
| RPO | Age of last dump | 5 minutes (continuous WAL streaming) |
| RTO (data) | ~19 s load | Sub-10 min automated |
| Auth data | Manual export required | Included |
| Storage | Manual sync required | Included |
| Point-in-time | Only to dump timestamp | Any point in last 7 days |
| Operator effort | Manual procedure | One-click in dashboard |

**Recommendation:** upgrade to Supabase Pro and enable PITR as the primary recovery mechanism. Maintain this logical dump procedure as a secondary "portable" backup (useful for migrations, local dev refresh, or if Supabase infrastructure is unavailable).

---

## 7. PII Handling

- Dump file `/tmp/osteojp_prod_drill_20260621_141252.pgdump` — **deleted at end of drill**
- Local database `osteojp_drill` — **dropped at end of drill**
- Local PG17 server — **stopped at end of drill**
- No patient data was committed to git
- No patient data was pasted in this document (counts only, no row contents)
- Drill performed on the operator's machine; dump file never left the local filesystem

---

## 8. Drill Checklist

- [x] pg_dump from prod (custom format, schema=public, no-owner) — **18 s, 139 KB**
- [x] Throwaway local PG17 (homebrew) stood up
- [x] pg_restore into local DB — **1 s, 3 expected errors**
- [x] Row-count parity: 15/15 key tables match exactly
- [x] RLS enabled: 21/21 tables
- [x] Index parity: 20/21 tables (1 expected deviation: pg_trgm)
- [x] Policy parity: 20/21 tables (1 expected deviation: auth.uid())
- [x] FK constraints: 55 restored
- [x] Immutability trigger: live-tested and confirmed firing
- [x] PII cleanup: dump deleted, local DB dropped, server stopped
- [x] Deviations documented and explained
