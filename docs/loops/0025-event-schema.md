# Loop 0025 - Event schema (KPI/analytics feed)

GATE: 0024 DONE (merged on main). Do not run until met.

## Field 1. Scope and ground truth
Migration 0025. Greenfield KPI/analytics event table per docs/design/wave-01/SPEC-events.md. NOT the generic audit_log (that is PII-free change-tracking, actor plus field-changed, no old-to-new values). This new layer is the KPI feed and the appointment status-transition history. SPEC-events is ground truth for the exact schema; the fields below are the floor, implement the SPEC in full where it specifies more. Deploy early so capture starts before the dashboard exists, nothing is lost. Financial events store GROSS amounts; VAT is applied at report time, never at capture (VAT 0 vs 23 is an open accountant question, do not guess it here). This is 0025.
Same credential and mirror ground truth as 0024 (packages/db/.env; generate mirror and --check before PR).

## Field 2. Ordered steps
1. Fresh-main sync: branch osteojp-event-schema (worktree fallback).
2. Read docs/design/wave-01/SPEC-events.md in full (ground truth). Read-only recon to confirm no event table already exists.
3. Write migration 0025 creating the event table per SPEC-events. Floor schema if SPEC does not override:
   - id (uuid pk), tenant_id (uuid not null), event_type (text or enum per SPEC), entity_type (text), entity_id (uuid nullable), actor_user_id (uuid nullable), payload (jsonb not null default '{}'), occurred_at (timestamptz not null), created_at (timestamptz not null default now()).
   - appointment_status_changed carries in payload: appointment_id, from_status, to_status, actor, timestamp. This row is BOTH the transition history and the KPI feed.
   - Any monetary field stored gross.
4. RLS tenant-scoped, fail-closed. INSERT for the app role, SELECT for reporting. Follow SPEC-events if it specifies the policy shape. Keep the table PII-lean by contract, like audit_log.
5. Index tenant_id plus occurred_at (and event_type if SPEC calls for report queries on it).
6. Generate Supabase mirror, run --check, confirm clean.
7. Apply on dev, confirm clean, confirm db tests pass.

## Field 3. Definition of done (machine-verifiable)
- SPEC-events read and shipped schema matches it (note any point where SPEC overrode the floor).
- 0025 applies clean on dev.
- Event table exists with tenant-scoped fail-closed RLS (paste policy list).
- An inserted appointment_status_changed test row round-trips with appointment_id/from_status/to_status/actor in payload (paste row), then purge it (paste delete with RETURNING).
- mirror --check passes, db tests green (paste count).

## Field 4. Verification (paste evidence)
SPEC-alignment note, apply output, table + RLS introspection, round-tripped test row, purge with RETURNING, mirror --check line, db test count.

## Field 5. Restrictions and scope boundary
Capture layer only. No dashboard, no report, no VAT logic. Gross only. Do not merge with audit_log. Do not touch db-tests.yml or e2e.yml. tenant_id from JWT. No merge-bypass.

## Field 6. Halt loud if
SPEC-events contradicts the floor in a way that changes intent, an event table already exists, or a monetary field would need VAT at capture. Stop and report, do not guess VAT.

## Field 7. Report back
SPEC-alignment note, 0025 apply-clean, table+RLS present, test event round-trip y/n, test row purged, mirror --check, db test count, PR number.

Close: open a PR per template.
