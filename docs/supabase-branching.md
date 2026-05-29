# Supabase branching — ephemeral DB branch per PR

Every pull request gets its own throwaway Supabase database, built from the
committed migrations and seed, and wired to that PR's Vercel preview deploy.
Because RLS and the auth hook live in migrations, each branch is a faithful
copy of production's security posture — not a hand-configured snowflake.

This doc owns the **env-var naming contract** (CONTRACT 1) that the app, drizzle
and CI all consume, and documents how the auth-hook **enablement** (CONTRACT 2)
is carried into branches. Local single-project setup lives in
[`supabase-setup.md`](./supabase-setup.md); read this when working on previews.

---

## How a branch is built

When branching is enabled and the GitHub integration is connected (see
[Enablement](#one-time-enablement), the only non-config step), opening a PR makes
Supabase:

1. Provision an ephemeral Postgres branch off the production project.
2. Apply `supabase/migrations/*.sql` in version order (`0000` → `0003`).
3. Run `supabase/seed.sql`.
4. Read `supabase/config.toml` to configure the branch (auth, hooks, etc.).

Supabase branching does **not** run drizzle-kit. The schema source of truth is
`packages/db/migrations/` (drizzle), applied to production by `pnpm db:migrate`.
`supabase/migrations/` holds a byte-identical mirror so the branching pipeline
sees the same SQL. The mirror is generated, not hand-edited:

```bash
pnpm db:generate            # (in packages/db) author a new migration
pnpm db:sync-supabase       # mirror it into supabase/migrations/
git add packages/db/migrations supabase/migrations
```

CI (`.github/workflows/supabase-branch-sync.yml`) runs
`pnpm db:sync-supabase:check` and fails the PR if the two directories drift, so
a branch can never be built from stale schema. See
`scripts/sync-supabase-migrations.mjs` for the why.

> **Why mirror instead of relocating drizzle output or symlinking?** Relocating
> drizzle's `out` dir was ruled out — it touches migration plumbing and the
> drizzle `meta/` journal. A symlink was ruled out because it's unverifiable
> whether Supabase's branching backend follows symlinks when it reads the repo;
> a broken hook on every preview is the exact failure this work removes. A
> drift-guarded copy is deterministic regardless of how Supabase reads the tree.

### Inheritance: what every branch gets for free

| Concern | Mechanism | Inherited by branches? |
|---|---|---|
| Schema (13 tables, enums, FKs) | `0000_empty_runaways.sql` | ✅ migration |
| RLS policies + immutability trigger + JWT helpers | `0001_rls.sql` | ✅ migration |
| `custom_access_token_hook` **function** | `0002_auth_token_hook.sql` | ✅ migration |
| `authenticated` table/sequence GRANTs | `0003_grants.sql` | ✅ migration |
| Auth-hook **enablement** toggle | `config.toml` → `[auth.hook.custom_access_token]` | ✅ config (CONTRACT 2) |
| Demo tenant + role rows | `supabase/seed.sql` | ✅ seed |

The function existing (migration) and the toggle being on (config) are two
different things — see CONTRACT 2.

---

## CONTRACT 1 — env vars per branch

The app and drizzle read two database URLs. Names are fixed; T1 (auth/db
runtime) and T2 (migrations/CI) consume exactly these.

| Var | Pooler / port | Host shape | Used by |
|---|---|---|---|
| `DATABASE_URL` | **transaction** pooler, `:6543` | `…pooler.supabase.com:6543` | app runtime — `packages/db` (postgres.js + drizzle) per request. `SET LOCAL` / `set_config(…, true)` are transaction-scoped, so transaction mode is correct. |
| `DATABASE_URL_DIRECT` | **session** pooler, `:5432` | `…pooler.supabase.com:5432` | migrations / advisory locks — `drizzle-kit migrate`. Session mode supports session-level advisory locks; the transaction pooler does not. |

Both point at the **session/transaction pooler host** (`…pooler.supabase.com`),
not the legacy direct host (`db.<ref>.supabase.co`). The session pooler on
`:5432` provides session semantics (advisory locks) over IPv4 and is what preview
branches expose; prefer it over the direct connection. `drizzle.config.ts`
already reads `DATABASE_URL_DIRECT` first and falls back to `DATABASE_URL`.

Also required by the app on previews (Supabase-prefixed, public/secret split):

| Var | Scope |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public — branch API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public — branch anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only — branch service-role key |

### Per-branch injection mechanism

The **Supabase ↔ Vercel integration** injects per-branch credentials into the
matching Vercel **Preview** deployment automatically — each PR's preview points
at its own branch DB, with no manual env entry per PR.

The integration writes its own variable names (e.g. `POSTGRES_URL`,
`POSTGRES_URL_NON_POOLING`, `SUPABASE_*`). Map them to the names above once, in
**Vercel → Project → Settings → Environment Variables**, scoped to **Preview**.
Two options:

- **Reference mapping** — set `DATABASE_URL` to the integration's pooled
  (`:6543`) value and `DATABASE_URL_DIRECT` to its session (`:5432`,
  `…pooler.supabase.com`) value. Confirm the integration's pooled var is
  transaction mode; if it only supplies session/non-pooling, derive the `:6543`
  transaction URL from the same credentials.
- **Build-time normalization** — read the integration's vars in a small build
  step and re-export under our names.

> Secrets are **not** set in this repo or by this change. Wiring the integration
> and the Preview-scoped values is a Vercel/Supabase dashboard action.

CI (T2) that runs `pnpm db:migrate` against a branch must set
`DATABASE_URL_DIRECT` to that branch's `:5432` session-pooler URL — same name,
same semantics as local.

---

## CONTRACT 2 — auth-hook enablement as config-as-code

The hook has two independent halves:

1. **Function** — `public.custom_access_token_hook(jsonb)`, created by
   `0002_auth_token_hook.sql`. Branches inherit it via migrations. ✅
2. **Enablement** — the toggle that tells GoTrue to *call* the function on every
   token issuance. This is normally a project-level dashboard setting
   (Authentication → Hooks) and **does not propagate to DB branches.**

Without (2), a branch login succeeds but issues a token with **empty `tenant_id`
/ `user_role` claims**; `getRequestContext()` returns `null` and every
tenant-scoped query/RLS check fails. To make enablement travel with every
branch and local reset, it is declared in `supabase/config.toml`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

CI asserts this stanza stays present and enabled. Do not remove it; production's
dashboard toggle and this config must agree.

---

## One-time enablement (not config-as-code)

Two actions cannot be expressed in-repo and must be done once in the dashboards:

1. **Supabase → Branching** → enable branching for project
   `jaxmkwoxjcgzkwxgbayx`, connect the GitHub repo, set the production branch to
   `main` and the supabase directory to `supabase/`.
2. **Supabase → Integrations → Vercel** → connect the Vercel project so preview
   branch credentials are injected (CONTRACT 1).

Everything else (migrations, seed, auth-hook enablement) is in the repo.

---

## Verifying hook + RLS inheritance

### Locally (proves config + migrations before any branch exists)

```bash
supabase start
supabase db reset      # applies 0000..0003 + seed, reads config.toml
```

`db reset` activates `[auth.hook.custom_access_token]`, so a local login goes
through the same path a branch does. Confirm the hook is wired:

```bash
# function present (inherited via 0002)
supabase db query "select proname from pg_proc where proname = 'custom_access_token_hook';"
# RLS enabled (inherited via 0001) — expect rowsecurity = t
supabase db query "select relrowsecurity from pg_class where relname = 'patients';"
```

The RLS/GRANT end-to-end SQL block in
[`supabase-setup.md`](./supabase-setup.md#5-verify-rls--grants-end-to-end) runs
unchanged against a branch's SQL editor.

### Acceptance: prove the claim flow on a preview

The seed creates the demo tenant `00000000-0000-0000-0000-0000000000a1` and its
roles, but intentionally **no auth user** (no committed credentials). To prove a
branch login yields populated claims:

1. On the branch (Supabase Studio for that branch), create an auth user
   (Authentication → Users → Add user), note its UUID.
2. Link a `public.users` row to the demo tenant + a role:
   ```sql
   insert into public.users (id, tenant_id, role_id, email, full_name, is_active)
   select
     '<auth-user-uuid>',
     '00000000-0000-0000-0000-0000000000a1',
     r.id, '<email>', 'Preview User', true
   from public.roles r
   where r.tenant_id = '00000000-0000-0000-0000-0000000000a1'
     and r.slug = 'admin';
   ```
3. Log in against the **preview deploy** for that PR, then decode the access
   token (or inspect `getRequestContext()`). Expect:
   ```json
   { "tenant_id": "00000000-0000-0000-0000-0000000000a1", "user_role": "admin" }
   ```

Populated claims = the function (migration 0002) **and** the enablement toggle
(config CONTRACT 2) both inherited correctly. Empty claims = enablement didn't
travel → confirm the `[auth.hook.custom_access_token]` stanza is in the branch's
`config.toml`.
