# E2E tests (Playwright)

Browser end-to-end specs for the staff platform. These are **not** run in CI —
CI is vitest-only (lint + typecheck + unit/integration). The E2E suite needs a
running app plus a Supabase tenant seeded with test users, which is not quick or
stable enough for the PR gate. Run it locally against dev or a preview.

## One-time setup

```bash
pnpm install
pnpm --filter web exec playwright install chromium   # browser binaries
```

## Required environment

The config (`apps/web/playwright.config.ts`) starts the app with `pnpm dev` and
expects seeded users to exist in the target Supabase tenant:

```
E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
E2E_THERAPIST_EMAIL / E2E_THERAPIST_PASSWORD
E2E_RECEPTION_EMAIL / E2E_RECEPTION_PASSWORD
```

Plus the usual app env (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, …) — see `.env.example`. `auth.setup.ts` logs in
as each role and saves storage state under `e2e/.auth/`.

To run against a deployed preview instead of a local dev server, set `BASE_URL`
(this disables the auto-started `pnpm dev`):

```bash
BASE_URL=https://<preview>.vercel.app pnpm --filter web e2e
```

## Running

```bash
pnpm --filter web e2e                       # full suite
pnpm --filter web e2e e2e/auth.spec.ts      # one file
pnpm --filter web e2e -g "redirected to"    # by title
pnpm --filter web e2e:ui                     # interactive UI mode
```

The unauthenticated-redirect specs in `auth.spec.ts` run without seeded users
(they only need the app up); the rest depend on the `setup` project and the
`E2E_*` credentials above.
