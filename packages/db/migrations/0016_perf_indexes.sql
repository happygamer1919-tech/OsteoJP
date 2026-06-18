-- Finding #3 (P2): full-name substring search — ILIKE '%text%' cannot use the
-- existing B-tree index. A GIN trigram index lets Postgres use an index scan
-- for infix patterns.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "patients_name_trgm_idx" ON "patients" USING gin ("full_name" gin_trgm_ops);

-- Finding #4 (P2): NIF prefix search — ilike(patients.nif, 'digits%') is a
-- prefix query that CAN use a B-tree, but no index on nif existed. tenant_id
-- is the leading column so RLS-scoped queries can do an index scan on nif
-- within the tenant's slice.
CREATE INDEX "patients_nif_idx" ON "patients" USING btree ("tenant_id", "nif");
