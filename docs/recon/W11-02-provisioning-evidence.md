# W11-02 - Provisioning verification evidence (Wave 11 Separacao de Producao)

Item-by-item verification that the NEW production Supabase project is a schema +
config clone of the old project, holding NO real data. Owner performed the
dashboard steps; GREEN executed the DB-reachable steps (delegated 2026-07-22) and
verified everything against SPLIT PLAN v2. **OWNER-MERGE.**

- NEW project ref: `dfotoodqvmjhbdcxyaxf` (Frankfurt, Pro). Old project
  `jaxmkwoxjcgzkwxgbayx` NOT touched (zero writes).
- Credential handling: read from `~/osteojp-secrets/new-prod.env` at runtime,
  referenced as `<NEW_DIRECT>`, never committed. (A prior malformed paste leaked
  the value once in session output; owner advised to rotate - tracked separately.)

## Verdict: PASS (DB-side). Dashboard items owner-attested. Ready to merge.

---

## DB-side (GREEN-executed, delegated) - all PASS

### Sanity guard (before any write)
- target ref is NOT the old project (`jaxmkwoxjcgzkwxgbayx`): PASS
- target ref IS the expected new project (`dfotoodqvmjhbdcxyaxf`): PASS
- database EMPTY before apply (0 public base tables, 0 rows): PASS
- exit 0. No migrate would have run had any check failed.

### Step 3 - Extensions (enabled BEFORE the schema)
- before: `pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp` (Supabase defaults)
- enabled `pg_trgm`
- required set present (`pg_trgm, pgcrypto, uuid-ossp, supabase_vault, pg_stat_statements`): PASS - exit 0

### Step 4 - Schema from the committed migrations, to head 0037
- `pnpm db:migrate` -> "migrations applied successfully!" - exit 0
  (benign NOTICEs: idempotent `DROP ... IF EXISTS`, `pg_trgm already exists`, 63-char
  identifier truncation. WARNINGs: "no privileges were granted for auth/jwt" - a GRANT
  on the auth/jwt schema was a no-op for the migration role; schema check clean +
  isolation proven below, so benign. Flagged for owner review.)
- `pnpm db:check` -> "Everything's fine" - exit 0
- `drizzle.__drizzle_migrations` count = **38** (= journal entries, head `0037`)
- 0037 objects present: `service_packs`, `patient_pack_instances`
- Applied via committed migrations (drizzle-kit migrate, session pooler 5432), NOT a hand dump.

### Safety mechanisms
- Immutability trigger `clinical_records_enforce_immutability`: **ENABLED** (`tgenabled='O'`)
- Append-only `record_annulments`: policies = {INSERT, SELECT} only (no UPDATE/DELETE)
- Append-only `audit_log`: policies = {INSERT, SELECT} only
- Auth-hook FUNCTION `public.custom_access_token_hook`: present
- **Claim-flow isolation probe** (tenant A vs B, run in a transaction, ROLLED BACK):
  - tenant A sees **1** (its own probe row), tenant B sees **0** (isolation) -> PASS
  - probe residue after rollback: **0** (zero data left; no cleanup needed)

### RLS
- tables with RLS enabled: **28**; tables with RLS force-off: **0** (no gap)
  - **28-vs-29 reconcile (W11-03):** CYAN observed **29** tables with `relrowsecurity`; this
    count of **28** is the `public` schema (app tables) only. The delta is `storage.objects`
    (Supabase-managed, RLS on, part of the private-bucket / signed-URL model): 28 public + 1
    `storage.objects` = 29. Both correct at their scope; no gap.
- policy count: **50** - matches the old project's 50.
  - **50-vs-51 reconcile:** `packages/db/migrations` has 51 `CREATE POLICY` statements;
    the net policy set is 50 (one policy is superseded/replaced across migrations). The
    NEW project is built purely from the migrations and lands exactly 50 - identical to
    the old live project. No policy missing; the migrations are the source of truth.

### Storage
- bucket `clinical-attachments`: **private** (`public=false`), **0 objects** (empty)
- `storage.objects` RLS: **enabled** on both projects
- storage.objects custom policies: **0 on OLD, 0 on NEW** (identical). The old project
  carries NO custom storage RLS policies - the security model is **private bucket +
  signed-URL-only** access (service_role generates time-limited signed URLs; CLAUDE.md
  "signed URLs only"). Nothing to replicate; NEW matches OLD. (Not a gap.)

### Empty-data confirmation
- 28 domain tables, **all empty** (0 rows) - no real data present. The migration is W11-03.

---

## Dashboard (owner-performed, owner-attested 2026-07-22)
- **Region/tier:** Frankfurt (`eu-central-1`), Pro - EU residency satisfied.
- **Data preferences:** "Improve models with this project's data" OFF (project + team).
- **Auth hook REGISTRATION:** Authentication -> Hooks -> Customize Access Token ->
  `public.custom_access_token_hook` selected + saved. (SQL cannot read GoTrue config;
  the FUNCTION is present and RLS reads the claim, both verified above - the dashboard
  registration is owner-attested. A real-login JWT check is the final confirmation,
  available once the app points at NEW in W11-03/04 Preview smoke.)
- **Auth config:** providers + URL config (SITE_URL + redirect URLs = prod hosts) +
  JWT expiry mirrored. Email templates 4/4 copied + re-verified (one heading corrected
  on NEW to match intent). SMTP (Resend EU) host/port/sender mirrored; key entered by
  the owner from vault (by name; never seen by GREEN).
- **Secrets by name:** the 5 Supabase-scoped values confirmed present on NEW (URL, anon,
  service_role, DATABASE_URL, DATABASE_URL_DIRECT); legacy anon + service_role in use.
  Integration secrets (HMAC/Inngest/Resend/Twilio/Stripe/InvoiceXpress/Sentry) carry over
  unchanged and are set into Vercel in W11-04.

---

## Gates
- `pnpm lint`, `pnpm typecheck` green; docs-only change (`git diff --name-only origin/main`
  = `docs/` only). GREEN created no project, set no secret, and made zero writes to the
  old project; the only new-project writes were `pg_trgm` + the schema migrations
  (owner-delegated) and the rolled-back isolation probe.

## Outcome
The new Frankfurt Pro project is a verified schema+config clone at head `0037` with RLS,
the immutability trigger, append-only relations, the auth-hook function + working claim
flow, a private empty bucket, and NO real data. W11-02 DONE pending owner merge. The data
migration is W11-03 (see `W11-03-migracao-plan-v1.md`), owner-gated by `AUTORIZO MIGRACAO
plan v1`.
