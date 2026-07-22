# W11-01 - Recon + SPLIT PLAN v1 (Wave 11 Separacao de Producao)

Read-only recon of the live Supabase project `jaxmkwoxjcgzkwxgbayx`, produced by
GREEN 2026-07-21. No DB write, no dashboard mutation, no secret VALUES, no row PII.
The live reads ran inside a single `SET TRANSACTION READ ONLY` transaction (counts +
object metadata only) using the repo's own postgres.js driver on
`DATABASE_URL_DIRECT`. Ends in a versioned **SPLIT PLAN v1** that W11-02/03/04
execute. **OWNER-MERGE.**

## Verdict summary
- No live security/privacy exposure found (clinical bucket is PRIVATE, RLS enabled
  on every domain table, immutability trigger ENABLED, no leaked secret). Not a HALT.
- Migration mirror parity HOLDS; schema head `0037`. The new project's schema is
  stood up FROM the committed migrations (source of truth), not a hand dump.
- One reconcile item for W11-02: migrations define 51 `CREATE POLICY`; live shows 50
  policies. The new project (built from migrations) will land 51; verify the intended
  set at provisioning.
- Residue disposition (Q-W11-01-1) is OWNER-RULED: the immutable signed-record island
  + soft-deleted patients STAY BEHIND on the frozen old project; new prod starts clean.

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

**Residue island (STAYS BEHIND, per Q-W11-01-1 ruling):** the 5 `signed` (immutable,
trigger-pinned) `clinical_records` + their `clinical_episodes`/`attachments`/
`patient_note_revisions`/`appointments`, and the 6 soft-deleted `patients`. The exact
per-record partition (which of the 24 drafts / 4 episodes / 6 attachments / 5 note
revisions / 4 appointments / 1 ingestion request are residue-linked vs real) is
resolved at the W11-03 read-only pre-flight, governed by the rule below.

**Retained-real set (TRAVELS to clean prod):** the operational config (users, roles,
tenants incl. `settings`, locations, services, service_location_prices, service_packs,
therapist_services, availability_templates, form_templates, time_off) + the 1 active
patient and its NON-signed real clinical data + the 26 storage objects that belong to
travelling attachments. `analytics_events` and `audit_log` start fresh on new prod
(default; old project retains the full history) - see Q-W11-01-2.

---

## SPLIT PLAN v1

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
- Opens ONLY on the exact owner phrase `AUTORIZO MIGRACAO plan v1` + the mandatory
  **CYAN-before** checkpoint + staff writes PAUSED. The OLD project is READ-ONLY
  throughout (source + rollback); the target is the NEW project.
- **Read-only pre-flight** (authoritative re-count): capture the CURRENT per-table
  counts on the OLD project and compute the travels/stays partition:
  - STAYS BEHIND: `clinical_records` where `status='signed'` (immutable) + their
    episodes/attachments/note_revisions/appointments; `patients` where
    `deleted_at IS NOT NULL`. Never write to these; never attempt to delete the signed
    island (the trigger blocks it - do not fight it).
  - TRAVELS: operational config (users/roles/tenants/locations/services/
    service_location_prices/service_packs/therapist_services/availability_templates/
    form_templates/time_off) + `patients` where `deleted_at IS NULL` + their NON-signed
    real clinical data + the storage objects of travelling attachments.
  - `analytics_events` + `audit_log`: start fresh on new prod (Q-W11-01-2 default).
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

**Plan version: SPLIT PLAN v1.** W11-03's authorization phrase names this version
(`AUTORIZO MIGRACAO plan v1`).

---

## Open questions (recommended defaults; never self-decided)

### Q-W11-01-1 - Does the BLOCKED residue island travel to the new project or stay behind? - RULED
**OWNER-RULED (2026-07-21 evening):** the immutable signed-record island STAYS BEHIND on
the frozen old project; new prod starts clean. So the 5 `signed` clinical_records (+ their
episodes/attachments/note-revisions/appointments) and the 6 soft-deleted patients do NOT
migrate. Recorded here as the governing partition rule for W11-03. (Rationale: a clean
prod holds only live real data; the frozen old project preserves the signed residue for
any legal-retention need; migrating immutable signed synthetic records would re-import
exactly what the split exists to shed.)

### Q-W11-01-2 - Do `audit_log` (674) and `analytics_events` (8) travel, or start fresh? - OPEN
**Recommended default: START FRESH on the new project; the old (frozen) project retains
the full audit/analytics history.** The audit_log is append-only history spanning the
synthetic build era + real usage; copying it drags synthetic history into the clean prod
and complicates the trigger/immutability guarantees, while the frozen old project
preserves the complete trail for any retention/legal need. If the owner needs continuous
audit history on new prod, the alternative is to copy only the real-usage-era rows - a
per-row classification to be scoped at the W11-03 pre-flight. Owner rules at W11-03.
