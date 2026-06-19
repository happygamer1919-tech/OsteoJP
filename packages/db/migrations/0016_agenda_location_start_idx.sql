/* ================================================================== */
/* 0016 — covering index for location-filtered agenda view            */
/*                                                                    */
/* Problem: the agenda's listAppointments query filters by            */
/*   tenant_id (injected by RLS) + location_id + starts_at range.    */
/* The existing (tenant_id, starts_at) index cannot eliminate         */
/* location_id without a heap fetch per row, forcing a post-scan      */
/* filter for every location-scoped week view.                        */
/*                                                                    */
/* Fix: composite index (tenant_id, location_id, starts_at) lets the */
/* planner do a range scan on (tenant_id, location_id) anchored to   */
/* starts_at, avoiding per-row heap access for the location filter.   */
/*                                                                    */
/* The existing (tenant_id, starts_at) index is kept — it continues  */
/* to serve the no-filter full-week query more efficiently.           */
/* ================================================================== */

CREATE INDEX IF NOT EXISTS appointments_tenant_location_start_idx
  ON appointments USING btree (tenant_id, location_id, starts_at);
