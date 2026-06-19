-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0017_perf_indexes.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

-- Finding #4 (P2): NIF prefix search — ilike(patients.nif, 'digits%') is a
-- prefix query that CAN use a B-tree, but no index on nif existed. tenant_id
-- is the leading column so RLS-scoped queries can do an index scan on nif
-- within the tenant's slice.
--
-- Note: Finding #3 (full-name trigram search) was already addressed by
-- migration 0015 which created patients_full_name_trgm_idx. No duplicate.
CREATE INDEX IF NOT EXISTS "patients_nif_idx" ON "patients" USING btree ("tenant_id", "nif");
