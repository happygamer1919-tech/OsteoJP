-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0039_services_internal_only.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0039 — services.internal_only (W12-26, Q-W12-04 / R15)              */
/*                                                                    */
/* A service that staff CAN book internally but that NEVER appears in  */
/* the patient-portal booking wizard (e.g. "Diversos"). DECOUPLED from */
/* is_active (the coupled-flags lesson): is_active controls whether a  */
/* service is bookable at all; internal_only controls PORTAL VISIBILITY */
/* only. The portal catalog query excludes internal_only = true; the   */
/* staff booking/agenda includes it (no change to staff behaviour).    */
/*                                                                    */
/* NOT NULL DEFAULT false: every existing row ships false, so nothing  */
/* changes until a service is explicitly flagged. Column-only add on   */
/* an existing table — services keeps its tenant_id + RLS unchanged    */
/* (no new policy needed; the standard services_tenant_isolation still */
/* gates every row). No grant change (the table grant already covers   */
/* the new column).                                                    */
/* ================================================================== */

ALTER TABLE "services" ADD COLUMN "internal_only" boolean DEFAULT false NOT NULL;
