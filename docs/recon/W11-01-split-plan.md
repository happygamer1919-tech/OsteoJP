# W11-01 - Recon + SPLIT PLAN v2 (Wave 11 Separacao de Producao)

> v2 (2026-07-22) folds in the owner's exclusion-set ruling: the migration EXCLUDES a
> named set of soft-deleted patients + their full data trees (nothing is deleted; the old
> project keeps everything; the immutability trigger is never touched). See section (c)
> and Q-W11-01-1/-2. v1 was the initial recon + plan (2026-07-21).

Read-only recon of the live Supabase project `jaxmkwoxjcgzkwxgbayx`, produced by
GREEN 2026-07-21. No DB write, no dashboard mutation, no secret VALUES, no row PII.
The live reads ran inside a single `SET TRANSACTION READ ONLY` transaction (counts +
object metadata only) using the repo's own postgres.js driver on
`DATABASE_URL_DIRECT`. Ends in a versioned **SPLIT PLAN v2** that W11-02/03/04
execute. **OWNER-MERGE.**

## Verdict summary
- No live security/privacy exposure found (clinical bucket is PRIVATE, RLS enabled
  on every domain table, immutability trigger ENABLED, no leaked secret). Not a HALT.
- Migration mirror parity HOLDS; schema head `0037`. The new project's schema is
  stood up FROM the committed migrations (source of truth), not a hand dump.
- One reconcile item for W11-02: migrations define 51 `CREATE POLICY`; live shows 50
  policies. The new project (built from migrations) will land 51; verify the intended
  set at provisioning.
- Residue disposition RULED (Q-W11-01-1, 2026-07-22): a NAMED exclusion set of soft-
  deleted patients `{94,108,109,118,119,120,121,122}` + full data trees STAYS BEHIND on
  the frozen old project (no deletions, trigger untouched). Active patients = 0, so new
  prod migrates operational config ONLY. `audit_log`/`analytics_events` start fresh
  (Q-W11-01-2 RULED). The island HALT-check and safety re-enumeration are baked into the
  W11-03 pre-flight.

---

## (a) Project inventory

### Project identity + region
- Project `jaxmkwoxjcgzkwxgbayx`, **PostgreSQL 17.6**, host `aws-1-eu-central-1.pooler.supabase.com` = **eu-central-1 (Frankfurt)**. EU residency satisfied (CLAUDE.md rule 8).
- The NEW project MUST also be Frankfurt (`eu-central-1`), Vercel `fra1`, Resend EU. A US-region resource for stored data is a HALT (W11-02/03).

### Extensions (LIVE)
`pg_stat_statements 1.11`, `pg_trgm 1.6`, `pgcrypto 1.3`, `plpgsql 1.0`,
`supabase_vault 0.3.1`, `uuid-ossp 1.1`.
- Only `pg_trgm` is created by a migration (`0000_empty_runaways.sql`; used by the
  patient phone/name trigram indexes, `0015`). The rest are Supabase defaults or
  enabled outside migrations.
- **W11-02 must ENABLE the full set BEFORE applying migrations** (a missing extension
  breaks the apply). `pgcrypto`/`uuid-ossp` back id generation; `supabase_vault` backs
  the delete-password secret; `pg_stat_statements` is Supabase default.

### RLS (defense-in-depth, keyed on the JWT `tenant_id` claim)
- **50 policies live** across the `public` schema; **28 tables with RLS ENABLED**, and
  `relrowsecurity = false` on ZERO public base tables (no gap). RLS-enabled tables:
  `ai_ingestion_requests, analytics_events, appointment_notes, appointments,
  attachments, audit_log, availability_templates, clinical_episodes, clinical_records,
  form_templates, invoices, locations, migration_staging_rows, patient_form_submissions,
  patient_locations, patient_note_revisions, patient_pack_instances, patients,
  quick_notes, record_annulments, roles, service_location_prices, service_packs,
  services, tenants, therapist_services, time_off, users`.
- The policy set is defined across the migrations (`0001_rls.sql` + per-table policies
  in later migrations; 51 `CREATE POLICY` statements in `packages/db/migrations`). The
  migrations are the source of truth for the new project; the live 50-vs-migration-51
  delta is a W11-02 verification item (confirm the new project lands the intended set).

### Safety mechanisms (must be reproduced on the new project; CONFIRMED present on old)
- **Immutability trigger** `clinical_records_enforce_immutability` (`0001_rls.sql:252`,
  redefined `0005`): `BEFORE UPDATE OR DELETE`, blocks `locked`/`signed` even for
  `service_role`. LIVE: present, `tgenabled = 'O'` (ENABLED). Must be ENABLED on the
  new project after the from-migrations apply.
- **Auth hook** `public.custom_access_token_hook(event jsonb)` (`0002_auth_token_hook.sql`):
  injects `tenant_id` (from `public.users.tenant_id`) and `user_role` (from
  `public.roles.slug`) into the JWT - the claims the whole RLS + `can`/`assertCan`
  model reads. LIVE: the FUNCTION is present. **The REGISTRATION is a dashboard setting**
  (Auth -> Hooks -> "Customize Access Token (JWT) Claims" -> `public.custom_access_token_hook`)
  and is the single most easily-missed piece of a split - W11-02 must set it and prove
  it via the claim-flow test. The function is recreated by the migration; the
  registration is owner-performed.
- **Append-only relations:** `record_annulments` (`0035`, SELECT + INSERT policies only,
  no UPDATE/DELETE) and `audit_log` append-only writes. Reproduced from migrations.

### Auth settings (dashboard-held; transcribe at W11-02, owner-performed)
Not readable via SQL (GoTrue config). W11-02 (owner) transcribes from the old
project's dashboard to the new project, by name/shape (secrets by NAME only):
providers (email/password + any OAuth), email templates (confirm/invite/recovery/
magic-link) + `SITE_URL` + additional redirect URLs, JWT expiry + JWT secret (by name),
SMTP sender (Resend EU) by name, the access-token hook registration (above), and any
non-default rate-limit/security settings. The auth hook registration is the critical
line item.

### Storage buckets
- **One bucket: `clinical-attachments`, `public = false` (PRIVATE, signed-URL only).**
  **26 objects** live. Referenced by `attachments` (`schema.ts:799-819`). The object
  copy is part of W11-03. Recreate the bucket (private) + its storage RLS policies on
  the new project in W11-02.

### Secrets by NAME only (env / project secrets to rotate to the new project; NEVER a value)
From `.env.example` (canonical) - 26 names:
`DATABASE_URL`, `DATABASE_URL_DIRECT`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`AI_INGESTION_HMAC_SECRET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`,
`INVOICEXPRESS_ACCOUNT_NAME`, `INVOICEXPRESS_API_KEY`, `RESEND_API_KEY`,
`REMINDERS_EMAIL_FROM`, `REMINDERS_LINK_SECRET`, `REMINDERS_LIVE_SEND`,
`REMINDERS_RESCHEDULE_BASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`,
`TWILIO_SMS_FROM`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG`, `SENTRY_PROJECT`.
- The Supabase-scoped ones (`DATABASE_URL`, `DATABASE_URL_DIRECT`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`) are the ones W11-04 swaps to the new project across all
  three Vercel projects. The rest (integrations) are project-agnostic and carry over
  unchanged.

---

## (b) Schema snapshot + mirror parity

- **Migration head `0037`** (`0037_service_packs`); journal `meta/_journal.json` has 38
  entries, last idx 37. `packages/db/migrations` has `0000`..`0037` (38 `.sql`).
- **Mirror parity HOLDS.** `supabase/migrations/*.sql` = the drizzle source + a 4-line
  `AUTO-GENERATED` provenance header (synced by `scripts/sync-supabase-migrations.mjs`).
  Verified: for all 38 files, content-after-the-header is byte-identical to
  `packages/db/migrations`. Zero real (non-header) differences.
- **Journal-sync invariant HOLDS:** 38 journal tags <-> 38 `.sql` files, no orphan on
  either side.
- Consequence: W11-02 stands up the new schema FROM `packages/db/migrations` via manual
  `drizzle-kit` apply to head `0037` (the manual step is the control).

---

## (c) Real-data footprint (LIVE, counts only, no PII)

Captured 2026-07-21 (read-only). Real usage has begun since the W10-02 end state, so
counts have moved; these are indicative - the AUTHORITATIVE capture is the W11-03
read-only pre-flight immediately before the freeze (below).

| Table | Live count | Notes |
|---|---|---|
| users | 19 | operational (travels) |
| roles | 4 | operational (travels) |
| tenants | 1 | operational (travels; incl. `settings` delete-password hash) |
| locations | 2 | CB + LV (travels) |
| services | 19 | catalog (travels) - was 25 at W10-02; catalog changed since |
| service_location_prices | 28 | catalog (travels) |
| service_packs | 14 | catalog (travels) |
| therapist_services | 4 | operational (travels) |
| availability_templates | 13 | operational (travels) |
| form_templates | 8 | operational (travels) |
| time_off | 3 | operational (travels) |
| patients | 7 | **6 soft-deleted (residue) + 1 active (real, travels)** |
| clinical_records | 29 | **5 signed (immutable residue) + 24 draft** |
| clinical_episodes | 4 | partition at pre-flight (real vs residue-linked) |
| attachments | 6 | 26 storage objects in `clinical-attachments` |
| patient_note_revisions | 5 | partition at pre-flight |
| appointments | 4 | partition at pre-flight |
| ai_ingestion_requests | 1 | partition at pre-flight |
| analytics_events | 8 | disposition: start fresh on new prod (default) |
| audit_log | 674 | disposition: start fresh on new prod (default); old keeps full history |
| appointment_notes / invoices / migration_staging_rows / patient_form_submissions / patient_locations / patient_pack_instances / quick_notes / record_annulments | 0 | empty |

**Named exclusion set (STAYS BEHIND on the frozen old project, per the 2026-07-22 owner
ruling extending Q-W11-01-1).** By patient_number: **{94, 108, 109, 118, 119, 120, 121,
122}** - all 8 currently soft-deleted patients. Their ENTIRE data trees stay behind,
followed via BOTH FK paths (`patient_id` AND `clinical_record_id` of the excluded
records). Verified read-only 2026-07-22:
- Immutability island (5 signed records) = exactly #94 (1), #108 (1), #109 (2), #118 (1)
  - the HALT-check that the named numbers map to the island PASSES.
- #119, #120, #121 (`ttt`) are soft-deleted test residue on the ruling list; #122 (a
  duplicate re-entry of #109) was ruled EXCLUDED after the safety-rule HALT.
- **There are ZERO active patients** (all 8 soft-deleted). Owner attests (with staff
  confirmation) that no real patient record entered on the platform needs to travel.

**Net-of-exclusion reconciliation (what MIGRATES to new prod):** operational config ONLY.
Every patient-linked table migrates ZERO rows.

| Table | live total | excluded (stays behind) | MIGRATES |
|---|---|---|---|
| patients | 8 | 8 | **0** |
| clinical_records | 29 | 27 patient-linked + 2 non-patient-linked (see note) | **0** |
| clinical_episodes | 5 | 5 | **0** |
| attachments | 6 | 3 via patient_id + 3 via clinical_record_id of excluded records | **0** |
| patient_note_revisions | 5 | 5 | **0** |
| appointments | 2 | 2 (1 island + 1 #122) | **0** |
| invoices / patient_locations / patient_form_submissions / patient_pack_instances / appointment_notes | 0 | 0 | **0** |
| audit_log | 674 | start fresh (Q-W11-01-2 RULED) | **0** |
| analytics_events | 8 | start fresh (Q-W11-01-2 RULED) | **0** |
| **Operational config (TRAVELS):** users 19, roles 4, tenants 1 (incl. `settings`), locations 2, services 19, service_location_prices 28, service_packs 14, therapist_services 4, availability_templates 13, form_templates 8, time_off 3 | | | **as-is** |

Note: 2 `clinical_records` do not join a patient via `patient_id` (null patient_id /
AI-ingestion staging). The W11-03 pre-flight classifies these 2 explicitly (expected:
residue - no real patient exists to own them) and confirms they stay behind; they must
never migrate as orphans.

---

## SPLIT PLAN v2

### W11-02 - Provisioning checklist (owner-performed; GREEN verifies + HALTs on gap)
1. NEW Supabase project, **Frankfurt (eu-central-1), Pro**. (A US region = HALT.)
2. **Enable extensions FIRST:** `pg_trgm`, `pgcrypto`, `uuid-ossp`, `supabase_vault`,
   `pg_stat_statements` (plpgsql is default). Missing extension = migration apply fails.
3. **Apply schema FROM the committed migrations** via manual `drizzle-kit` (cwd
   `packages/db`, `DATABASE_URL_DIRECT` on 5432), journal verified to head `0037`. Not a
   hand dump.
4. **Auth mirrored** (owner, dashboard): providers, email templates + `SITE_URL` +
   redirect URLs, JWT expiry, SMTP (Resend EU) by name, and **register the access-token
   hook** -> `public.custom_access_token_hook`.
5. **Storage:** recreate the `clinical-attachments` bucket (PRIVATE) + its storage RLS
   policies. (Objects copy in W11-03.)
6. **Secrets set by NAME** (the 26 above), values from the owner's vault - never printed.
7. **Vercel project-setup checklist** reminder (CLAUDE.md, owner-performed): Data
   Preferences off, Node 22.x.
8. **GREEN verification (read-only, no provisioning):** extensions present; journal at
   `0037`; the intended RLS policy set present (reconcile the 50/51 delta); immutability
   trigger ENABLED (`tgenabled='O'`); the `supabase-setup.md` claim-flow SQL test proves
   RLS reads the `tenant_id`/`user_role` claim (auth hook working); bucket PRIVATE; NO
   real data present yet. Any gap (EU-residency / auth-hook / immutability) = HALT-LOUD.

### W11-03 - Freeze-window data-migration runbook (OWNER-GATED)
- Opens ONLY on the exact owner phrase `AUTORIZO MIGRACAO plan v2` + the mandatory
  **CYAN-before** checkpoint + staff writes PAUSED. The OLD project is READ-ONLY
  throughout (source + rollback); the target is the NEW project.
- **Read-only pre-flight** (authoritative re-count + drift guard):
  - **EXCLUSION SET (stays behind):** patient_number `{94, 108, 109, 118, 119, 120, 121,
    122}` and their ENTIRE data trees, followed via BOTH FK paths (`patient_id` AND the
    `clinical_record_id` of every excluded record - so an attachment/annulment/note on an
    excluded record is also excluded). Never write to these; never attempt to delete the
    signed island (the trigger blocks it - do not fight it).
  - **SAFETY RE-ENUMERATION:** re-list ALL soft-deleted patients at pre-flight. Any
    soft-deleted patient NOT in the exclusion set above is NOT auto-excluded - **HALT** and
    present it to the owner for an explicit keep/exclude ruling (real staff may have
    legitimately soft-deleted a real patient during live usage).
  - **TRAVELS:** operational config only (users/roles/tenants incl. `settings`/locations/
    services/service_location_prices/service_packs/therapist_services/
    availability_templates/form_templates/time_off). Zero patient-linked rows (owner
    attests no real patient needs to travel; active patients = 0).
  - `analytics_events` + `audit_log`: start FRESH on new prod (Q-W11-01-2 RULED).
  - **Quiescence guard:** the last accounted cleanup write is the #122 soft-delete of
    2026-07-22. Re-verify quiescence FROM that point forward; any NEW write after the
    2026-07-22 exclusion ruling HALTs per standing drift discipline (as W10-02).
- **Dump/restore parents-before-children**, per-table source->target EXPECTED before/
  after counts, with the **HALT-on-mismatch protocol identical to W10-02**: any count
  mismatch, FK `23503`, immutability/`check_violation`, or storage shortfall HALTs with
  ZERO further writes.
- **Storage:** copy the travelling `clinical-attachments` objects; verify object count
  on target == expected.
- **Preview-smoke BEFORE any Production repoint:** point Preview envs (app + portal) at
  the NEW project and smoke isolation (auth hook claim), patient/ficha/agenda, portal,
  signed-URL attachment download, a write landing on the new project.
- **CYAN-after** checkpoint mandatory. The OLD project is never written.

### W11-04 - Repoint checklist (owner-performed Vercel env swaps; GREEN verifies)
- Swap Production env across all 3 Vercel projects (osteojp-api, osteojp-platform,
  osteojp-portal): `DATABASE_URL` -> new pooler 6543, `DATABASE_URL_DIRECT` -> new direct
  5432, `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` -> new. Redeploy all three.
- GREEN verifies the swap (by name), the 3 green Production deploys (checks API), and a
  Production smoke (isolation via the auth hook, patient/ficha/agenda, portal, signed-URL
  attachment, writes landing on the NEW project). A partial repoint (split-brain) or a
  red smoke = HALT. GREEN edits NO env and triggers NO deploy.

### ROLLBACK story
The OLD project `jaxmkwoxjcgzkwxgbayx` is READ-ONLY-then-FROZEN, never mutated or
deleted during the split. Rollback at ANY step = repoint the Vercel envs back to the old
project (it still holds all data + the signed residue). Retention: frozen 30 days after
cutover, then the owner decides (W11-05). Decommission is a future owner-gated action.

**Plan version: SPLIT PLAN v2.** W11-03's authorization phrase names this version
(`AUTORIZO MIGRACAO plan v2`).

---

## Open questions (recommended defaults; never self-decided)

### Q-W11-01-1 - Residue disposition - RULED (extended to a named exclusion set, 2026-07-22)
**OWNER-RULED.** (v1, 2026-07-21 evening) the immutable signed-record island STAYS BEHIND;
new prod starts clean. (v2, 2026-07-22) extended to a NAMED exclusion set: patient_number
`{94, 108, 109, 118, 119, 120, 121, 122}` and their ENTIRE data trees (via BOTH FK paths,
`patient_id` AND `clinical_record_id` of excluded records) stay behind on the frozen old
project. NO cloud deletions and NO new deletion feature this wave - the migration
exclusion set is the mechanism; nothing is destroyed; the immutability trigger is never
touched. The island HALT-check (the 4 named numbers own exactly the 5 signed records)
PASSED read-only 2026-07-22; #122 (a duplicate re-entry of #109) was ruled EXCLUDED after
the safety-rule HALT. Owner attests (with staff confirmation) that NO active real patient
needs to travel (active patients = 0). Governing rule for the W11-03 pre-flight, with the
SAFETY RE-ENUMERATION (any soft-deleted patient not on the list = HALT for an explicit
owner ruling) and the quiescence guard (any write after 2026-07-22 = HALT).

### Q-W11-01-2 - Do `audit_log` (674) and `analytics_events` (8) travel, or start fresh? - RULED
**OWNER-RULED (2026-07-22): START FRESH on the new project.** `audit_log` and
`analytics_events` are NOT migrated; the frozen old project retains the full audit/
analytics history for any retention/legal need. A clean prod starts with an empty
append-only audit trail. Recorded durable here + in DECISIONS 2026-07-22.
