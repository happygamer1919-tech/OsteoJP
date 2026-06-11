# Open questions for the owner

Append-only. Mark items answered, never delete.

## 2026-06-10 — Q1: Local env vars missing, build and e2e gates fail locally (ANSWERED 2026-06-10)

Resolution: owner chose "pull from Vercel". Executed partially. apps/web was
linked to the osteojp-platform Vercel project and `vercel env pull` ran, but
the Vercel development environment contains no variables (only an OIDC token).
All five real vars (Supabase URL and keys, DATABASE_URL) exist in Production
scope only, and production secrets were deliberately NOT pulled to local files
(local e2e would mutate the production clinical DB). apps/portal has no Vercel
project to pull from. Follow-ups opened as Q3 and Q4 below. Original entry:

Context: `pnpm build` fails (portal app, prerender of /auth/login and
/auth/activate: "@supabase/ssr: Your project's URL and API key are required")
and `pnpm test:e2e` fails at Playwright auth setup. Neither `apps/portal` nor
`apps/web` has a `.env.local`. Lint, typecheck, and unit tests pass.

Recommended default: pull development env vars from Vercel
(`vercel env pull .env.local` per linked project) for apps/web and apps/portal.
Production secrets stay in Vercel and Supabase dashboards only.

## 2026-06-10 — Q2: Is docs/mega-plan.md the SPEC? (ANSWERED 2026-06-10)

Resolution: owner confirmed mega-plan IS the spec. docs/mega-plan.md was copied
to docs/SPEC.md (now the single source of truth) and mega-plan.md replaced with
a pointer to avoid divergence. Original entry:

Context: global rules require `docs/SPEC.md` as the source of truth for scope.
This repo has `docs/mega-plan.md` instead, plus a missing `docs/BACKLOG.md`
(tickets appear to live in a task graph referenced by stream letters).

Recommended default: treat `docs/mega-plan.md` as the SPEC and the existing
stream/ticket graph as the backlog; rename or symlink only if the owner wants
strict file-name compliance.

## 2026-06-10 — Q3: How should local dev and e2e environments get credentials? (ANSWERED 2026-06-10)

Resolution: owner chose a separate Supabase project for dev/staging (not
production, not local Docker). Decision: never point local dev or e2e at the
production Supabase instance. A dedicated non-production Supabase project will
be used for Development-scoped env vars in both Vercel projects. The six E2E_*
credentials (admin, therapist, reception email/password pairs) will be added to
the Development environment once the dev Supabase project is created. Until
then, local e2e remains reliant on CI's seeded DB workflow. Original entry:

Context: the Vercel development environment is empty; the only env vars on the
osteojp-platform project are Production-scoped (Supabase URL/keys, DATABASE_URL,
service role key). Pulling production secrets locally is unsafe: `pnpm test:e2e`
creates and mutates data, which would hit the production clinical database.
e2e additionally needs `E2E_ADMIN_EMAIL/PASSWORD`, `E2E_THERAPIST_EMAIL/PASSWORD`,
`E2E_RECEPTION_EMAIL/PASSWORD` plus a seeded database (CI provides this via the
"seeded DB" workflows; local does not).

## 2026-06-10 — Q4: apps/portal has no Vercel project (ANSWERED 2026-06-10)

Resolution: Vercel project created manually by Max (2026-06-10). Project name:
osteojp-portal. Root directory: apps/portal. Team: Ivan_Bong_420's projects
(Hobby). Node.js version set to 22.x. Speed Insights and Web Analytics both
disabled. Three env vars added (all environments, non-sensitive):
  NEXT_PUBLIC_SUPABASE_URL=https://jaxmkwoxjcgzkwxgbayx.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key — public, in Vercel dashboard>
  NEXT_PUBLIC_API_URL=https://api.osteojp.pt
Production deployment confirmed green at osteojp-portal.vercel.app.
Custom domain patient.osteojp.pt to be wired at go-live. Original entry:

Context: the team has exactly one Vercel project (osteojp-platform, root
directory apps/web). apps/portal cannot pull env vars and has no deployment
target. Portal QA to date appears to have run locally.

## 2026-06-11 — Q6: Brand tokens: vector logo source + Heritage theme sign-off

Context: docs/brand-tokens.md was rewritten as the single source of truth for
the UI redesign. Two items need owner/JP input.

(a) No vector logo (SVG/EPS/AI) exists in the repo. Color scales were generated
from the hexes sampled at 300 DPI from Logotipo_OsteoJP_2023.pdf (#98B2C2 grey,
#8B1863 magenta, #45B9A7 teal), which match CLAUDE.md. The redesign brief
supplied different approximations (#8FA8B8 / #8E2A6E / #17A398). All sets are
listed in the doc's provenance table, marked "pending verification against
vector source". Recommended default: keep the PDF-sampled values as canonical;
when JP provides the logo SVG, extract exact fills and regenerate scales only
if they differ.

(b) Heritage theme (tenant-scoped Moldovan embroidery + azulejo decorative
layer, recolored to brand palette, decorative surfaces only) is documented in
brand-tokens.md section 6 but marked "pending JP sign-off for patient-facing
surfaces". Recommended default: ship with the neutral (no-motif) default for
all tenants; do not enable on any patient-facing surface until JP signs off.
