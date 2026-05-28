# Contributing to OsteoJP

How we work on this repo. Read once, refer back when something feels off.

## 1. Workflow

Trunk-based development. `main` is always shippable. All work happens on
short-lived feature branches and lands via PR.

- **One package per branch.** Keep the blast radius small — e.g. a branch
  may touch `packages/auth` _or_ `packages/db` _or_ `apps/web`, not all three.
  If a change genuinely spans packages, break it up or call it out in the PR
  description.
- **Conventional Commits** for subject lines. Type + optional scope + short
  imperative summary:
  - `feat(auth): add assertCan guard`
  - `fix(db): RLS policy on clinical_records reception denial`
  - `chore: bump drizzle-kit`
  - `docs: CONTRIBUTING.md`
  - `ci: add typecheck workflow`
- Body explains the **why**, not the what. The diff already shows the what.

## 2. Worktrees, not branch switching

Each active branch gets its own worktree. This stops two terminals from
fighting over the same working directory and stops uncommitted edits from
following you to the wrong branch.

```bash
# Start a branch
git worktree add ../osteojp-<short-name> -b <branch-name> main
cd ../osteojp-<short-name>

# Finish — after the PR merges
git worktree remove ../osteojp-<short-name>
git branch -d <branch-name>
```

Never run two terminals in one working directory on different branches.
If you need parallel work, spin up another worktree.

## 3. PR review

- Every change lands via PR into `main`. **One approval required.**
- **Squash merge** — keep `main` linear and each PR a single commit.
- **Branch protection** blocks direct pushes to `main`. Don't try.
- **Security-critical files** get heavier review: anything under
  `packages/db` (RLS, schema, migrations), `packages/auth` (permission
  matrix, guards), tenant-isolation code, and clinical-data paths.
- For security-critical PRs, **quote the actual code** in review threads.
  Don't accept self-grades from authoring agents ("typecheck green",
  "tests pass") as proof of correctness — read the diff.

## 4. CI checks

PRs run a single required workflow:

- **Lint + typecheck** — installs with `pnpm install --frozen-lockfile`,
  then runs `pnpm -r typecheck`.

PRs must be green before merge. If CI is red, fix the root cause; do not
disable the check or merge around it.

## 5. Lockfile hygiene

When a package's dependencies change:

1. Run `pnpm install` locally — this updates `pnpm-lock.yaml`.
2. Commit the updated lockfile in the same PR as the dependency change.

CI uses `--frozen-lockfile`, so a forgotten lockfile bump fails the install
step automatically. If CI flags this, run `pnpm install`, commit, push.

## 6. Architectural rules

The detailed rules live in [docs/architecture.md](./docs/architecture.md)
(forthcoming; until then, see [`CLAUDE.md`](./CLAUDE.md) at the repo root).
The non-negotiable invariants:

- **Every domain table has `tenant_id`.** No exceptions.
- **RLS keyed on the JWT `tenant_id` claim** on every domain table.
  Database-layer isolation does not depend on the app remembering to
  filter.
- **Service-role queries must set `tenant_id` explicitly.** Migrations,
  background jobs, and ingestion run as service-role and bypass RLS —
  they own the tenant scoping themselves.
- **Clinical records are immutable once `locked` or `signed`.**
  Corrections after that point are filed as addendum versions, not
  edits in place.
- **EU data residency.** Supabase Frankfurt, Vercel `fra1`, Resend EU.
  No US-region resources for stored data.

## 7. Where things live

```
apps/
  web/             Next.js staff app (App Router)
packages/
  auth/            Permission matrix, role guards, request context
  db/              Drizzle schema, migrations, RLS policies
  ui/              shadcn components + brand tokens
  i18n/            Portuguese / English translations
docs/              Architecture, brand, wireframes, planning docs
supabase/          Local Supabase config + tracked migrations
```

When in doubt, grep `packages/auth/permissions.ts` and the Drizzle
schema in `packages/db` — those two files are the source of truth for
the access model and the data shape.
