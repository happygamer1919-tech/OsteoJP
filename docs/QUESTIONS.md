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

docs/brand-tokens
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

## 2026-06-11 — Q5: Migrated clinical records: land as `draft` or `locked`, and do they need a dedicated source tag?

Context: the migration pipeline foundation (branch migration-foundation) can
import historical Fisiozero clinical records as either `draft` or `locked`
(`signed` is excluded: a signature attests review in THIS system and cannot be
carried over). Two owner decisions are pending before the real import runs:

1. Default record_status for migrated history. `locked` makes imported history
   immutable immediately (consistent with "migrated history is never
   rewritten"; the importer already refuses to update an imported clinical
   record on re-runs). `draft` would let therapists edit migrated records,
   which risks silently altering historical clinical data.
2. Provenance tag. record_source currently has `manual | ai_ingested |
   patient`. Migrated records are imported as `manual` for now; provenance is
   fully recoverable via the staging ledger (migration_staging_rows maps every
   imported row back to its Fisiozero source id). Adding a dedicated
   `migrated` enum value would make provenance visible in the UI/queries
   without joining the ledger, at the cost of one more enum migration.

Recommended default: (1) `locked`, (2) keep `manual` + ledger provenance for
V1, add a `migrated` source value only if the UI later needs to badge
migrated records. This touches clinical data retention semantics, so it is
owner-confirmable (CLAUDE.md). Not blocking: the foundation supports both
options; the decision is needed before the first real batch (Phase 5).
main

## 2026-06-11 — Q7: Canonical radius/type scales shift existing screen rendering — confirm redesign direction

Context: the new brand token layer (feat/ui-design-tokens) implements
docs/brand-tokens.md exactly. The doc's **radius** scale and **type** scale
reuse standard Tailwind utility names (`rounded`, `rounded-md/lg/xl`,
`text-xs/lg/xl/2xl/3xl/4xl`) but with values shifted from Tailwind's defaults:

- `rounded` 4px → 6px; `rounded-md` 6→8; `rounded-lg` 8→12; `rounded-xl` 12→16.
- `text-xs` gains weight 500; `text-lg` line-height 28→26 + weight 500;
  `text-xl/2xl/3xl/4xl` gain weight 600; `text-3xl` size 30→32; `text-4xl`
  size 36→40.

Because installing the canonical tokens necessarily redefines these utilities,
in-scope `apps/web` screens render slightly rounder and some headings slightly
heavier/larger — even though no component file was edited. This brushes against
the ticket guardrail "existing screens render visually unchanged except the
font swap." Patient portal usage is the heaviest but is out of V1 scope
(CLAUDE.md) so excluded from review.

Recommended default: **keep the doc values as canonical** (the doc is the single
source of truth; this is the intended redesign direction) and verify per-screen
in the redesign/restyle tickets rather than reverting. Alternative if pixel
parity is required now: scope the doc's radius/type scales to opt-in classes
(e.g. a `.brand` container) instead of overriding the global Tailwind scale —
more code, defers the canonical switch.

Not blocking: the token layer ships either way; this only decides whether the
modest web visual drift is accepted now or deferred. No clinical/legal impact.
main

## 2026-06-11 — Q8: lucide-react added to packages/ui (new runtime dependency)

Context: task W1-01 (docs/design/PLAN.md) and SPEC-foundation §3 explicitly
approve `lucide-react` as "the one new runtime dependency approved for Wave 1",
added in `packages/ui` only. Logging it here because the global rule requires a
QUESTIONS.md entry for any new third-party dependency before it lands.

Scope of use: icon components only (`currentColor`, stroke-width 1.75, sizes
16/20/24 per SPEC §3). No telemetry, no runtime services, MIT-licensed, tree
-shakeable per-icon imports. EU-residency / PII rules unaffected (client-side
SVG rendering only).

Recommended default: **accept** (already spec-approved). No action needed unless
the owner wants a different icon library. Not blocking.

## 2026-06-11 — Q9: SPEC-foundation §4.1 primary Button fill fails WCAG AA — used accent-2-700

Context: SPEC-foundation §4.1 specifies the primary Button as `accent-2-600`
fill with `text-inverse` text, hover `accent-2-700`, active `accent-2-800`. But
white text on `accent-2-600` measures ~3.3:1, below the WCAG AA 4.5:1 floor for
normal text (Button labels are 12–16px, none qualify as "large text"). This
contradicts SPEC §2 ("filled teal surfaces that carry text use accent-2-600 or
darker"; the author assumed 600 cleared AA), SPEC §5.2, and the a11y-reviewer
contract. `accent-2-700` on white measures ~4.8:1 and passes.

Decision taken to keep the W1-01 a11y gate green: primary Button ships as fill
`accent-2-700`, hover `accent-2-800`, active `accent-2-900` (all real tokens,
each one step darker, preserving the spec's interaction-darkening intent).

Recommended default: **correct SPEC-foundation §4.1** to start the primary teal
button at `accent-2-700`. Per the spec's own hard rule (brand-tokens.md / AA
wins on conflict, log it), this is the conforming resolution. Not blocking for
W1-01; flag if the owner wants the lighter teal for brand reasons (would require
a non-text-inverse foreground, re-opening contrast).

## 2026-06-11 — Q10: `error` semantic token has no numeric scale for destructive hover/active

Context: SPEC-foundation §4.1 destructive Button calls for hover "darken one
step" and active "darken two steps", but brand-tokens.md §1.8/§7 define `error`
only as a single value (`#B23A3A`) plus `error-bg` — there is no `error-600/700`
to step down to, unlike the teal/magenta scales. Per the loop rule ("if a needed
token does not exist … log it; the loop does not invent values") this gap is
logged rather than filled with an off-document hex.

Interim implementation: destructive hover/active darken via the standard
`brightness-90` / `brightness-75` utilities (no new hex, no arbitrary value),
which approximates one/two steps without inventing a token.

Recommended default: **add an `error` numeric scale** (`error-600`, `error-700`,
optionally full 50–900) to brand-tokens.md §1.8/§7 and theme.css, then switch
destructive hover/active to `error-600`/`error-700`. Not blocking for W1-01.
