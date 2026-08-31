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

**Q6b CLOSED 2026-06-16, JP signed off.** Heritage is approved as a persistent,
restrained, opacity-capped edge frame (HeritageFrame) on the OsteoJP tenant theme,
including staff data screens. It stays tenant-scoped (neutral default for other
tenants) and remains forbidden on the clinical record editor. Adopted as part of the
OsteoJP v2 design system (see DECISIONS.md 2026-06-16, reversal (a), and
SPEC-v2-foundation.md section 6). Q6(a), the vector logo source, stays open.

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

## 2026-06-16: V1.1 functional follow-ups raised by the OsteoJP v2 design specs

These are NON-design backend tickets. The v2 design specs render honest placeholders or
empty states for the widgets below; making them show real data is separate functional work.
None of these are design-loop tasks, and none may add migrations, RLS, auth, payment,
webhook, or workflow changes as part of a design wave. Each needs an owner decision on scope
and priority (V1.1 unless the owner pulls it into V1).

- **Receita (mês) KPI: revenue aggregation.** The dashboard KPI card (SPEC-v2-dashboard
  section 2, card 4) needs a monthly revenue aggregation plus a "vs mês anterior" delta. No
  such aggregation exists in V1. Recommended default: V1.1 functional ticket; the card ships
  with an honest "Sem dados" placeholder until then.
- **Resumo semanal: weekly appointment counts.** The dashboard line chart
  (SPEC-v2-dashboard section 4.2) needs a weekly appointment-count series. Recommended
  default: V1.1 functional ticket; the chart ships with an empty placeholder until then. No
  new data model.
- **Notas rápidas: notes persistence.** The dashboard notes card (SPEC-v2-dashboard section
  5) needs a notes store. None exists in V1. Open question: per-staff-member or
  per-tenant-shared notes. Recommended default: V1.1, per-staff-member; the card ships
  read-only with an empty state until then. No notes table or endpoint added in a design wave.
- **Marcações list query confirmation.** The Marcações nav item and the V2-W7 list view
  reuse the existing appointments fetch rendered as a list (SPEC-v2-agenda section 6). Confirm
  the existing appointments query is sufficient for a list view with no new data model. Until
  the route ships, the nav item points to a placeholder empty state. Recommended default:
  reuse the existing fetch as-is; no new data model.

## 2026-06-18 — Fisiozero extractor dispatch contradicts the migration contract (BLOCKED, owner decision needed)

A "Phase S scaffold plus gated test" dispatch asked for a live Playwright HTML
scraper of app.fisiozero.pt (per-patient ficha/episode/hist HTML + per-patient
XLS + scraped attachment binaries) for all ~7,964 records, feeding the
`FisiozeroSource` seam and writing 0014 ledger rows. Reading the three files the
dispatch told me to conform to, that plan conflicts with the repo on seven
points. Owner chose **"decouple: Tier-1 raw archiver only"** (see DECISIONS.md
2026-06-18); these remain open for the owner to confirm before any Tier-2 /
ledger / import work proceeds.

- **C1 — Seam forbids scraping now (BLOCKING).** `packages/db/src/migration/source.ts:3-12`
  states the confirmed source is a **CSV+ZIP export** and that "no implementation,
  scraping, or field mapping may be written before that sample exists."
  `docs/migration-notes.md` still lists scraper credential ownership as an open
  Phase-5 question. **Recommended default:** keep the seam unimplemented; the
  Tier-1 archiver does not touch it. Build the adapter only once a real export OR
  signed-off raw capture freezes the format.
- **C2 — Ledger status values don't exist (BLOCKING).** `0014_migration_staging.sql:2`
  / `types.ts:32` define `migration_staging_status = pending | validated |
  imported | failed`. The dispatch's `extracted` / `verified` are not valid enum
  members. **Recommended default:** do NOT alter the import enum; extraction
  lifecycle lives in the archiver's own local checkpoint, not this table.
- **C3 — No "attachment count" column.** `migration_staging_rows` has no field for
  a verified attachment count; SHA-256/byte counts have no home except `raw`
  jsonb. **Recommended default:** counts live in the per-patient Tier-1
  manifest.json, not the ledger.
- **C4 — 0014 is tenant-scoped import staging, not a scraper checkpoint.** It has
  `tenant_id NOT NULL`, FK→tenants, RLS on the JWT tenant claim, written via
  `withTenantContext` (`0014:5,19,36-45`). The dispatch never supplies a tenant
  context. **Recommended default:** archiver uses a local SQLite/JSON checkpoint;
  ledger writes are deferred to the sanctioned import step.
- **C5 — Tier-2 mapping is exactly what the seam prohibits.** Mapping scraped HTML
  to `MigrationRecord` now would bake guessed assumptions in. **Recommended
  default:** defer Tier-2 entirely; archive raw first.
- **C6 — Attachment storage model disagrees.** Dispatch: hashed static URLs under
  `user_rgpd_files/` scraped from HTML. `migration-notes.md` + `types.ts:116-117`:
  attachments are **local server paths**. **Recommended default:** treat the
  recon as newer truth but record it; the archiver scrapes anchors from HTML and
  stores bytes + provenance, so either model is captured losslessly.
- **C7 — V1 scope line.** `CLAUDE.md` lists "full historical archive migration" as
  **out of scope for V1**, and `migration-notes.md` marks Phase 5 deprioritised.
  The dispatch is a full ~7,964-record historical extraction. **Recommended
  default:** treat the Tier-1 archiver as a GDPR-portability data-rescue tool
  (get the bytes out while the session is capturable), explicitly NOT the V1
  import; the import remains out of V1 scope until the owner moves the line.

**Also note (not a conflict, an execution blocker):** the gated 8-patient run
cannot execute until the owner provides `FISIOZERO_STORAGE_STATE` (a Playwright
storageState JSON captured from a logged-in browser). No credentials are entered
by Claude. The code is built and unit-tested; the live gated run is blocked on
that file. **Recommended default:** owner captures the session and runs the
documented `--limit 8` command locally; Claude reports the summary back.

### Resolution 2026-06-18 (owner, corrected dispatch)
- **C1 ANSWERED:** there is no free CSV+ZIP export. Recon found only a free
  per-patient XLS (no episodes/attachments) and a paid 370 EUR bulk export that
  terminates clinic access. Scraping a Tier-1 raw archive is the sanctioned path;
  this supersedes the source.ts "no scraping before a sample export" TODO for the
  extraction step only. See DECISIONS.md 2026-06-18.
- **C6 ANSWERED:** recon is the newer truth — attachments are hashed statics in
  rendered HTML; the archiver scrapes anchors and stores bytes + provenance.
- **C7 ANSWERED:** owner confirms this IS the V1 historical migration (extraction
  step), overriding the CLAUDE.md "out of V1" line for the raw-archive capture.
- **C2/C3/C4/C5 STILL DEFERRED (by design):** the 0014 ledger and the Tier-2
  MigrationRecord mapping remain untouched until real raw captures exist; the tool
  uses its own local checkpoint. No change requested to the import contract.
- **Encryption-at-rest (open, owner action):** the archiver writes plaintext raw
  PII to the `--out` directory. App-level encryption + key management was not
  built (owner-confirmable security design). **Recommended default:** point
  `--out` at an encrypted, EU-resident volume (FileVault / LUKS / encrypted
  external disk) and keep the archive off any synced/cloud folder. The CLI prints
  this reminder at startup.

## 2026-06-30 - Wave 01 owner/accountant decisions
- [x] Patient ID format (JP): sequential, prefixed, or per-tenant scoped; confirm whether it must map to an identifier the clinic already uses. Blocks patient migration ID generation.
  > **RESOLVED 2026-07-02 (PR #426):** plain numbers only, no prefix, zero-padded at display only (e.g. `0001`); migrated Fisiozero patients keep their original Fisiozero numbers, new patients get the next sequential number per tenant. See docs/design/DECISIONS.md 2026-07-02 "Patient ID format ruling (JP) + implementation policy". Implemented in migration 0029 (`patients.patient_number`).
- [ ] VAT treatment for KPI finance views (accountant): VAT 0 vs 23 for PT health services. Event capture stores gross and applies treatment at report time, so this blocks only the finance KPI report, not capture. Carried from the standing 10-item list (item 2).
- [ ] Gated appointment completion (JP, clinical): hard block or soft warning when closing an appointment with no per-visit note. Blocks appointment lifecycle behavior.

## 2026-06-30 - BLOCKER: stale dev DATABASE_URL credential (migration 0022)
- [ ] Migration 0022 (patients.profession + region) is authored, offline-validated (typecheck + drizzle-kit check green), but COULD NOT be applied to dev or exercised by the live RLS test suite. The local DATABASE_URL_DIRECT / DATABASE_URL (Supabase session pooler, project jaxmkwoxjcgzkwxgbayx, port 5432/6543) return `28P01 password authentication failed for user "postgres"`. Same failure class as the recorded prod stale-password incident, now on the dev credential.
  - Impact: DoD steps "apply against dev, exit zero" and "db tests exit zero (live RLS suites)" cannot be satisfied. Without a DB the suite hollow-skips 212 tests (41 pure-logic pass). The migration itself is trivial and low-risk (two `ADD COLUMN IF NOT EXISTS ... text` nullable, no default, no grant/RLS change).
  - Recommended fix (owner): rotate/refresh the dev DB password in Supabase and update the local `.env` DATABASE_URL + DATABASE_URL_DIRECT, then re-run `pnpm --filter @osteojp/db exec drizzle-kit migrate` and `pnpm --filter @osteojp/db test` with the live URL to complete verification A-F. Alternatively, apply via the standard merge -> prod-migrate.yml path which uses the separate (working) PROD_DATABASE_URL_DIRECT secret.
  - Status: PR opened as DRAFT; do not merge until 0022 is dev-applied and the live RLS suite is green.

## 2026-07-01 - RESOLVED: 0022 dev-applied; root cause was env-file resolution
- [x] Migration 0022 (patients.profession + region) applied to dev (`drizzle-kit migrate` exit 0) and the live db suite passed (253 tests, 17 files, 0 skipped, real DB round-trips). Verification A-F green; PR 382 flipped ready.
  - Root cause (two parts): (1) the rotated dev password was never in a file the tooling reads, and (2) `drizzle-kit migrate` runs with `cwd=packages/db` and loads **`packages/db/.env`** via dotenv's default (`process.cwd()/.env`). It does **NOT** read the repo-root `.env`, `.env.local`, or `.env.development`, and does not walk up. The repo-root `.env` alone is insufficient for migrations; `.env.local` is Vercel-managed (holds only `VERCEL_OIDC_TOKEN`) and must never carry DB creds (a `vercel env pull` overwrites hand-edits).
  - Fix: dev creds (DATABASE_URL + DATABASE_URL_DIRECT, rotated Supabase password) now live in `packages/db/.env` in both the worktree and the main checkout. Both files are gitignored and uncommitted.
  - Standing rule: put dev DB creds in `packages/db/.env`, not repo-root `.env`/`.env.local`.

## 2026-07-01 - Availability query: DoD live-seed gap + dirty working tree
- [ ] **No `availability_templates` seed exists.** The dev seed populates
  appointments (271 rows) but there is NO seed script or fixture for
  `availability_templates` (grep of `packages/db/seed` confirms). The loop DoD
  line "for a seeded therapist over a known day, returns correct booked and free
  intervals asserted against the sample set" is therefore only half-verifiable
  against live data: the *booked* half is seedable, the *working-window / free*
  half has no seed to assert against. The interval math is instead fully covered
  by unit tests (`intervals.test.ts`, 16 cases). **Recommended default:** add a
  small `seed/availability-dev.ts` (e.g. USR_1/USR_2 Mon-Fri 09:00-13:00 +
  14:00-18:00 at LAV/CB) in a follow-up ticket so the free-interval branch gets a
  live end-to-end assertion; not blocking, math is unit-tested.
- [ ] **Working tree was NOT clean when this loop started (precondition
  violation).** Loop 0023 (therapist-service-mapping) left uncommitted changes in
  the main checkout: `M packages/db/src/schema.ts`,
  `M packages/db/migrations/meta/_journal.json`,
  `M packages/db/tests/cross-tenant-rls-isolation.test.ts`, plus untracked
  `packages/db/migrations/0023_therapist_service_mapping.sql` and
  `supabase/migrations/0023_therapist_service_mapping.sql`. This branch was cut
  from that dirty tree. My commits deliberately stage ONLY the three
  `apps/web/lib/scheduling` files; the 0023 files were left untouched (not mine,
  and deleting another loop's in-flight work would be destructive). **Recommended
  action (owner/next session):** finish and commit or stash 0023 on its own
  branch so main returns to a green terminal; confirm 0023 is not half-applied.

## 2026-07-01 - Dead i18n keys flagged for Ivan (do not delete without confirming scope)
- [ ] `dashboard.upcomingToday` (packages/i18n/src/strings.pt.json, strings.en.json): zero references anywhere in the repo — confirmed dead. Safe to delete once Ivan confirms no non-web consumers (e.g. email templates, API responses, any other app in the monorepo) reference this key.
- [ ] `intake.state.pendingReview` (packages/i18n/src/strings.pt.json, strings.en.json): zero references in apps/ — confirmed dead. Every live surface rendering the `pending_review` `ai_review_state` value uses `review.statePending` ("Por rever") instead (apps/web/app/clinical/review/page.tsx:54).
  - Owner: Ivan to confirm scope, then delete both keys.

## 2026-07-01 - "Bodychart" term: brand decision needed before touching clinical.bodychart / clinicalRecord.bodychart
- [ ] Is "Bodychart" a deliberate brand/product name (do-not-translate) or an unresolved anglicism? `clinical.bodychart` and `clinicalRecord.bodychart` carry the untranslated English value "Bodychart" in strings.pt.json (and strings.en.json). It is not on the do-not-translate list in docs/brand-voice.md §3.2 (which only names therapy/service proper nouns: Osteopatia, Fisioterapia, Massagens, Pilates Terapêutico, Neuromodulação Não Invasiva/NESA, Formação). It appears as a lowercase technical term ("body chart") in docs/architecture.md and across several design docs (ui-inventory.md, SPEC-foundation.md, SPEC-staff-screens.md, PLAN.md, wireframes) but is never explicitly named as a brand term the way §3.2 names the therapy types.
  - Options: (a) add "Bodychart" to the §3.2 do-not-translate list as a deliberate product name, or (b) replace with a PT-PT term (e.g. "Diagrama corporal" or "Esquema corporal").
  - Owner: JP or Ivan to decide. Block on this before touching those two i18n keys.
  - **Tag (2026-07-03):** next-wave-planning batch. Stays OPEN; scheduled for the next-wave planning pass, no ruling this wave.

osteojp-availability-seed
## 2026-07-01 - availability seed: CI does NOT consume it, and live dev run is credential-blocked
- [ ] **CI's seeded-DB jobs do not run the TS dev seed (loop premise was wrong).**
  The availability-seed loop assumed wiring into the `seed:dev` entrypoint would make
  CI's seeded-DB jobs pick up the rows. It does not: `db-tests.yml` seeds via
  `supabase db reset` -> `supabase/seed.sql` (roles + tenants ONLY; RLS suites build
  their own fixtures), and `e2e.yml` seeds via `supabase db reset` +
  `apps/web/e2e/seed/seed-e2e.mjs` (a self-contained fixture with no appointments or
  availability). The TS `seed:dev` chain (dev-reference/patients/appointments/
  availability/episodes) is dev-only, run manually against the dev Supabase project.
  So this seed reaches DEV (which is what the availability-query live verification
  needs), NOT CI's ephemeral DBs. Per the loop's HALT-LOUD trigger ("CI seeds
  differently") I did NOT modify any CI seed source or workflow. **Recommended
  default:** leave as-is (dev is the intended target). If e2e coverage of the
  availability UI is later wanted, add appointments+availability to `seed-e2e.mjs` in
  a scoped follow-up ticket (still no workflow-file change) — owner decision, out of
  this loop's scope.
- [ ] **Live dev seed run is blocked on missing dev credentials.** The only local DB
  creds (`packages/db/.env`, gitignored) point at the prod-guarded ref
  `jaxmkwoxjcgzkwxgbayx`; the seed's SAFETY guard correctly refuses it, and I did not
  seek or use prod creds (seeding is destructive/owner-confirmable). The local
  fallback (ephemeral Supabase) was unavailable because the Docker daemon would not
  start (~2 min, no readiness). So the DoD's live evidence ("seed runs clean on dev",
  "live availability call returns non-empty") could not be produced here. Mitigation:
  the seed's shape is fully asserted by `tests/availability-dev-seed.test.ts` (DB-free,
  CI-gated), and both seed guards were verified to fire. **Recommended action (owner):**
  with a valid dev `DATABASE_URL` (project ufbkzbyghvxtosyrkgjq), run
  `pnpm --filter @osteojp/db seed:dev` (or `seed:availability:dev` after the reference
  seed), then confirm per-therapist counts and one `getTherapistAvailability` call over
  a seeded week returns non-empty working/free. Same dev-credential gap class as the
  0022 blocker.

## 2026-07-01 — Portal "Ficha" naming (intake forms)
- [ ] Should the patient portal's "Ficha" terminology (Fichas, Ficha Geral, Ficha de Osteopatia, Preencher ficha — **23 occurrences** in `packages/i18n/src/portal/strings.pt.json`, verified by grep; not the 16 originally estimated) be renamed?
  - Context: portal "fichas" are pre-visit patient intake forms — a genuinely different concept from "registo clínico" (therapist's post-visit documentation), which the staff-side sweep standardized (#391). `docs/brand-voice.md` defines no term for the intake-form concept. Two defensible readings: (a) intentionally distinct feature name, correctly named, leave it; (b) same inconsistency the staff sweep missed. Patient-facing copy, so this is JP's register call as much as a vocabulary one.
  - Owner: JP (patient-facing) with Ivan looped in.
  - Blocked work: none currently — flag only.
  - **Tag (2026-07-03):** next-wave-planning batch. Stays OPEN; scheduled for the next-wave planning pass, no ruling this wave.

## 2026-07-01 — consulta vs marcação: brand-voice.md and staff convention disagree
- [ ] `docs/brand-voice.md` §3.1 lists "Consulta" as the correct PT term for the scheduled session ("Appointment | Consulta | Default for any scheduled session"), reserving "Marcação" for the booking action ("Booking | Marcação | Used in 'Fazer marcação' CTA"). The staff app's i18n sweep (#391) standardized on "marcação" more broadly — e.g. the nav section, page title, and KPI label are "Marcações" / "Marcações hoje", denoting the scheduled sessions themselves, not just the booking action. The two sources now disagree.
  - Context: portal metadata uses "consultas" (compliant per brand-voice.md as written). Staff app uses "marcação" for the broader appointment concept (compliant per the newer convention, not per §3.1 as documented). One of the two must be declared canonical: either update brand-voice.md §3.1 to document the marcação-first convention, or relax the staff convention back to the documented consulta/marcação split.
  - Owner: JP or Ivan — this is a brand-voice doc decision, not a code decision.
  - Blocked work: none hard-blocked, but every future copy PR touches this ambiguity until resolved.
  - **Tag (2026-07-03):** next-wave-planning batch. Stays OPEN; scheduled for the next-wave planning pass, no ruling this wave.
 main

## 2026-07-01 — RESOLVED: single-project reality closes the seed-blocker and ref-discrepancy
- [x] **Ref discrepancy resolved.** Owner-verified (Ivan, via Supabase + Vercel dashboards): the Supabase org has exactly ONE project, ref `jaxmkwoxjcgzkwxgbayx` (Frankfurt, Pro, backups active). It is the dev database AND currently also backs the deployed app. The ref `ufbkzbyghvxtosyrkgjq` DOES NOT EXIST and never did — a phantom from an earlier recon that propagated into the five dev seed scripts and into the entries below. This retroactively corrects the "dev = ufbkzbyghvxtosyrkgjq / prod = jaxmkwoxjcgzkwxgbayx" premise recorded on 2026-06-30 (0022 blocker, L421-425) and 2026-07-01 (availability seed, L485-498): `jaxmkwoxjcgzkwxgbayx` was never prod — it is the single real (dev) project.
- [x] **Seed-blocker (availability seed, L469-498) resolved.** The blocker was that `packages/db/.env` points at `jaxmkwoxjcgzkwxgbayx` and the seed's hardcoded blocklist refused that ref as "prod." With the single-project reality confirmed, the guard was reworked: a shared `packages/db/seed/seed-guard.ts` (imported by all five seed scripts) replaces the hardcoded ref blocklist with (1) an empty `PROD_REFS` blocklist and (2) a `SEED_DEV_CONFIRM` opt-in that must equal the ref parsed from `DATABASE_URL`. The dev seed now runs against `jaxmkwoxjcgzkwxgbayx` with `SEED_DEV_CONFIRM=jaxmkwoxjcgzkwxgbayx pnpm --filter @osteojp/db seed:dev`. Zero `ufbkzbyghvxtosyrkgjq` references remain in `packages/db/seed/` (grep-verified).
- [x] **Rationale + new gate** recorded in docs/design/DECISIONS.md (2026-07-01 "Single Supabase project reality; seed guard reworked to SEED_DEV_CONFIRM"), including the NEW PRE-REAL-DATA GATE: provision a separate production Supabase project, repoint Vercel envs, and add the old dev ref to `PROD_REFS` before any real patient data.
- Note: the historical `[ ]` entries above are left verbatim (append-only); this entry supersedes their ref premise.

## 2026-07-02 - Batch failure pop-up (WAVE-01 Max item 9): no defined UI entry point (BLOCKED, owner decision needed)

- [ ] `docs/design/BACKLOG.md` marks "batch failure pop-up" READY (gate: 0028 DONE, #417). `SPEC-appointments.md` §4 and `WAVE-01.md` item 9 both describe the pop-up's *contents* (busy date/hour, reason, nearest alternative, edit-and-rebook) but neither says where in the UI a batch booking is triggered from. Audit confirms `batchSchedule` (`apps/web/lib/scheduling/batch.ts:52`) has **zero callers** anywhere in `apps/web` — grepping `batchSchedule`/`batch-core` outside their own module and unit test returns nothing. The existing recurrence UI (`AppointmentDrawer`'s repeat fields, `repeatFreq`/`occurrences`) is wired to `createAppointment` (`apps/web/lib/scheduling/actions.ts:166`), a **different, older, all-or-nothing** recurring-creation path: any single occurrence conflict blocks the whole series via an inline conflict Banner — no partial booking, no nearest alternative, nothing for a failure dialog to render. Building the dialog without deciding where it's triggered from means either (a) inventing a new "book a package" entry point, or (b) changing the existing repeat-appointment flow's behavior (swap its backing call from `createAppointment` to `batchSchedule`, changing conflict handling from block-the-series to book-free-and-report-failures). Stopping rather than guessing, per instruction.
  - **Recommended default:** (b) — reuse the existing `AppointmentDrawer` repeat UI (`repeatFreq`/`occurrences`) as the entry point; it already collects exactly `batchSchedule`'s inputs (first slot + recurrence) and matches the SPEC-appointments §4 example ("next 7 Thursdays at 09:00"). For `repeatFreq !== "none"`, route creation through `batchSchedule` instead of `createAppointment`'s recurring branch; on a result with `failures.length > 0`, open the new failure Dialog (successes summarized, failures itemized with reason + `nearestAlternative`; "edit and rebook" re-attempts that one slot). Flagging because this is a UX behavior change to a shipped flow (partial-success instead of all-or-nothing), not because the technical wiring is unclear.
  - **Status:** BLOCKED. `docs/design/BACKLOG.md` "batch failure pop-up" row flipped to HALTED pending this ruling (briefing-vs-reality mismatch: gate said READY but no entry point is defined). No product code changed on this pass.
  - **RESOLVED (2026-07-03, Ivan):** ruled per recommended default (b) — see `docs/design/DECISIONS.md` 2026-07-03 "Batch scheduling is partial-success by design". Batch scheduling is PARTIAL-SUCCESS: book every free slot, report each failure with reason + nearest alternative in the failure pop-up, never refuse the whole batch. Wiring the existing `AppointmentDrawer` repeat UI (`repeatFreq`/`occurrences`) through `batchSchedule` (replacing `createAppointment`'s all-or-nothing recurring branch) is AUTHORIZED as a UX behavior change. Migration-free, UI lane. Row 9 UNBLOCKED (existing PR #439).

## 2026-07-06 — Twilio QA pass (qa/twilio-proof): two pre-launch SMS findings

- [ ] **No E.164 phone normalization anywhere in the SMS send path.** `patients.phone` is stored as free text (staff validation caps length at 32; portal PATCH accepts 7-15 digits with optional `+` but stores the raw string) and `dispatch.ts` → `clients.ts sendSms` passes it to Twilio verbatim. Once `REMINDERS_LIVE_SEND=true`, any number stored as `912 345 678` / `00351912345678` is rejected by Twilio error 21211 and that patient's reminder silently fails (Inngest retries won't help — the number never becomes valid). Characterization tests pinning the raw pass-through: `apps/web/lib/reminders/twilio-proof.test.ts` §3.
  - **Recommended default:** add a small pure `normalizePtPhone()` (accept `9xxxxxxxx`, `+3519xxxxxxxx`, `003519xxxxxxxx`, spaces/dashes → E.164 `+351...`; reject anything else) and call it inside both `sendSms` wrappers before the Twilio call, failing loud with a typed error. Kept OUT of this QA PR deliberately — the branch's allowlist is tests + script + doc only, and this changes live send behaviour.
  - Owner: Ivan (code) — gate before flipping `REMINDERS_LIVE_SEND`.
  - Blocked work: none today (live sends are gated off); HARD blocker for the first live reminder cycle.
- [ ] **Cutover runbook names an env var the code never reads.** `docs/cutover-runbook.md` §1.5 + env table instruct setting `TWILIO_SENDER_ID=OsteoJP` in Vercel prod; the code (both `apps/web/lib/reminders/clients.ts` and `apps/api/lib/notify/clients.ts`) reads `TWILIO_SMS_FROM ?? TWILIO_MESSAGING_SERVICE_SID`. Followed literally, prod falls back to the messaging service SID or suppresses sends as unconfigured — the approved "OsteoJP" alphanumeric sender would NOT be used. Pinned by test (`twilio-proof.test.ts`, "never reads TWILIO_SENDER_ID").
  - **Recommended default:** set `TWILIO_SMS_FROM=OsteoJP` in Vercel prod and correct the runbook wording (runbook edit deliberately not made in this QA PR — cutover-runbook.md is Ivan/JP's operational doc).
  - Owner: Ivan (Vercel env + runbook).
  - Blocked work: none today; must be fixed before §1.5 of the cutover checklist is executed.

## 2026-07-07 — RESOLVED: both 2026-07-06 Twilio findings fixed (fix/twilio-e164-and-runbook)

- [x] **E.164 normalization** — `normalizePhonePT` added (`apps/web/lib/reminders/phone.ts`, pure + exported; mirrored at `apps/api/lib/notify/phone.ts` per the clients.ts mirror pattern). Accepts `9xxxxxxxx` / `2xxxxxxxx` / `+351…` / `00351…` / `351…` with space/dash/dot/paren noise → canonical `+351xxxxxxxxx`; anything else → `null`. Wired at TWO layers: `dispatch.ts` skips the SMS channel on `null` with a structured warning (`tenantId`/`appointmentId`/`patientId` — ids only, never the raw number, PII rule #7; email still sends), and both `sendSms` wrappers guard again so nothing reaches `messages.create` un-normalized (invalid → `{ sandbox: true, id: "skipped:invalid_phone" }`, Twilio never constructed). The #485 characterization tests are converted to real expectations; table-driven format coverage in `phone.test.ts` (32 cases). Prefix-level assignment validity (91/92/93/96 vs unassigned 9x) is deliberately delegated to Twilio. No schema change — stored values stay as-typed; normalization happens at the send boundary (and must ALSO happen at the future Fisiozero migration boundary — noted in `docs/migration-notes.md` 2026-07-07).
- [x] **Runbook env var** — `docs/cutover-runbook.md` §1.5 + env table now say `TWILIO_SMS_FROM=OsteoJP`, with a note that `TWILIO_SENDER_ID` is ignored by code (pinned by test in #485) and should be removed from Vercel if set.

## 2026-07-15 — W8-01a services catalog: gaps + cross-location merges (one owner/JP batch)

Recorded from the owner's canonical catalog (W8-01a loop). NOT seeded with guessed values;
the seed transcribes only what the owner provided. Answer as one batch before/with the
CATALOG OWNER CONFIRMATION.

- [ ] **CB missing services (present at LV, absent from CB's price table):** 1.ª consulta /
  Avaliação; Drenagem Linfática Manual (Método Wodere); Tratamento Terapêutico; and any
  Osteopatia PACKS at CB. Are these truly not offered at Castelo Branco, or missing from the
  photographed table? Recommended default: leave unseeded at CB (offered-only-where-priced —
  no price row = not offered there); add later if the owner supplies CB prices.
- [ ] **LV missing services (present at CB, absent from LV):** Medicina Chinesa/Acupuntura;
  Massagem 4 Mãos; Sessão Família/Amigos. Same question + default (leave unseeded at LV).
- [ ] **Cross-location canonicalization (merge or keep separate?):** the seed CONSERVATIVELY
  keeps distinct names as separate service rows. Confirm whether these are the SAME service
  (one row, offered at both locations) or genuinely distinct:
    (a) CB "Osteopatia/Posturologia" (60.00) vs LV "Osteopatia" (70.00)
    (b) CB "NESA" (50.00) vs LV "Tratamento NESA" (50.00)
    (c) CB "Pressoterapia" (30.00) vs LV "Pressoterapia / Drenagem Linfática Mecânica" (35.00)
  Recommended default: keep SEPARATE (different names + different prices; merging is a
  one-line change once confirmed). Only "Fisioterapia" is listed identically at both, so it
  is already ONE row offered at both (LV 55.00 / CB 45.00).
- [ ] **Diacritics / exact service strings:** the seed applies proper pt-PT diacritics
  (Avaliação, Fisioenergética, Sessão, Máquinas, Família, sessões) to the owner's ASCII
  transcription. Confirm the display strings at the CATALOG OWNER CONFIRMATION.
- Owner: Ivan + JP. Blocked work: the W8-01a CLOUD seed (owner-confirmation-gated + waits on
  the manual prod-apply path); build + local dry-run are complete and unblocked.

## 2026-07-15 — W8-01a JP BATCH: 3 frozen legacy service rows (deactivated, pending owner/JP ruling)

After the owner-confirmed cloud catalog seed (Option A amended), three pre-existing service
rows on tenant OsteoJP were DEACTIVATED (frozen) rather than mapped — no rename, no reprice,
no delete. Each awaits an explicit owner/JP ruling: map to a canonical row or drop.

- [ ] **"Pilates Terapêutico" (40.00, now inactive)** — map to canonical "Pilates Terapêutico —
  aula individual" (LV 50.00), map to a group Pilates, or drop? Price differs (40 vs 50).
- [ ] **"NESA" (39.00, already inactive)** — map to canonical "NESA" (CB 50.00) or "Tratamento
  NESA" (LV 50.00), or drop? Price differs (39 vs 50); location LV vs CB unresolved.
- [ ] **"Massagem Terapêutica" (50.00, now inactive)** — is this actually offered, at which
  location and price? Or drop? No canonical match today (nearest "Massagem 4 Mãos" CB 70.00,
  different service). Unreferenced by marcações, so droppable if the owner rules so.
- Owner: Ivan + JP. Expected end state: each legacy row MAPPED (rename onto a canonical row,
  never delete-recreate) or DROPPED by explicit owner instruction. Until then they remain
  inactive — per W6-01b they show in filter dropdowns and are absent from creation dropdowns.

 db/0043-clinical-rls-r16
## 2026-07-25 — Q: 0043 R16 clinical_records RLS — four items back to CYAN/owner (recommended defaults applied)

Migration 0043 is BUILT and gated GREEN; these are review points for CYAN's
post-audit and owner apply-before-merge, each already implemented with the safe
default noted. None block the build.

- **Q1 (CYAN): `appointments.location_id` nullability.** The audit frame states
  it is NULLABLE; verified against origin/main DDL it is NOT NULL (created NOT
  NULL in 0000, never dropped). The null-location-appointment edge is therefore
  UNREACHABLE by construction. Recommended default (APPLIED): keep the column NOT
  NULL (weakening a core-table constraint is owner-confirmable and out of scope);
  the helper's fallback still guards on non-null `location_id` (future-proof); the
  isolation test proves the edge closed via the NOT NULL constraint + the
  zero-appointment fallback case. Confirm this satisfies the frame's edge item.

- **Q2 (CYAN): therapist RLS scope includes `patients.created_by`.** The frame's
  wording is "author/practitioner=auth.uid() OR treating appointment". The RLS
  predicate ALSO includes `created_by = auth.uid()` because the owner-approved app
  scope (`therapistPatientScope`, W10-04, 2026-07-21) does, and RLS must not be
  STRICTER than the app (else it silently hides rows the app shows, e.g. the
  review queue). Recommended default (APPLIED): keep the union. Confirm.

- **Q3 (owner/CYAN): go-forward fallback-location population — UI wiring.**
  `createPatient` now accepts an explicit, tenant-validated `primaryLocationId`
  (server-side; never inferred from `created_by.staff_locations`). The create FORM
  does not yet pass it (no active-clinic context in the form today), so new
  zero-appointment patients are NULL → owner-only until an appointment establishes
  the location basis. Recommended default (APPLIED): ship the writer now, wire the
  form's active clinic in a follow-up. Owner decision: should the create form
  require/auto-capture a clinic, or is "owner-only until first appointment"
  acceptable? (Recommendation: acceptable — appointment basis covers the common
  path; forcing a clinic at create adds UI friction.)

- **Q4 (owner/CYAN): historical clinical-migration pipeline principal.** Under
  R16 admin can no longer write clinical_records. The Fisiozero import pipeline
  (`importRecords`, packages/db/src/migration) writes clinical_records but has NO
  production caller yet. The idempotency test was moved admin → OWNER to reflect
  this. Recommended default (APPLIED in the test): when the pipeline is wired, run
  it as OWNER or service_role, not admin. Confirm the intended principal.

## 2026-07-25 — W12-30-Q1: email-voice polish items (D1/D2/D3) deferred out of the PDF-template PR

The W12-30 audit's recommended top-5 includes two email-voice items alongside the
PDF-template ones. The W12-30 PR was scoped to "the 3 live PDF templates: report /
RGPD / declaração", so the email items were NOT implemented and are logged here.
They are `lib/reminders/templates.ts` (reminders pipeline), presentation-only:

- **D1 — PT email open.** Change "Olá {{patient_first_name}}," to the brand-voice
  6.7 formal open "Caro(a) {{patient_first_name}}," (EN already uses "Dear").
  Applies to all PT emails (48h / 24h / confirmation / follow-up / no-show).
- **D2 — clinic sign-off.** Extend the bare "— OsteoJP" sign-off with clinic
  location + phone (brand-voice 6.7). `clinicLocation`/`clinicPhone` are already on
  `ReminderContext` (48h/24h/confirmation), but the follow-up + no-show contexts
  carry only `clinicPhone` — a full location sign-off there needs `clinicLocation`
  threaded through `dispatch.ts` (extra blast radius), so those two would ship a
  phone-only sign-off unless the context is extended.
- **D3 — confirmation-email padding.** Drop the monospace space-padded label
  alignment ("  Data:      {{...}}") that only aligns in a monospace client; use
  plain "Label: value" lines.

Recommended default: ship D1/D2/D3 as a SEPARATE small "email-voice" PR (copy-only,
its own preview verification: trigger a reminder → check the greeting + sign-off),
keeping the W12-30 PR a clean PDF-template visual gate. For D2, extend the
follow-up/no-show contexts with `clinicLocation` so all five emails sign off
consistently.

- [ ] Owner: confirm whether to fold D1/D2/D3 into a follow-up email-voice PR
  (recommended) or leave the reminder emails as-is. Not blocking the W12-30 PDF PR.
 main

## 2026-07-25 — W12-40-Q1: Horários route kept as a redirect (not a hard 404)

Horários was folded into Equipa, so `/admin/working-hours` is no longer a tab. Chosen
default: keep the route as a server redirect into Equipa —
`/admin/working-hours[?t=<id>]` → `/admin/staff[?t=<id>]` (a `?t=<id>` deep link re-opens
that member's Gerir modal on the Horários section). This preserves any bookmarked schedule
URLs and the existing `?t=` deep-link contract other surfaces used. Alternative would be a
hard removal (404) once we're sure nothing links in.

- [ ] Owner: confirm the redirect is acceptable, or ask for a hard removal of
  `/admin/working-hours`. Not blocking — the redirect is safe and reversible.

## 2026-07-25 — W12-40-Q2: staff_locations membership + per-location colour editing not yet wired

The build brief asked to edit "locations (staff_locations membership)" and "colour" from
the Equipa modal, reusing existing server actions `setStaffLocations` / colour. Those
server actions DO NOT EXIST: `staff_locations` (migration 0038) is defined in the schema
(with a nullable `color`) but has ZERO application read/write layer, and the ticket boundary
explicitly forbids NEW server-action contracts / schema changes. So, per the
pick-a-sensible-default rule:

- A member's **locations** are DISPLAYED as chips derived from `availability_templates` (the
  live W5-32 assignment) and are edited today by setting the per-day location inside the
  Horários section (the availability-derived clinic membership).
- A member's **colour** is DISPLAYED from the deterministic `therapistColor()` FNV palette
  (W9-05 / W12-21 tokens). It is NOT yet an editable picker, because writing
  `staff_locations.color` needs a new server action.

Recommended default: a FOLLOW-UP ticket adds `setStaffLocations(actor, userId, locationIds)`
and `setStaffColor(actor, userId, locationId, color)` (+ their reads), then the Gerir modal
gains an explicit "Localizações" membership section and a colour picker bound to the
W12-21 palette. This keeps the current PR within its UI/UX + wiring boundary.

- [ ] Owner: confirm explicit staff_locations membership + colour editing should be a
  separate follow-up ticket (recommended), or expand this PR's boundary to add the two
  server actions. Not blocking the visual gate on the consolidated tab.
- [x] (2026-07-26) RESOLVED — BUILT as W12-40-Q2: `setStaffLocations` + `setStaffColor` +
  the "Locais e cor" section in the Gerir modal (this run).
- [ ] Owner (W12-40-Q2 colour granularity): the colour picker is per (member, clinic) —
  matches the `staff_locations.color` schema + W12-21's per-(therapist,location) values.
  Confirm, or if you want ONE colour per person applied across all their clinics.
  Recommended default: keep per-clinic.
- [ ] Owner (0045-Q3): new patients' `primary_location_id`. The write path in `createPatient`
  is correct (actions.ts:83-103), but the create-patient FORM does not send a location, so new
  app-created patients are owner-only until their first located appointment. Recommended:
  default to the registering staff's location when they have exactly one membership, else an
  optional picker; correct the migration comment. Non-migration follow-up, not a blocker.

- [x] RE-ENABLE `therapist-blocks.spec.ts:97` on CI (owner-approved quarantine 2026-07-27). **DONE 2026-07-31, and the original diagnosis was WRONG.** Re-enabling it failed CI three times for three identical minutes. The Playwright artifact named the cause: *"element is not stable ... element was detached from the DOM, retrying"* for the full 180s - a RACE, not slowness. Every write in that spec is a server action ending in `redirect("/admin/staff?m=<code>")`, and the test waited with `waitForURL(/admin\/staff/)` - a pattern the CURRENT url already satisfies, so it waited for nothing and the next click landed in the outgoing DOM the redirect was about to replace. Locally that race is won (7s, passes), which is precisely why it read as infra: same symptom, opposite cause. Fixed by waiting on the app's own signals (the redirect's `?m=` marker + the rendered banner). `test.skip` removed; the 180s budget stays, it was never the quarantine. **Lesson: 'passes locally, times out on CI' is a race until proven otherwise - read the artifact before blaming the runners.**
  It is skipped on CI ONLY (`test.skip(!!process.env.CI, …)`) because GitHub's shared runners
  have been degraded 24h+ (this 7s-local test runs ~186s on CI, timing out the 25-min job and
  blocking every PR on pure infra). It still runs + passes in local dev. When the runners
  recover, delete the `test.skip(...)` line to restore CI coverage. Colour/agenda work (#665)
  and the portal PRs merged normally with this in place.

- [ ] PL-06 DoD "Location PROOF" contradicts BLOCKER-1 (web booking ignores
  `services.location_id`). PL-06a (#682) removes ONLY the therapist coupling and adds
  no location clause (Field 5 directs exactly this; `data.ts` booking query filters
  only `isActive`). The DoD's "a location-scoped service must not be offered at
  another location" cannot hold on the web surface. Recommended default: treat the
  Location PROOF as SUPERSEDED by the 2c correction; per-location service availability
  is a separate future loop if ever wanted. Owner: confirm no location enforcement is
  expected for launch. (Portal `getCatalog` DOES honour `location_id`, but portal is
  out of V1.)

- [ ] STAFF LOGINS (PL-07 #685) — two owner/infra prerequisites for tomorrow, NOT
  code, both verified only in the Supabase/Vercel dashboards:
  1. REQUIRED — Supabase → Authentication → Hooks → Customize Access Token Hook
     must be ON in prod, pointing at `public.custom_access_token_hook` (migration
     0002). If OFF, a staff member's first login carries no tenant_id/role claims
     and the app rejects the session. This is the single most likely silent blocker.
  2. For emailed set-password links: `INVITES_LIVE_SEND=true` + `RESEND_API_KEY` +
     a sender address at `send.osteojp.pt` (the Verified Resend identity as of
     2026-08-02 — an `@osteojp.pt` From will be rejected) +
     `STAFF_INVITE_REDIRECT_URL` → the
     `/auth/update-password` page. If unset, Ativar login still works but shows the
     link / temp password on screen (hand off out of band) instead of emailing.
  Recommended default: enable both before the team session; prove the full chain on
  Chris Macov (prod) before inviting real staff.

- [ ] CANARY (reminder SMS smoke test) — needs from Ivan before staging the cleanup
  script: (a) the canary patient phone (the owner's number), (b) the Twilio/Inngest/
  Vercel console findings. Facts already pinned: lead windows 24h + 48h
  (offsets.ts:20-22); a reminder schedules only if startsAt - offset > now
  (offsets.ts:43); reminders fire via the appointment/scheduled Inngest event
  (createAppointment → enqueueAppointmentReminders), so the canary appointment must
  be BOOKED THROUGH THE UI (a raw DB insert won't trigger it). Book at now + 24h +
  15min to make the 24h reminder fire ~15 min later.

- [ ] PL-09 Phase 2b (appointments RLS) - DESIGN DECISION before build. This is
  defense-in-depth, NOT an open access gap (Phase 1 already scopes appointment
  reads for reception/admin at the app layer), so it is safe to schedule as its own
  ticket. Context: appointments CANNOT carry PL-09 role/location RLS as-is.
  `conflict.ts` runs on the caller's tenant-scoped tx and legitimately reads rows a
  PL-09 scope would hide: (a) EVERY appointment in a location+room regardless of
  practitioner (room clash), and (b) a therapist's appointments across ALL locations
  (a therapist cannot be in two clinics at once). If appointments RLS restricts the
  caller to their own/location rows, the conflict check silently misses clashes ->
  double-booking. FIX: elevate the three conflict queries (`findConflicts` room +
  therapist branches, `findScheduleConflicts`) to SECURITY DEFINER functions
  (tenant-filtered on jwt_tenant_id) that return the full conflict set, THEN apply
  appointments RLS (therapist own via practitioner_id/practitioner_2_id; admin +
  reception location via appointments.location_id ∈ staff_locations, with the same
  no-lockout rule as 0047; owner all). Ship with booking E2E proving create +
  reschedule still detect room and cross-location therapist clashes as a therapist
  AND as reception. RECOMMENDATION (default): ship Phase 2a (patients RLS, migration
  0047, already built + staged) now; do Phase 2b as the next migration after Phase 5.
  Blast radius is the booking hot path, hence a dedicated ticket, not folded in.

## Q-PL-13-1 (2026-07-30, ANSWERED 2026-07-30) - notes-thread model: append-only vs edit-in-place stamps
**ANSWERED (owner, 2026-07-30): make them EDITABLE with last-edited stamps.** Built as PL-13
migration 0050 (appointment_notes: add `edited_at` + `last_edited_by` + an in-tenant UPDATE
policy; DELETE still denied) + `editAppointmentNoteAction` + pen-edit UI on the profile Notas
thread (legacy `patient_note_revisions` rows stay read-only). The profile composer stays (it is
the thread + edit surface the therapist named). NOT done: the legacy backfill (pre-W12-13 rows
→ editable) is a separate follow-up 0051; and the agenda drawer / Marcações popup stay single-
coalesced-note surfaces (converting them to editable threads is out of scope for this ruling).
Dispatched as "PL-08 appointment notes thread" (renumbered PL-13; PL-08 is the shipped
"Ativar login" loop). Reconciled against the SHIPPED W12-13 notes-unification (merged
#654/#656/#657): the notes thread already exists, each note carries author + created, and
the "notes never reach patient PDFs / Declaracoes / portal" negative assertion is CLEAN and
CI-guarded (apps/api/lib/appointments/notes-privacy.test.ts). Two DoD items conflict with the
shipped design and need an owner ruling before any build:

1. EDIT STAMPS ("last-edited-by + datetime persist on re-read"). The shipped model is
   APPEND-ONLY / immutable: appointment_notes has SELECT+INSERT policies only (no UPDATE),
   and an edit is modelled as a NEW appended row (SPEC-notes-unification.md, resolves the
   old Q-W12-07). There are no edited_at / last_edited_by columns. Implementing literal
   edit-in-place stamps means ADD edited_at + last_edited_by columns + an UPDATE RLS policy
   (an append-only EXCEPTION) + an edit server path/UI - i.e. relaxing the immutability
   invariant (hard architecture rule #4 territory). RECOMMENDATION (default): KEEP
   append-only; treat "last edit" as the newest row in the thread (author + created already
   shown), and reconcile the DoD wording to the thread model - NO immutability change. If
   the owner truly wants mutable notes with edit stamps, that is a deliberate invariant
   change and a dedicated migration.

2. PATIENT-PROFILE STRICTLY READ-ONLY. The DoD says the profile Notas surface is read-only,
   but the SPEC deliberately KEEPS a composer there (patients/[id]/notes-composer.tsx ->
   appendPatientNoteAction). The profile SUMMARY is already read-only (no longer reads
   patients.notes). RECOMMENDATION (default): if "read-only" means authoring moves entirely
   to the Agenda drawer + Inicio "Notas rapidas", remove the profile composer (small,
   reversible app-layer change). Confirm this is intended, since it removes a shipped
   authoring surface.

3. BACKFILL MIGRATION ("PL-08b", owner expects migration ~0047; the next FREE number is now
   0050). It must backfill legacy appointments.notes + patient_note_revisions into
   appointment_notes as "note one", idempotent + append-only, touching ONLY appointment_notes.
   READY TO BUILD, but its "column shape" is coupled to decision (1): if edit stamps are
   added, the migration also adds those columns. So the migration is BLOCKED on (1).
   "Nothing lost" holds at READ time today (data.ts coalesce + notes-merge dedup), so no data
   is currently lost pre-backfill.

STATUS: PL-13 (notes) is HELD pending this ruling. Nothing built (would either break the
append-only invariant or remove a shipped surface on a guess). The moment (1) is ruled, the
0050 backfill (+ optional stamp columns) is a same-day build -> apply-before-merge halt.
## Q-PL-11-1 (2026-07-30, ANSWERED 2026-07-30) - appointments write-scope: author escape vs fully-open edit
**ANSWERED (owner delegated "do as you think", 2026-07-30): keep the escape AUTHOR-SPECIFIC**
(the shipped 0049 behaviour). Editing an appointment you did NOT author stays bounded by the
PL-09 read scope — the safer choice that preserves defense-in-depth. No further migration; if
fully-open cross-clinic edit is ever wanted it is a deliberate follow-up loosening.
PL-11 migration 0049 unblocks the save by adding the `created_by = auth.uid()` author
escape to appointments_rls (mirrors 0047). This makes CREATE open to every active staff
role (you always author your own new row) and keeps EDIT of OTHERS' appointments bounded
by the PL-09 read scope + WITH CHECK. The owner ruling "all active staff roles may create
and edit appointments" is satisfied for create and for editing what you can see. OPEN:
does the owner also want a located admin/reception to EDIT and MOVE an appointment they
did NOT author to a location OUTSIDE their scope? DEFAULT (shipped in 0049): no - that
stays bounded (author-specific escape only), preserving PL-09 defense-in-depth. If yes, a
follow-up migration widens the admin/reception WITH CHECK to tenant-only. Ratify at apply.

## Q-PL-11-2 (2026-07-30, OPEN) - located-role E2E for appointments RLS
The Playwright e2e seed (apps/web/e2e/seed/seed-e2e.mjs) assigns NO staff_locations to any
test role, so PL-09/PL-11 location scoping is a no-op in e2e and the located-admin
save-block cannot be reproduced there. PL-11's failing->passing repro is carried by the DB
isolation test (packages/db/tests/appointments-location-rls.test.ts), proven live via a
policy swap. FOLLOW-UP: seed a located admin + a second location in the e2e harness and add
a create-form save e2e (admin books a therapist that has zero availability_templates;
assert the save succeeds and availability is shown advisory, not blocking). Not a PL-11
blocker.

## Q-PL-14-1 (2026-07-30, OPEN) - multi-location staff: keep a picker, or force one location?
The CR is unambiguous for the single-location case (no control, auto-applied). It does not
say what a reception/admin assigned to TWO clinics should get. DEFAULT (what GREEN will
build unless told otherwise): keep a picker for them, restricted to their own set, with
"Todas as localizacoes" meaning "all of MINE" - never a location outside the assignment.
The alternative (force a single active clinic, switchable in the profile) is a bigger change
and nobody has that shape today. Not a blocker: today's data has no multi-location staffer.

## Q-PL-15-1 (2026-07-30, MOOT 2026-08-02) - patients with no location AND no appointment: assign how?
Migration 0051 can safely backfill patients.primary_location_id from each patient's most
recent appointment. Patients with ZERO appointments have no derivable location (this is the
Alfredo case). RECOMMENDED DEFAULT: do NOT guess them in SQL. Leave them NULL, and let the
owner assign each one in the new patient-edit location field - the list is expected to be
about three rows on prod today. Guessing (e.g. "everything to LV") would misfile a CB
patient into LV permanently and is a data write no evidence supports. Confirm at PL-15b
apply, together with the PL-15a output.

## Q-PL-18-1 (2026-07-31, MOOT for prod 2026-08-02) - reception/admin with NO location assignment: see everything, or see nothing?
viewerLocationScope returns `null` for a reception/admin holding zero `staff_locations` rows,
and `null` means "not location-restricted" - all clinics, all staff. That fallback was a
deliberate onboarding safety valve (nobody is locked out before Equipa assigns them) and it is
almost certainly what produced the 2026-07-31 reception report: the account has no assignment,
so every location control offers both clinics and every roster lists both teams. The code was
never missing the rule.
RECOMMENDED DEFAULT (what GREEN builds unless overruled): KEEP the fallback, and make it
visible - Equipa flags any reception/admin with no location assignment so the state is legible
instead of silent. Inverting it (no assignment = see nothing) turns a data-entry gap into a
staffer who cannot work at all, and would have to be paired with a hard guarantee that every
account is assigned at creation time.
The ALTERNATIVE worth considering separately: make the location assignment REQUIRED for the
reception and admin roles at user-creation time, which removes the fallback's reason to exist.
That is a bigger change (it touches invite + role-change paths) and is not a PL-18 blocker.

## Q-PL-23-1 (2026-07-31, ANSWERED 2026-07-31) - health-insurance numbers: one field or a repeatable list?
The CR says "one or more tabs where we can enter health insurance plan numbers" and then
"a new input field called 'numeros dos seguros de saude'". The plural is the only shape signal.
RECOMMENDED DEFAULT (what GREEN builds): a REPEATABLE list - a patient may hold more than one
plan (ADSE + a private insurer is common in PT), so the column stores a list and the form lets
staff add rows. Optional insurer label beside each number, since a bare number with no insurer
is not usable at the desk.
The ALTERNATIVE: a single free-text field holding whatever the desk types. Cheaper, but it
cannot be searched or validated later and converting it to a list afterwards is a data
migration over free text.
Confirm at the PL-23 apply, since the shape IS the migration.

## Q-PL-24-1 (2026-07-31, CLOSED 2026-08-02) - existing patients stored as sex='other'
patients.sex is a free varchar(16) with no DB enum, so dropping the "Outro" option from the
form is a UI change with no migration. Any row that ALREADY stores 'other' keeps its value and
renders as "Nao especificado" once the option is gone.
RECOMMENDED DEFAULT: do NOT rewrite those rows in SQL. The PL-18 staged prod read counts them;
if the count is zero this question closes itself, and if it is not, the owner reclassifies each
one by hand in the patient form. Guessing a patient's sex in a bulk UPDATE is a data write no
evidence supports.

## Q-PL-25-1 (2026-07-31, ANSWERED 2026-08-02) - hourly portal slots: every location, and what about staff?
Two sub-questions the CR does not settle:
(a) SCOPE. locations.slot_granularity_min is PER LOCATION (migration 0041, default 30), so
hourly can be set for Linda-a-Velha and Castelo Branco independently. RECOMMENDED DEFAULT: set
it for BOTH - the rule as stated is about how patients book, not about one clinic.
(b) STAFF SIDE. RECOMMENDED DEFAULT: staff booking stays free-form. The CR names the client
portal explicitly; forcing the agenda onto the hour would break the 30-minute and 45-minute
services the desk books today, and reception must always be able to fit a patient in.
Note the mechanics: the granularity is DATA (a hard-gated write), while aligning the slot grid
to the top of the hour is CODE. Without the alignment half, a therapist whose template starts
at 09:30 still yields 09:30 and 10:30 at a 60-minute step.

## Q-PL-23-1 (2026-07-31, ANSWERED 2026-07-31) - health-insurance numbers: one field or a repeatable list?
**ANSWERED by ratification at apply.** The owner applied migration 0051 carrying the recommended
default - a repeatable LIST, each entry `{ insurer, number }` - and the independent read confirmed
it live (jsonb NOT NULL DEFAULT '[]', array CHECK present, 10 of 10 patient rows defaulted, journal
count 51). The shape IS the migration, so applying it settles the question: changing to a single
free-text field now would be a second migration over real data.

## Q-PL-25-1 (2026-07-31, PARTIALLY ANSWERED 2026-07-31) - hourly portal slots
(b) STAFF SIDE: **ANSWERED in code.** Staff booking stays free-form; PL-25 constrains only what a
patient may self-serve from the portal. Forcing the agenda onto the hour would break the 30- and
45-minute services the desk books today.
(a) SCOPE: **STILL OPEN, and now the owner's to set.** `locations.slot_granularity_min` became an
admin control (Admin -> Localizacoes, "Marcacao no portal": *De hora a hora* / *De 30 em 30 min*),
so nobody has to guess and no prod write is needed. Both clinics remain at 30 until he switches
them. GREEN deliberately did NOT change the stored value - that is data, and the owner owns it.

## Q-PL-22-1 (2026-07-31, ANSWERED 2026-07-31) - undoing a bloquear lote batch as a unit
PL-22 writes N `time_off` rows in one transaction, but nothing marks them as ONE batch, so undoing
a mistaken recurrence means deleting each block by hand. Making it one action needs a `batch_id`
column on `time_off`, i.e. a migration. NOT built with PL-22 because 0051 was already in flight and
only one migration is ever in flight at a time.
RECOMMENDED DEFAULT: ticket it as its own card now that 0051 is applied. A nullable `batch_id uuid`
plus a "remover lote" control on the blocks list; append-only semantics are unaffected, and existing
blocks simply carry NULL (they were never a batch).
**ANSWERED (owner, 2026-07-31): ticket it.** Raised as card PL-26, unblocked now that 0051 is
applied. Migration takes 0052 and is apply-before-merge like every other.

## Q-SEC-1 (2026-07-31, ANSWERED 2026-08-02) - G3 re-opened: the rotated prod DB password was later exposed
G3 ("NEW_DB_PASSWORD rotated with full propagation") is attested 2026-07-29. The prod DB password
was pasted into a chat on 2026-07-30 - so the exposure is NEWER than the gate's evidence, and the
credential the gate certifies as safely rotated is the one that leaked. It was carried only in an
assistant memory note and appeared nowhere in the board or in this file, which is how it survived
two sessions unactioned.
GREEN has flipped G3 to **fail** (readiness 7/9 -> 6/9) and opened
`INC-04-prod-db-password-exposed`, rather than leave a launch gate asserting a safety property that
is known to be false. This board's own doctrine is that a claim is never truth on its own.
RECOMMENDED DEFAULT: rotate again in Supabase and propagate to the three Vercel projects
(platform / api / portal) plus `~/osteojp-secrets/new-prod.env`, exactly as on 2026-07-29, then
re-attest G3 with the new date. Owner terminal only; GREEN never sources prod credentials.
IF THE OWNER DISAGREES: flipping G3 back to pass is a one-line change and readiness returns to 7/9.
Say so and it will be done - this is his risk call, not GREEN's, but the board should not make it
silently.
NOTE the propagation half matters as much as the rotation: a rotated-but-unpropagated password
breaks migrations (the 28P01 class of failure already recorded in this file) instead of securing
anything.

**CLOSED 2026-08-02 by the prod read: ZERO rows store 'other'** (4 male, 3 female, 3 blank, of 10
patients). Nothing to reclassify; the question answered itself exactly as the recommended default
anticipated.

## Q-PL-15-1 (2026-07-30, NARROWED 2026-08-02) - patients with no location AND no appointment
The backfill population is now **2 of 10** patients with a NULL `primary_location_id`, down from the
3 this question was written about: PL-15b shipped the clinic field on the patient form 2026-07-30,
so anyone added since carries a clinic. The recommendation is unchanged and now cheaper to follow -
do NOT guess them in SQL, assign two patients by hand in the patient form and the backfill migration
may not be worth writing at all.

## Q-PL-18-1 (2026-07-31, MOOT for prod 2026-08-02) - reception/admin with no location assignment
The prod read shows every ACTIVE reception and admin already assigned, so the fallback this question
is about does not fire for anyone today. The POLICY question (should an unassigned reception see
everything, or nothing?) still stands for future accounts, but it is no longer urgent and no longer
explains anything. The related diagnosis in PL-18 is disproven - see PL-29.

## Q-PL-29-1 (2026-08-02, ANSWERED 2026-08-02) - reception scoping: one observation settles it
GREEN has guessed the cause of the reception report twice and been wrong twice (the no-assignment
fallback; then an RLS read denial). Both are disproven by evidence, and the code path reads correct
for an assigned reception user. GREEN will not guess a third time.
NEEDED, one observation: sign in as **Carlos Barrelas** (reception, Linda-a-Velha), open the Agenda,
and report (a) what the **Terapeuta** dropdown lists, and (b) whether a **Localização** control
appears at all.
 - Only LV therapists, no location control -> the behaviour is already correct and the original
   report described the PRE-PL-14 state (PL-14 merged 2026-07-30; the report came 2026-07-31).
   Close PL-29.
 - Both clinics' staff -> that is the first real evidence of the defect, and the hunt starts from a
   fact rather than a theory.
NOTE: the owner's own account (Ivan M, owner) holds no assignment and is unrestricted BY DESIGN. An
owner screen showing both clinics is correct and is not this bug.


## Question-log housekeeping (2026-08-02)

Six headings above still said OPEN while their own body, or a later entry, had answered them. That
happened because answers were APPENDED as new entries instead of editing the heading, so the file
disagreed with itself and an open-question count taken from the headings was wrong. Corrected in
place. Below is the settled state, so the count is trustworthy again.

**Answered 2026-08-02 by owner ruling:**
- **Q-SEC-1** - the exposed prod DB password: exposure ACCEPTED for now, full credential rotation
  deferred to after the work completes. G3 returns to pass, readiness 7/9. INC-04 stays open as the
  reminder that the rotation is owed - accepting a risk is not removing it.
- **Q-PL-29-1** - reception scoping: verified correct against a real reception account. Both GREEN
  theories were wrong AND there was no defect; the 2026-07-31 report described the pre-PL-14 state.
- **Q-PL-15-1** - MOOT. Of 10 prod patients only 2 lack a clinic: one stays visible through an
  appointment, the other is a synthetic test row. The single unbackfillable patient is test data, so
  the backfill migration is not worth writing.
- **Q-PL-25-1** - both clinics were already at 60-minute (hourly) portal booking, and staff booking
  stays free-form. Settled by prod read plus shipped code, not by a decision that was still pending.

**Still genuinely open, and both are GREEN's own work, not owner decisions:**
- **Q-PL-11-2** - the e2e seed assigns no staff_locations to any test role, so location scoping is a
  no-op in Playwright and the located-role cases cannot be reproduced there. Directly relevant to the
  two CI cards now in flight.
- **Q-PL-14-1** - what a staffer assigned to TWO clinics should get. Still hypothetical: the prod read
  shows only JP holds both, and he is owner, so he is unrestricted anyway. Decide if a non-owner ever
  gets two clinics.

## Q-PL-31-1 - do EXISTING patients with no NIF need a backfill push? (opened 2026-08-03, GREEN)

PL-31 makes a NIF mandatory when CREATING a ficha. It deliberately does not touch patients who
already exist: they keep no NIF, stay editable, and now show a "ficha incompleta" banner plus a block
on issuing a declaração until one is supplied.

**What is not decided:** whether anything should actively chase those patients, and how many there
are. GREEN cannot read prod (never sources prod credentials), so the count is unknown here.

**Recommended default: do nothing beyond the banner, and let the count decide.** The banner already
surfaces the gap at the moment it matters (the ficha, and the declaração button). If a prod read shows
the number is small, reception fills them in as those patients next attend, which needs no build. If
it is large, the honest options are a filter on the patient list ("fichas incompletas") so they can be
worked through deliberately - a small, non-migration ticket - rather than a bulk prompt that nobody
actions.

**To settle it, one read the owner can run:** count patients where `nif IS NULL AND NOT nif_exempt`.

## Q-PL-31-2 - should the invoicing path block on a missing NIF too? (opened 2026-08-03, GREEN)

PL-31 blocks the **declaração** for a ficha with no NIF and no exemption, because that document
carries the patient's fiscal identity. The invoicing tab (`canInvoice`) was left alone.

**Why it was not decided here:** invoicing legal compliance is explicitly owner-confirmable in
CLAUDE.md, and a fatura-recibo with no NIF may be legitimate in PT (it is issued to *consumidor
final*). Guessing either way risks blocking a legal invoice or permitting a non-compliant one.

**Recommended default: leave invoicing unblocked, and revisit with the accountant.** A missing NIF on
an invoice is a known, legal shape in Portugal; a wrongly blocked invoice stops the clinic being paid,
which is a worse failure than a fatura that has to be reissued. The "ficha incompleta" banner is
already visible on the same patient's record, so whoever issues the invoice can see the gap.

## Q-ACC-SIGN-1 - the ingestion signer shipped without a ticket (opened 2026-08-14, CYAN)

CLAUDE.md: "Never start work that has no ticket. If the owner gives an ad-hoc instruction, create the
ticket first, then execute." `scripts/ingestion-sign.mjs` was built on a direct owner instruction for
a live acceptance window and carries no card on either board.

**Why a card was not created instead of asking.** `docs/board/portal-board.json` is named in
PORTAL-REHYDRATE.md §1.2 as the one real collision risk on the repo, written by both active lanes
every dispatch. This is an acceptance-session tool for an `apps/web` endpoint, so it is not a portal
card in the first place, and adding a foreign card to a board two other terminals are editing buys a
conflict for no traceability gain.

**Recommended default: card it on the platform board, after the acceptance session, as shipped.**
`docs/board/prelaunch-board.json` is the platform board and WF-14 transfers its custody to PURPLE.
One card, `status: shipped`, evidence `pr:<this PR>`, written by whoever next has that board open
rather than by a third terminal reaching across. Retroactive, which is the wrong order, but the
alternative was either a board conflict during a live window or not sending the three signed requests
the acceptance session is blocked on.

**What is actually open for the owner:** whether an out-of-band tool built during an acceptance
window needs a card at all, or whether the DECISIONS.md entry is the record. This is the third
instance in a fortnight of work existing without a card, and `LE-board-pr-reconciliation` already
cards the general failure.

## Q-PEDIDO-EMIT-1 - when reception cannot be told about a pedido, does the patient's booking fail? (opened 2026-08-20, PURPLE)

`LE-pedido-emit-best-effort`. A patient's portal booking writes the appointment, commits, and then
emits a staff notification. **That emit is best-effort and cannot fail the booking**, which is a
deliberate and correct position stated at all three call sites: a patient whose booking succeeded
must not be told it failed because reception's notification could not be written.

**What that costs, and it is more than a missing notification.** The `staff_notifications` row with
`kind = 'appointment_request'` is the **only** provenance marker in the database that says "a patient
asked for this". Migration 0059's `is_unconfirmed_pedido` joins on exactly that row. With no row, the
appointment is indistinguishable from a staff booking: reception is never told to confirm it, **and
it blocks its slot as though it had been confirmed**. The patient's request is lost and the slot is
taken by nothing.

**Two ways it happens, both re-derived from `main` on 2026-08-20.** The insert throws; or
`resolveRecipients` returns an empty list - a tenant with no active reception user whose practitioner
id does not resolve to a `users` row. The second path throws nothing at all and, until this PR,
logged only at WARN.

**Shipped in this PR, and it is the half that needs no ruling:** the loss is now loud. `delivered`
carries a `reason` (`no_recipients` | `consumer_threw` | `stub`) so three different failures stop
wearing one face, and `emitPatientChange` logs an ERROR naming the appointment id and, for a pedido,
the consequence. **A lost pedido is now greppable and recoverable by hand. It is not yet prevented.**

**What is actually open for the owner, and it is one question:** should a portal booking that cannot
be recorded as a pedido be **refused to the patient**, so that no untracked appointment is ever
created? Refusing means a patient occasionally sees "tente novamente" when the clinic's own
notification write failed. Not refusing means a lost request and a blocked slot, silently, at a rate
nobody has measured.

**Recommended default: do NOT refuse. Fix it with a provenance column instead, when a migration slot
is free.** A boolean or an enum on `appointments` recording that the row was created by a patient
principal makes `is_unconfirmed_pedido` independent of the notification entirely, which fixes the
blocking half AND makes the missing notification recoverable by query rather than by grep. The card
already records why `created_by IS NULL` cannot serve:
`packages/db/tests/appointments-created-by-provenance.test.ts` proves 7/7 against live Postgres that
0049's WITH CHECK is a disjunction, so a staff principal may insert a null `created_by`.

**Why it was not built here:** `PORTAL-REHYDRATE.md` §1.1 - neither lane authors a migration this
phase, and a lane that finds it needs one stops before writing anything and tells the owner. That is
what this entry is.

### RULED 2026-08-20 BY THE OWNER: option A. The booking is NOT refused.

**The recommended default is the ruling.** A portal booking that cannot be
recorded as a pedido is still accepted, and the patient is not shown an error
caused by the clinic's own notification write. **The provenance column is the
agreed fix**, and it fixes both halves: reception can find the request, and
`is_unconfirmed_pedido` stops depending on the notification row, so the pedido
stops blocking its slot.

**How it gets built, so nobody improvises it.** The column is a MIGRATION. It
goes through the standard path in full: authored on a card, PR opened, **applied
by Ivan from the `osteojp-prod-apply` worktree before the PR merges** (standing
rule 7), with the journal output pasted back. `gate` on that card is therefore
`owner_merge`, not `green_self_merge`.

**The slot: `0067` IS FREE TODAY, and that is worth stating because the ruling
names it as the blocker.** Derived from `packages/db/migrations/meta/_journal.json`
on 2026-08-20: 66 entries, idx 0-65, highest tag `0066_users_must_set_password`.
Nothing occupies `0067`. **So the card is not waiting for a slot to fall vacant.
It is waiting for a DISPATCH that authorises authoring a migration**, because
`PORTAL-REHYDRATE.md` §1.1 forbids either lane authoring one in this phase and
the 2026-08-20 run was told explicitly to author none. Take the number at
AUTHORING time from whatever is free then, never from this paragraph - rule 7 is
explicit that a reserved number in a deferred card's notes is how the same number
got double-booked twice.

**What shipped in the meantime, and what did not.** #971 made the loss loud: a
lost pedido now writes an error line naming the appointment and saying what it
costs, so it is findable and repairable by hand. **The slot is still blocked and
the loss is still not prevented.** That does not change until the column lands.

---

## Q-LE-REMINDERS-LANDLINE-1 (2026-08-20) — when a patient's stored number is a landline, what should the 48h/24h reminder do?

**Owner or JP. Recommended default stated below; nothing has been built either
way, and no terminal may guess this** (`PORTAL-REHYDRATE.md` standing rule 15).

**THE SITUATION, re-derived from `main` rather than taken from the card.**
Portuguese geographic numbers (the `2` prefix) cannot receive SMS.
`normalizePhonePT` accepts them — deliberately: normalisation is a different rule
from SMS capability, and `PT_SUBSCRIBER` at `apps/web/lib/reminders/phone.ts` is
`/^[29]\d{8}$/`. `#865` added `isSmsCapablePT` and wired it into the **OTP
request route only**. So today `apps/web/lib/reminders/dispatch.ts` normalises a
landline successfully, hands it to Twilio, and **the clinic is billed for a
message nobody can receive.**

**WHY THIS IS NOT THE OTP CASE, stated so nobody promotes it on a security
card's coat-tails.** The OTP exposure was unbounded because an **unauthenticated
stranger** chose the numbers. Here the numbers come from the clinic's own patient
records and the volume is bounded by real appointments. **This is a data-quality
and small-waste question, not an abuse surface.**

**THE THREE OPTIONS, as the card frames them.**

1. **Skip it**, logging the structured warning `dispatch.ts` already emits for an
   invalid phone (ids only, never the number). Stops paying for undeliverable
   messages. **Costs:** the clinic loses a reminder it currently believes it is
   sending, silently, unless somebody reads the log.
2. **Skip it and surface it to staff**, so reception can ask the patient for a
   mobile. More work, and the right answer if the clinic wants the **data
   cleaned** rather than the sends suppressed.
3. **Leave it.** The spend is bounded by the appointment count.

**RECOMMENDED DEFAULT: option 2.** Option 1 trades a visible waste for an
invisible one, and this project has now counted several instances of exactly that
trade going wrong — a reminder that silently does not send is indistinguishable,
from the clinic's side, from one that did. Option 3 keeps paying for messages
that reach nobody **and** leaves a patient with no reminder at all, which is the
same outcome as option 1 with a bill attached. Option 2 is the only one where the
landline stops being a silent hole: reception is told, and the number can be
fixed once instead of failing every appointment.

**WHAT SHIPPED IN THE MEANTIME, and it decides nothing.**
`apps/web/lib/reminders/phone-parity.test.ts` — a drift guard between the two
`phone.ts` copies. `apps/api/lib/notify/phone.ts` declares itself a **mirror** of
`apps/web/lib/reminders/phone.ts` and that comment was the whole of the
enforcement; nothing compared them. **Whichever way this is ruled, the two copies
must move together or that comment becomes false**, and the guard is what refuses
a one-sided change. It takes no position on the ruling: it asserts the two
**agree**, whatever they agree on.

**WHAT IS BLOCKED UNTIL THIS IS ANSWERED.** `LE-reminders-landline-dispatch`, the
code half. Nothing else.

### RULED 2026-08-20 BY THE OWNER: option 2, skip-and-surface-to-reception.

**The recommended default is the ruling.** Both halves are built.

**The skip.** `apps/web/lib/reminders/dispatch.ts` refuses a geographic number
before `sendSms`, with **its own reason and not `invalid_phone`** — those are
different facts about different problems, and one log line saying "invalid"
sends reception to correct a number that is correct.

**The surface is a derived query, not a log of skips**, and that is the design
decision worth recording. The obvious build records every skipped reminder and
shows reception the list: it needs a table, and it reports a message that has
**already** not been sent, at 48 or 24 hours out — when there is least time to
act. The fact reception needs is knowable without any of it: **a patient whose
stored number cannot receive SMS and who has an appointment coming up.** Derived
from `patients.phone_e164` and `appointments.starts_at`, so it needs **no
migration**, nothing that can drift, and it surfaces the problem **before** the
reminder is due.

**The predicate moved to `@osteojp/notify` rather than being copied.**
`isSmsCapablePT` lived in `apps/api`, and the two apps cannot import each other
— so the choice was a shared package or a **third** copy of a phone predicate
this repo already duplicates once.

**Two test fixtures were modelling the defect and asserting it was fine**, which
the change surfaced: `dispatch.test.ts` and `reminders-e2e.smoke.test.ts` both
used `+351 210 000 000` — a Lisbon **landline** — as the *patient's* number and
asserted an SMS was dispatched to it. Both now use a mobile of the same length,
so the smoke test's worst-case segment fill is unchanged.

**What the skip does not do, plainly:** it does not help the patient. The clinic
stops paying and the patient still gets nothing. **Only the surface half does
anything for them** — which is why the ruling has two halves and why option 1 was
not the recommendation.

---

## Q-PORTAL-DEAD-I18N-1 (2026-08-20) — 163 portal strings have no screen behind them. Delete, wire up, or leave?

**Owner. Recommended default below. Nothing has been deleted and nothing has been
wired up**; `LE-dead-i18n-keys-imply-screens` is blocked on this.

**WHY THIS IS NOT TIDINESS, and it is the only reason it is worth your time.** A
string with no screen behind it **reads as coverage.** Somebody asking "does the
portal handle X well?" finds a sensible Portuguese sentence, in the right file,
and concludes X is handled. **It is not handled — it is unreachable**, which is a
different and better fact, and nothing on the surface says so.

**THE CARD SAID SIX. IT IS AT LEAST 163 OF 408**, measured on `main` at
`4b385e6` and now pinned by `scripts/portal-i18n-dead-keys.test.mjs`. By group:

| Group | Dead | What those strings describe |
|---|---|---|
| `auth` | **33** | email, password, magic link, activate — **the login flow Decision D retired** |
| `forms` | 31 | the patient intake forms as originally drawn |
| `services` | 21 | service and sub-service names |
| `account` | 17 | change password, delete account, NIF |
| `booking` | 16 | labels from an earlier booking flow |
| `documents` / `clinics` | 8 each | invoices, declarations, addresses, hours |
| `intake` | 7 | error paths |
| **`errors`** | **6** | **the six the card names**: 403, 500, offline |
| `common` / `dashboard` / `appointments` / `guest` | 16 total | |

**`auth` at 33 is the one that matters most, and the card never saw it.** Portal
login is phone-and-code. Those 33 strings describe a password-and-email login
screen **that no longer exists** — including "Recuperar palavra-passe". Anyone
checking whether the portal has password recovery finds the copy for it.

**163 IS A FLOOR, NOT A COUNT.** The scan deliberately over-counts *references*
(so it under-counts dead keys), because a false "this key is dead" could get a
live string deleted. The true number is at least 163 and may be higher.

### The three options

1. **Delete.** Cleanest. A future screen writes fresh copy — which it would need
   anyway: the 403 body currently offers no retry, no navigation and no
   telephone, so wiring it up as-is would ship a dead end.
2. **Keep and wire up.** Defensible for `500` and `offline`, which **are**
   reachable states of a browser even though no route renders them today. **Not**
   defensible for `403` under Decision D, and not defensible for the 33 `auth`
   strings at all.
3. **Leave them.** Costs nothing to run and keeps the trap: every audit of the
   portal's coverage reads them as features.

**RECOMMENDED, and it is deliberately split rather than one answer for all 163:**

- **`auth` (33) — DELETE.** They describe a retired login model. Leaving them is
  the single most misleading thing in the file.
- **`errors.403_*` — DELETE.** Unreachable under Decision D, and the copy is
  unusable as written.
- **`errors.500_*` and `errors.offline_*` — KEEP AND WIRE UP.** Real browser
  states, and a portal with no error boundary is a blank page.
- **The remaining ~120 — LEAVE FOR NOW, ratcheted.** They are mostly forward
  copy for screens that are planned rather than retired, and deciding them one at
  a time as those screens land is cheaper than one large sweep.

**WHAT IS ALREADY DONE, and it needs no ruling.** The count **cannot grow
silently** any more: the guard is in the required check, a 164th dead key is red,
and the failure says which group it landed in. A string added ahead of its screen
now has to arrive with the screen, or be declared dead with a reason.

### RULED 2026-08-20 BY THE OWNER: the split recommendation, applied.

**35 keys deleted from both locales** — the 33 `auth` strings and
`errors.403_*`. **`errors.500_*` wired up**, and it closed a real gap rather than
merely spending a key: `apps/portal/app/global-error.tsx` **did not exist**, so a
crash in the root layout fell past every route boundary to Next's unstyled
English default.

**One departure, flagged rather than buried: `errors.offline_*` is kept and NOT
wired.** `navigator.onLine` reports **true** on a router with no internet, so the
obvious banner would tell a working patient they are offline — §1.3's shape, in
the product rather than in an instrument. It also fails the other way: a phone
that has lost signal often still reports `onLine` true for several seconds, so
the banner would be absent exactly when it would help. An honest version
distinguishes a **network** failure from an **HTTP** failure inside the portal's
api client, which is its own piece of work. Carded as
`LE-portal-offline-state-unwired`; the keys stay declared with that reason.

**The ratchet is lowered 163 → 126, re-measured rather than subtracted.** The
remaining 126 are left per the card, and cannot grow silently.

---

## Q-RB-02-1 — should Nova marcação PRE-FILL the repeat count from the pacote?

**Raised 2026-08-20 while building RB-02. Not blocking: the capability shipped,
this is about the form's default.**

> ### CORRECTED 2026-08-21, BEFORE ANYBODY ACTED ON IT.
>
> **This question was written on a false premise and the false half is struck
> out below.** It said reception could already book ten sessions "by choosing the
> pacote and setting the repeat count to ten". **They cannot**, and there is no
> repeat count to set: **"Agendar lote" is hidden whenever a Pacote is
> selected**, and has been since W8-01c. What shipped was a server-side change on
> a code path the interface does not use.
>
> **The question below is still worth answering and is unchanged in substance** —
> it is now a question about `RB-02b`, the card that makes the behaviour
> reachable, rather than about a default on a control that exists.

**WHAT IS BUILT AND WORKING.** A pacote booking writes a real link, so the
balance is derived from actual appointments rather than a counter, and booking
against a pacote with nothing left is **refused by name**.

**WHAT IS NOT BUILT** (`RB-02b`): booking N at once from the interface at all.

**WHAT IS NOT DECIDED, and this is the question.** When that control does open
for pacotes, should it **pre-fill** the number of appointments with the sessions
remaining, and at what interval?

**WHY IT IS NOT A DEFAULT I WILL PICK.** The count is the easy half; the
**interval** is the question, and it is clinical rather than technical. Weekly is
the obvious guess and it is a guess: a ten-session pacote spread weekly commits a
patient to a specific weekday for two and a half months, and the clinic may well
book four now and the rest as the treatment progresses. Guessing wrong here does
not produce an error — it produces **ten real appointments in the diary at the
wrong cadence**, which somebody then has to unpick one at a time.

**RECOMMENDED DEFAULT, if you want one now: pre-fill the COUNT, leave the
INTERVAL blank.** The count is a fact about the pacote the form already knows;
the interval is a decision about the patient. That gets the "a pacote of ten
books ten" behaviour without the system committing anyone to a Tuesday.

**WHAT HAPPENS IF THIS IS NEVER ANSWERED:** nothing breaks and nothing is
blocked. `RB-02b` can ship the control with the number typed by hand, which is
what reception already does for every other repeating booking, and the pre-fill
can be added later without touching anything else.

## 2026-08-31 — Q-W14-01: the 48h email cannot reach a patient who has not opted in, and the default was JP's

**BLOCKING the owner's 48h-email workflow. Owner-confirmable: it reverses a
recorded JP product decision and it is a consent question.**

Context. Migration 0019 added `patients.reminder_email_enabled` with **DEFAULT
false**, and its header records why: *"SMS on, email off by default, per Joao
Pedro's product decision"*. `dispatchReminder` honours it, so the 48h email
reaches **only** patients who have gone into the portal and switched Email on.
Nobody has. The owner's stated workflow is that the 48h email goes to every
patient who has an email address.

These cannot both be true. The routing half is now enforced server-side
(48h = email, no SMS twin); the **reach** half is this question.

What was deliberately NOT done. The application could treat email as on unless
the patient turned it off — but `false` is what BOTH "never chose" and "opted
out" look like in this column, and SR-08 forbids building a set from the absence
of a record. There is no provenance to distinguish them: the portal profile
PATCH (`apps/api/lib/patient/profile.ts`) writes no audit row.

Recommended default: **flip the column default to `true` and backfill existing
rows**, in a migration, and leave the portal toggle exactly as it is so a
patient can still opt out. The portal already promises this behaviour — the
toggle's own hint reads *"Email — Enviado 48h antes da consulta."* Note this is
itself blocked on SR-11 (see Q-W14-05).

Alternative if JP's default stands: the 48h email is for opted-in patients only,
and the clinic accepts that most patients receive the 24h SMS alone.

## 2026-08-31 — Q-W14-02: decision A collides with request-mode booking (ANSWERED 2026-08-31)

**ANSWERED, owner ruling 2026-08-31:** *"the booking confirmation sends for
portal-originated appointments only, and only at the moment reception ACCEPTS
the pedido, never at request time."* The recommended default was taken.
Implemented in `confirmAppointmentRequest`, which now emits
`appointment/scheduled` post-commit; W14-confirmation-on-accept and
W14-portal-bookings-emit-no-reminder-events both close on it. Original entry:

**Owner-confirmable. Affects what a patient is told after booking.**

Context. The 2026-08-31 dispatch ruled decision A: the booking confirmation
sends only for portal patient-initiated bookings, and staff-created
appointments send none. The authorship half is implemented
(`appointments.origin = 'patient_portal'`).

The collision. JP ruled on 2026-08-06 (*"certo"*) that all twelve
patient-bookable services are **request mode, zero auto-confirmed** — every
portal booking is a pedido de marcacao awaiting reception. The approved
confirmation body opens *"A sua marcacao esta confirmada"*. Sending it at
booking time would tell the patient the clinic accepted a request it has not
seen. That is the R10 failure with the assertion moved into the first sentence.

What shipped. `dispatchConfirmation` now requires `origin = 'patient_portal'`
**and** that the appointment is not an unaccepted pedido. Both halves are
enforced, so today the confirmation sends for nothing — staff bookings are out
of scope by decision A, and portal bookings are pedidos.

Recommended default: **send the confirmation when reception ACCEPTS the pedido**,
not when the patient makes it. That needs the accept path to emit
`appointment/scheduled` (carded, `W14-confirmation-on-accept`). The body is then
true when it arrives and needs no new copy or approval.

Alternative: a distinct *"pedido recebido"* body sent at request time — new
patient-facing copy, so a JP approval.

## 2026-08-31 — Q-W14-03: three new patient-facing bodies need JP's approval

**Owner/JP. Nothing sends until answered; the appointment transitions do not
wait on it.**

The inbound reply capability answers the patient after they text SIM or NAO.
That wording did not exist when JP approved the packet on 2026-08-03, so it is
registered `approved: false` and every send is refused `template_unapproved`.
Sections 12, 13 and 14 of `docs/notifications-approval-packet.md` carry the
exact strings for the sitting.

A fourth item is in the same section: **the approved 24h SMS does not tell the
patient they can reply.** It has NOT been changed — amending an approved body is
not ours — so today only a patient who replies unprompted is answered. The line
that would be appended is `Responda SIM para confirmar ou NAO para cancelar`
(already built as a config value in `reminder-copy.ts`, already GSM-7 and
single-segment with it).

## 2026-08-31 — Q-W14-04: the production SMS sender is alphanumeric, so no reply can arrive

**Owner console action. The inbound capability cannot function until it is done.**

`TWILIO_SMS_FROM=OsteoJP` — the PT alphanumeric sender ID approved 2026-06-11
and confirmed on the handset in the 2026-07-11 delivery proof. **Alphanumeric
sender IDs are one-way.** A patient's SIM has nowhere to go, so the whole
inbound path is inert regardless of the code.

Recommended default: provision a Portuguese mobile long code in Twilio, put it
in the Messaging Service that already holds the alphanumeric sender, and point
its inbound webhook at the route. Then either set `TWILIO_SMS_FROM` to that
E.164 number, or clear it and set `TWILIO_MESSAGING_SERVICE_SID` (the code now
passes a service SID as `MessagingServiceSid`, which is the correct Twilio
parameter — it was previously passed as `From`, which is not).

Consistency question inside it: the 48h path is email and unaffected, but the
booking confirmation SMS and the follow-up/no-show SMS would move to the same
sender. Recommendation: **move them all**, so a patient sees one identity from
the clinic rather than two.

## 2026-08-31 — Q-W14-05: migration 0069 is needed and BLUE may not author it (PARTLY ANSWERED 2026-08-31)

**PARTLY ANSWERED — strategy ruling SR-14, 2026-08-31:** migration authorship
opened to BLUE for **0069 only**, the reminders inbound review queue table.
Authored, applied to production under apply-before-merge, journal proof 68 → 69,
and authorship froze again on merge.

**ITEM 1 IS CLOSED. ITEM 2 IS NOT.** SR-14 named one table. The
`reminder_email_enabled` default flip (Q-W14-01) is a different migration and a
different question — it needs BOTH a JP product decision AND a further strategy
release. It remains blocked. Original entry:

**Strategy decision (SR-11), not an owner one. Recorded here because it bounds
two of the questions above.**

Two things need a migration and neither was written:

1. `sms_inbound_events` — the reception review queue's store. Reception cannot
   read a reply body without somewhere to keep it, and `audit_log` is the wrong
   home (PII rule #7, and it has no resolution state). The wiring is complete up
   to `recordForReview`, which is a no-op until the table exists.
2. The `reminder_email_enabled` default flip in Q-W14-01.

SR-11 released migration authorship to BLUE for 0068 only and re-froze it on
merge, *"until strategy releases it"*. Next free number is 0069.
