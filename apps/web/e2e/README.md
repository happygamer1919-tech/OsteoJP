# E2E tests (Playwright)

Browser end-to-end specs for the **stable, owner-confirmed** workflows only:

- **auth** — login, invalid-credentials, tenant + role carried in the session
- **patients** — list, search (name/NIF/phone), create, edit, soft-delete,
  restore, merge; soft-deleted absent from active views; cross-tenant denial
- **scheduling** — agenda, book, reschedule, therapist conflict detection
- **clinical** — create from the current form version, sign/lock immutability,
  versioning (addendum); current-version-only picker; reception has no access

Out of scope (in flux): **Admin**, **Reminders**, billing.

These are **not** run in CI — CI is vitest-only (lint + typecheck + unit/integration).
The suite needs a running app plus a seeded Supabase tenant, which is not quick
or stable enough for the PR gate. Run it locally against dev or a preview.

## One-time setup

```bash
pnpm install
pnpm --filter web exec playwright install chromium
```

## Running locally (against local Supabase)

```bash
# 1. Bring up Supabase and apply migrations + base seed (tenant + roles).
supabase start
supabase db reset

# 2. Provision the deterministic E2E fixture (tenant + 3 role users + base data).
#    Uses the local service-role key by default; override via env if needed.
node apps/web/e2e/seed/seed-e2e.mjs

# 3. Run the suite. Export the seeded credentials + app env, then run Playwright
#    (it starts `pnpm dev` for you). Values below are the local Supabase defaults.
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(supabase status -o json | jq -r .ANON_KEY)"
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
export E2E_ADMIN_EMAIL=e2e-admin@osteojp.test       E2E_ADMIN_PASSWORD='E2ePassw0rd!'
export E2E_THERAPIST_EMAIL=e2e-therapist@osteojp.test E2E_THERAPIST_PASSWORD='E2ePassw0rd!'
export E2E_RECEPTION_EMAIL=e2e-reception@osteojp.test E2E_RECEPTION_PASSWORD='E2ePassw0rd!'

pnpm --filter web e2e
```

The fixture (`e2e/seed/seed-e2e.mjs`) and the constants specs assert against
(`e2e/fixtures.ts`) are the single source of truth for the seeded data — keep
them in sync. The seed is idempotent: re-run it any time.

### Useful invocations

```bash
pnpm --filter web e2e e2e/patients.spec.ts   # one file
pnpm --filter web e2e -g "conflict"          # by title
pnpm --filter web e2e:ui                      # interactive UI mode
BASE_URL=https://<preview>.vercel.app pnpm --filter web e2e   # against a preview
```

## How auth works

`auth.setup.ts` logs in as each seeded role and saves the browser session to
`e2e/.auth/<role>.json`. The single `chromium` project defaults to the **admin**
session; clinical/reception specs override per-file with
`test.use({ storageState })`. Role + tenant claims come from the
`custom_access_token_hook` (enabled in `supabase/config.toml`), so the JWT the app
verifies carries `tenant_id` + `user_role` — the same claims RLS reads.

The unauthenticated specs in `auth.spec.ts` need only the app up; everything else
depends on the `setup` project and the seeded users.
