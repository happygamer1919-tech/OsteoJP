---
description: Query migration_staging_rows in prod Supabase and report batch status, counts by entity_type and status, and any failed rows with their error_detail.
---

You are running the OsteoJP migration staging health check. Query the
production Supabase database and produce a structured report.

## Database connection

Project: `jaxmkwoxjcgzkwxgbayx` (Supabase EU Frankfurt)
Repo root: `/Users/sm33xy/Projects/OsteoJP`

Use the Supabase CLI (already linked to the project) to run queries:

```bash
cd /Users/sm33xy/Projects/OsteoJP
npx supabase db query --linked "<SQL>"
```

If the CLI is unavailable or not linked, fall back to `psql "$DATABASE_URL"`
where `DATABASE_URL` is the value from `.env.local` or the shell environment.
If neither is available, report: "Cannot connect — DATABASE_URL not set and
supabase CLI not linked." and stop.

## Queries to run (run all, in order)

### 1. Batch summary

```sql
SELECT
  batch_id,
  source_system,
  MIN(created_at)::date AS started,
  MAX(updated_at)::date AS last_updated,
  COUNT(*)              AS total_rows,
  COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
  COUNT(*) FILTER (WHERE status = 'validated') AS validated,
  COUNT(*) FILTER (WHERE status = 'imported')  AS imported,
  COUNT(*) FILTER (WHERE status = 'failed')    AS failed
FROM migration_staging_rows
GROUP BY batch_id, source_system
ORDER BY started DESC;
```

### 2. Entity-type × status breakdown (across all batches)

```sql
SELECT
  entity_type,
  status,
  COUNT(*) AS count
FROM migration_staging_rows
GROUP BY entity_type, status
ORDER BY entity_type, status;
```

### 3. Failed rows (most recent 20)

```sql
SELECT
  id,
  batch_id,
  source_system,
  entity_type,
  source_id,
  error_detail,
  updated_at
FROM migration_staging_rows
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 20;
```

### 4. Stuck rows (pending or validated for >24 h)

```sql
SELECT
  id,
  batch_id,
  source_system,
  entity_type,
  source_id,
  status,
  created_at,
  NOW() - created_at AS age
FROM migration_staging_rows
WHERE status IN ('pending', 'validated')
  AND created_at < NOW() - INTERVAL '24 hours'
ORDER BY created_at ASC
LIMIT 20;
```

## Output format

Print a clean text report:

```
=== OsteoJP Migration Staging Health — <timestamp> ===

BATCH SUMMARY
<table from query 1, formatted as aligned columns>

ENTITY × STATUS BREAKDOWN
<table from query 2>

FAILED ROWS (last 20)
<table from query 3, or "None" if empty>

STUCK ROWS >24h (pending/validated, last 20)
<table from query 4, or "None" if empty>

VERDICT
- Total batches: N
- Total rows: N  (pending: N | validated: N | imported: N | failed: N)
- Failed rows: N  [ALERT if >0]
- Stuck rows: N   [ALERT if >0]
```

If there are any ALERT items, end with a plain-text summary of what is wrong
and which batch_id + entity_type combination to investigate first.

Do not expose PII from the `raw` column — query only `error_detail`, which is
structured (codes + field paths only, never source values per CLAUDE.md rule 7).
