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

> **RESOLVED 2026-06-12 (PR fix/ui-aa-token-pass):** accepted (recommended default). Recorded as the approved Wave 1 icon dependency in brand-tokens.md ("Approved runtime dependencies") and SPEC-foundation §3.

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

> **RESOLVED 2026-06-12 (PR fix/ui-aa-token-pass):** corrected SPEC §4.1 (and §2 contrast) to the shipped values — primary fill `accent-2-700`, hover `accent-2-800`, active `accent-2-900` with `text-inverse`. AA wins on conflict.

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

> **RESOLVED 2026-06-12 (PR fix/ui-aa-token-pass):** added the full `error` 50–900 scale (base `#B23A3A` pinned at 700, generated the same way as the brand scales) to brand-tokens.md §1.8/§7 and theme.css. Destructive Button now uses `error` base with `error-800`/`error-900` hover/active (replacing the interim `brightness-*`). Note: base pins at 700 (matching the doc's dark-saturated-base convention, e.g. accent-1), so hover/active are 800/900, not the 600/700 the question speculated.

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

## 2026-06-11 — Q11: `success` and `warning` semantic text fail WCAG AA on their tints (StatusChip)

> **RESOLVED 2026-06-12 (PR fix/ui-aa-token-pass):** added AA-dark text tokens `success-700` (`#127B59`) and `warning-700` (`#956302`) (≥4.5:1 on their tints and white). StatusChip success/warning labels now use the `-700` token; the colored dot keeps the base tone (3:1 graphical). SPEC §4.5 + brand-tokens.md §1.8 updated.

Context: SPEC-foundation §4.5 sets each StatusChip tone's text to the matching
semantic color on its `-bg` tint. Measured contrast (12px text → needs 4.5:1):

| Tone | text on -bg | AA |
|---|---|---|
| success `#2F8F6B` on `#E6F4EE` | 3.52:1 | FAIL |
| warning `#B47A14` on `#FBF1DD` | 3.27:1 | FAIL |
| error `#B23A3A` on `#F8E5E5` | 4.87:1 | pass |
| info `#2E6FA8` on `#E4EEF7` | 4.52:1 | pass |
| neutral `text-secondary` on `surface-muted` | 5.10:1 | pass |

`success` and `warning` are accent/icon colors — they also fail AA as small text
on plain white (3.67:1 / 3.66:1), so no light background rescues them. There is
no darker semantic token to fall back to (same gap as Q10 for `error`).

Interim implementation (W1-04): for the success and warning tones only, the chip
keeps the tinted bg and the colored 8px dot (a graphical object, 3:1 — both pass)
but renders the **label in `text-primary`** so it clears AA. error/info/neutral
use the semantic text per spec. The dot + tint still carry the tone.

Recommended default: **add AA-dark semantic text tokens** (e.g. `success-700`,
`warning-700`, ideally full `50–900` scales for all four semantics) to
brand-tokens.md §1.8/§7 and theme.css, then switch every StatusChip tone to its
semantic `-700` text for a uniform colored-text treatment. Not blocking for W1-04.

## 2026-06-11 — Q12: global focus-ring color (accent-2-500) is below the 3:1 focus-indicator threshold on white

> **RESOLVED 2026-06-12 (PR fix/ui-aa-token-pass):** added a single `focus-ring` token (= `accent-2-600`, ≈3.3:1, clears SC 1.4.11) and migrated every `ring-accent-2-500` in packages/ui to `ring-focus-ring` in one coordinated edit. SPEC §2 + brand-tokens.md §1.9 updated. Follow-up: `apps/web/components/app-shell.tsx` also hardcodes the old ring; out of this PR's scope (apps/ not in the self-merge fence) — see DECISIONS.

Context: SPEC-foundation §2 mandates the global focus ring as "2px ring in
`accent-2-500`". `accent-2-500` (#45B9A7) measures ~2.4:1 against white /
`surface`, below the WCAG 2.1 SC 1.4.11 (non-text contrast) 3:1 minimum for a
focus indicator. This is **system-wide**: every interactive component built so
far (Button W1-01, Input/Textarea/Select W1-02/W1-03, Checkbox/Switch W1-03,
Card W1-04) uses `ring-accent-2-500`. The W1-01 a11y review explicitly judged the
ring acceptable (reading the teal "trap" as applying only to text on teal fills,
not to ring contrast); the W1-04 a11y review took the stricter 1.4.11 view.

Decision taken: W1-04 keeps `accent-2-500` to stay identical to the four merged
components and SPEC §2 — changing the ring in one new component would make its
focus ring visibly inconsistent with every other control. The fix belongs at the
token/spec level, applied to all components at once.

Recommended default: **change the global focus-ring token to `accent-2-600`**
(#3A9C8D, ~3.3:1 on white — clears 1.4.11) in SPEC §2 + a single coordinated PR
updating every component's `ring-accent-2-500` → `ring-accent-2-600`. The visual
change is a barely-perceptible one-step-darker teal. Not blocking for W1-04.


## 2026-06-11 — Q13: SPEC §4.11 portal bottom-nav colors fail WCAG AA

> **RESOLVED 2026-06-12 (PR fix/ui-aa-token-pass):** corrected SPEC §4.11 to the shipped AA-safe tokens — active `accent-2-700` (≈4.8:1), inactive `text-secondary` (≈5.5:1).

Context: SPEC-foundation §4.11 specifies the portal bottom-tab bar as "active in
`accent-2-600`, inactive `text-muted`". As 12px label text both fail WCAG AA
4.5:1 (accent-2-600 #3A9C8D ≈ 3.3:1; text-muted #8A98A6 ≈ 2.9:1), and the
inactive 24px icon at 2.9:1 fails even the 3:1 graphical-object bar.

Interim implementation (W1-10): the portal tabs use AA-safe tokens — active
`accent-2-700` (#2F7E72 ≈ 4.8:1) and inactive `text-secondary` (#56697A ≈ 5.5:1),
both clearing the text 4.5:1 and icon 3:1 bars. The active color stays teal, one
step darker than the spec value (a barely-perceptible change).

Recommended default: **correct SPEC §4.11** to active `accent-2-700` / inactive
`text-secondary`. Same family as Q9 (teal-on-light text) and Q11 (text-muted is
a deemphasized-label token, not body/UI text). Not blocking for W1-10.

## 2026-06-14 — Wave 3 portal owner-confirmable items (consolidated from PR bodies, W4-10)

The Wave 3 portal PRs (#197–#206) recorded owner-confirmable items in their PR
bodies because `docs/QUESTIONS.md` is outside the Wave 3 path allowlist.
Consolidated here for owner review; per-PR detail remains in the PR bodies.

- **Portal language switcher omitted — no i18n layer yet (#199 W3-02, #205 W3-06).**
  String i18n was deferred in W3-01, so a functional PT|EN switcher has nothing to
  switch; per SPEC-portal §0.1 (omit missing-data elements) it is omitted (W3-06
  shows a read-only "Português (PT)" row). **Recommended default:** add a portal
  i18n-infrastructure ticket, then wire the switcher. (Same gap exists on staff
  `/login`, W4-02 — both wait on a shared i18n runtime.)

- **Booking flow data-layer gaps (#204 W3-05).** The therapist Select (§7.3),
  service categories (§7.2), and the Notas Textarea (§7.4) were omitted because
  the booking catalog exposes no therapists/categories and the booking API
  accepts no notes (SPEC §0.1). Booking success deliberately shows pending wording
  ("Marcação recebida"), never "confirmed." **Recommended default:** confirm
  whether the booking API should expose therapist/category selection and accept
  notes; if yes, a data-layer ticket precedes restoring those controls.

- **In-portal form *filling* deferred — significant gap (#206 W3-07).** The intake
  catalog exposes only form *titles*, not field schemas, and the portal has no
  form-rendering engine, so SPEC-portal §10's "restyle the form engine" had
  nothing to restyle. The Documents/Forms screen shows the patient's *submitted*
  fichas with honest review status instead. **Recommended default:** a foundation
  ticket to (a) define intake field schemas and (b) build/borrow a portal
  form-rendering engine, then a follow-up to add filling + submit — submissions
  must always land in `pending_review`, never "concluído."

- **Portal heritage stays OFF until JP sign-off** (already tracked as Q6 above);
  Wave 3 added no heritage motifs to any patient-facing surface.
