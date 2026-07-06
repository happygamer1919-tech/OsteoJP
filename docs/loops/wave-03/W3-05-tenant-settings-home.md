# Loop W3-05 - Tenant settings home for server-side hashed secrets (recon-first; migration 0032 only if needed)

GATE: none to start (recon). If a migration is required, it is 0032 and this is the ONLY W3 loop authorized to author a migration — confirm 0031 is the latest migration on main and no other migration PR is open before writing. MIG lane conditionally.

## Field 1. Scope and ground truth
Establish (or locate) a **tenant settings home** where a **server-side hashed secret** can be stored per tenant. The concrete consumer is W3-06: the appointment-hard-delete password, stored hashed as a tenant setting, changeable in Administração, NEVER client-side.

Ground truth (locked context to embed — GREEN runs with zero memory):
- **Migration bookkeeping (Wave 02 close):** migration head is **0031** (`0031_nesa_contraindications`). `packages/db/migrations/` holds **32** `.sql` files (0000–0031); the journal has 32 entries; `supabase/migrations/` holds **32** — mirror in parity 1:1. The next migration number is **0032**.
- **One migration in flight at a time** (repo-wide). Confirm no other migration PR is open before authoring 0032.
- **Hard architecture rules (CLAUDE.md):** every domain table has `tenant_id uuid not null` and an RLS policy keyed on the JWT `tenant_id` claim (fail-closed). Service-role queries set `tenant_id` explicitly. Every migration adding a domain table ships WITH its RLS policy AND an isolation test in the SAME PR (non-negotiable).
- A stale historical comment once referenced `tenants.settings.notes` (STATE 2026-06-30 audit finding #1) — that is a lead, not proof. Recon must confirm what actually exists.

Recon before writing (report findings, paste schema paths):
- Does a suitable per-tenant settings home already exist? Check `packages/db/src/schema.ts` for a `tenants.settings` (jsonb) column or a dedicated tenant-settings/tenant-config table, and its RLS. A "suitable" home is: tenant-scoped, fail-closed RLS keyed on JWT `tenant_id`, and safe to hold a hashed secret that is NEVER exposed to the client (server-read only; not selected into any client payload).
- If a suitable home EXISTS: mark this loop **migration-free** and record EXACTLY where the hashed secret will live (table/column, RLS policy name), so W3-06 can consume it. Confirm nothing client-side reads it.
- If NONE exists: author **migration 0032** for a minimal tenant-settings home — sized ONLY for what W3-06 needs (a per-tenant hashed secret; a small key/value or a single typed column is sufficient — do NOT over-build). Tenant-scoped, RLS FAIL-CLOSED, `tenant_id` derived from the JWT claim ONLY (never payload). Include the RLS isolation test in the same PR.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w3-05-tenant-settings-home origin/main -b osteojp-w3-05-tenant-settings-home`; assert `git rev-parse --show-toplevel` ends in the worktree name; assert `git status --porcelain` empty. HALT if either fails.
2. Recon, report BEFORE writing: whether a suitable tenant-settings home exists, its exact shape + RLS, and whether it is safe for a server-only hashed secret. Decide migration-free vs 0032.
3a. If migration-free: document the exact storage location + RLS for W3-06, add any minimal server-only read/write helper needed (through `packages/db`), and add a test proving the secret is server-scoped and tenant-isolated. No migration files.
3b. If 0032 needed: confirm 0031 is the latest migration on main and no migration PR is open. Author the Drizzle migration 0032 + `schema.ts` definition for a minimal tenant-settings table: `tenant_id uuid NOT NULL` (FK → tenants, cascade), the minimal field(s) to hold a hashed secret, `created_at`/`updated_at`. Enable RLS; add tenant-scoped policies keyed on JWT `tenant_id` (fail-closed); pick the enforcement pattern deliberately (DECISIONS 2026-07-01 append-only conventions — a settings row is mutable, so a normal FOR ALL tenant policy, not append-only). Add the RLS ISOLATION test in the same PR.
4. If a migration was authored: generate the Supabase mirror with `node scripts/sync-supabase-migrations.mjs`, then run it with `--check` and confirm parity (32 → 33 files each side).
5. Apply on dev (if migration); run the full db suite green.

## Field 3. Definition of done (machine-verifiable)
- Recon report pasted with the explicit verdict: migration-free (record the exact existing storage location + RLS) OR 0032 authored (record why no suitable home existed).
- If migration-free: the server-only, tenant-isolated read/write path for the hashed secret is documented and tested (paste the test proving it is not client-exposed and is tenant-scoped).
- If 0032: applies clean on dev (paste apply output); mirror `--check` in parity (paste the pass line, 33 files each side); RLS isolation test green (a tenant cannot read another tenant's settings — paste result); db suite green with the new test included (paste totals vs the 303 baseline).
- W3-06's storage contract is unambiguously specified (where the hashed password lives, how it is written and read server-side, tenant-scoped, never client-side).

## Field 4. Verification (paste evidence)
Recon report + verdict, and EITHER the migration-free server-scoped/tenant-isolated test evidence OR (for 0032) apply-clean output, mirror `--check` parity line, RLS isolation test result, db suite totals vs 303.

## Field 5. Restrictions and scope boundary
- If a migration is authored it is 0032 and this is the ONLY W3 migration; sized ONLY for W3-06's need (a per-tenant hashed secret) — do NOT over-build a general settings system.
- Tenant-scoped, fail-closed RLS, `tenant_id` from the JWT claim ONLY (never payload). Secret is server-read only; never selected into a client payload.
- A migration PR MUST carry its RLS isolation test in the same PR (CLAUDE.md non-negotiable).
- One migration in flight (repo-wide): confirm 0031 latest + no open migration PR before authoring 0032.
- A0 worktree isolation: work only in `../osteojp-w3-05-tenant-settings-home` off origin/main; never edit the primary clone.
- Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`. Never force-push. Never merge with `--admin`. Never bypass branch protection. No raw SQL in app code (access through `packages/db`).

## Field 6. Halt loud if
- 0031 is NOT the latest migration on main, or another migration PR is open (one migration in flight).
- Recon is ambiguous about whether an existing settings home is safe for a server-only secret (e.g. it is selected into a client payload somewhere) — surface it rather than assuming.
- The minimal migration cannot be sized to W3-06's need without pulling in a larger settings redesign (scope creep) — surface the tradeoff.
- The mirror `--check` diverges after generating 0032.
- HALT-LOUD PROTOCOL (all halts, all W3 loops): write a halt file to `~/osteojp-mailbox/inbox/` named `halt-<UTC-timestamp>-W3-05.md` with the mismatch, options, and a recommended default. Poll `~/osteojp-mailbox/outbox/` up to 30 minutes; apply and archive under `~/osteojp-mailbox/archive/` if answered; else classic stop with the branch green and resume state recorded. Never guess a product decision.

## Field 7. Report back
Recon report + migration-free-vs-0032 verdict, the storage contract for W3-06, and the matching evidence (server-scoped test OR apply-clean + mirror parity + RLS isolation + db totals), PR number.
Close: open a PR per template. GREEN chained runner applies the merge gate (every required check SUCCESS, diff touches neither `db-tests.yml` nor `e2e.yml`, PR mergeable). A refused merge is a HALT. W3-06 depends on THIS PR merged.
