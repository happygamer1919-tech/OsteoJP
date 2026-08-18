# Decisions log

Append-only. Every session appends decisions made and reasoning.

## 2026-06-11 — W1-10 AppShell (staff + portal) + apps/web migration (branch design/W1-10-appshell)

Design loop Wave 1, final task. Per SPEC-foundation §4.11. The only Wave 1 task
permitted to touch apps/web.

- **Two shells in packages/ui.** StaffAppShell (64px top bar, icon+label nav,
  right-side slots, hamburger→native-<dialog> slide-over under 768px, content
  max-w-7xl) and PortalShell (56px top bar, 64px bottom tab bar with 44px
  targets, desktop tabs-on-top at max-w-160). Both are presentational and
  framework-agnostic: nav is data, role filtering stays with the caller, and a
  `linkComponent` prop injects next/link (defaults to <a>).
- **Content wrapper is a <div>, not <main>.** The existing app pages own their
  <main> landmark, so the shell must not nest one — preserving the prior contract
  and avoiding a nested-main a11y defect.
- **apps/web migration.** app-shell.tsx now renders the shared shell through
  StaffShellClient, a thin client wrapper that injects next/link, computes the
  active item from usePathname, and maps each route to its canonical icon — the
  icon map must live client-side because LucideIcon components can't cross the
  server→client prop boundary. Role-gated nav (navItemsForRole) and the logout
  server action are unchanged; nav-links.tsx (the old sidebar list) was removed.
- **Tailwind @source.** apps/web/globals.css now @sources packages/ui/src so
  Tailwind v4 generates the shell's utility classes (it does not scan workspace
  packages by default; BrandLockup never needed it as it is class-free).
- **lucide-react added to apps/web** (the already-approved Q8 dependency) for the
  route→icon map.
- **AA fix (Q13):** SPEC §4.11's portal nav colors (active accent-2-600, inactive
  text-muted) fail AA at 12px; shipped accent-2-700 / text-secondary (both clear
  4.5:1 text and 3:1 icon). Icon buttons aligned to the h-10 (40px) interactive
  height. design + a11y reviewers PASS after the fix.
- **Verification:** gates green (lint/typecheck/test/build/Storybook). The live
  shell render is exercised by the CI Playwright e2e suite (login → app), since a
  build cannot confirm Tailwind class generation.

## 2026-06-11 — W1-09 HeritageDivider (branch design/W1-09-heritage-divider)

Design loop Wave 1, ninth task. Per SPEC-foundation §4.12 + brand-tokens §6.

- **HeritageDivider** renders the tileable motif as a repeating CSS
  background-image. The motif SVGs (PR #175) are embedded as URL-encoded data
  URIs (generated `heritage-svg.ts`) so they tile with no bundler-specific asset
  import — the same bundler-agnostic rationale as BrandLockup's inline SVG. The
  encoded colors are the canonical brand tokens; §4.12 says the color comes from
  the asset, so there is no recoloring prop in Wave 1.
- Decorative only: aria-hidden, not focusable, not animated. SPEC dimensions as
  dynamic utilities: h-2.5 (10px), max-w-80 (320px), my-8 (space-8).
- The allowed-hosts rule (auth / EmptyState / loading / settings dividers; never
  behind data; off patient-facing portal until Q6) is documented in the docblock,
  for the design reviewer to enforce at call sites.
- **EmptyState's `heritage` wiring is intentionally left as a follow-up** — wiring
  it would edit W1-07's component internals, which the PLAN cross-task rule
  forbids (only edit another task's component through its exported API).
- **Reviews:** design-reviewer PASS, a11y-reviewer PASS (first pass).
- **Gates:** lint, typecheck, test, build (web), Storybook all green.

## 2026-06-11 — W1-08 Toast and Banner (branch design/W1-08-toast-banner)

Design loop Wave 1, eighth task. Per SPEC-foundation §4.9.

- **Toast** is a provider + `useToast()` hook + a fixed viewport. The viewport is
  one `aria-live="polite"` region; individual error toasts carry `role="alert"`
  so they announce assertively without changing the region — satisfying "single
  polite region, assertive for error" cleanly. Auto-dismiss is 5s with true
  pause-on-hover/focus (remaining time tracked per item, not a full restart).
  Stack is capped at 3 (oldest dropped) via `slice(-3)`.
- **Banner** is a stateless bar; the "one banner per screen, collapse extras to a
  count" rule is a screen responsibility (documented in the story) — the
  component exposes an optional `count` and never self-stacks.
- Both use `text-primary`/`text-accent-2-700` for text (AA-safe), semantic tints
  for backgrounds, and semantic-colored icons.
- **Reviews:** design-reviewer PASS, a11y-reviewer PASS (first pass).
- **Gates:** lint, typecheck, test, build (web), Storybook all green.

## 2026-06-11 — W1-07 Skeleton, EmptyState, ErrorState (branch design/W1-07-skeleton-empty-error)

Design loop Wave 1, seventh task. Per SPEC-foundation §4.10.

- **Skeleton** uses `animate-pulse` on a surface-muted block (consistent with the
  KpiCard/Table loading placeholders), going static under prefers-reduced-motion
  via the global rule, rather than a bespoke gradient "sweep" — same loading
  affordance, no theme.css change, no arbitrary gradient values. Sized via
  className so it mirrors real layout; helpers SkeletonText / SkeletonTable.
- **EmptyState** `heritage` prop is reserved with a `TODO(W1-09)` (HeritageDivider
  is not merged) per the PLAN cross-task rule.
- **ErrorState** keeps codes out of the headline (separate `code` line) and uses
  `text-secondary` for the de-emphasized code line because `text-muted` fails AA
  on white (the systemic Q11/Q12 note).
- These components unblock the W1-06 Table TODO (SkeletonTable/EmptyState/ErrorState).
- **Reviews:** design-reviewer PASS, a11y-reviewer PASS (first pass).
- **Gates:** lint, typecheck, test, build (web), Storybook all green.

## 2026-06-11 — W1-06 Table + TableCardRow, Tabs, SegmentedControl (branch design/W1-06-table-tabs-segmented)

Design loop Wave 1, sixth task. Per SPEC-foundation §4.7–§4.8.

- **Table is column-config driven and generic** over the row type. Built-in
  loading/empty/error render inside the bordered frame. Loading uses placeholder
  bars and empty/error use consumer slots, each marked `TODO(W1-07)` — Skeleton/
  EmptyState/ErrorState are not merged yet (PLAN cross-task rule).
- **Interactive rows use one stretched `<a>`** inside the first cell over a
  `relative` row = a single tab stop, so such rows must not contain other
  interactive cells. `getRowHref`/`getRowLabel` are **type-coupled** (a
  both-or-neither union) so a row link can never be nameless (a11y review fix).
- **Tabs / SegmentedControl** implement full roving-tabindex keyboard nav
  (arrow/Home/End) with the correct roles (tablist/tab + aria-selected;
  radiogroup/radio + aria-checked). SegmentedControl's active pill slides between
  equal-width segments via an inline-styled transform at --duration-fast.
- **Review fixes:** design-reviewer — TableCardRow label was on the text-xs
  badge tier; moved to text-sm to match the value (both body-sm). a11y-reviewer —
  the row-link name coupling above. Re-review: design PASS, a11y PASS.
- **Gates:** lint, typecheck, test, build (web), Storybook all green.

## 2026-06-11 — W1-05 Drawer and Dialog (branch design/W1-05-drawer-dialog)

Design loop Wave 1, fifth task. Per SPEC-foundation §4.6.

- **Built on the native `<dialog>` element** (`showModal()`), deliberately, over
  a hand-rolled portal+trap. Native dialog provides the focus trap, Escape,
  inert background, top-layer stacking (so the Drawer's discard Dialog sits above
  it), and focus restoration — all correctly and without bespoke code. A shared
  `useAnimatedDialog` hook adds enter/exit transitions by keeping the element
  open through the exit and `close()`-ing it one --duration-base later.
- **Dirty-discard wiring:** every dismiss path (Escape via onCancel, the X,
  footer Cancel, backdrop click where `e.target === e.currentTarget`) routes
  through `requestClose()`, which opens the discard confirm Dialog when `dirty`
  and `discard` copy are set, else closes. The discard Dialog is a destructive
  confirm rendered inside the Drawer.
- **Drawer-owned footer.** The Drawer renders its own ghost-cancel + primary
  -confirm footer (via `onConfirm`/labels) rather than a free slot, so the
  cancel button shares the same dirty-aware close path.
- **Motion:** Drawer slides (translate-x), Dialog fades only — no scale, per
  design principle 4 ("no scale-ups").
- **SPEC dimensions** as dynamic spacing utilities: drawer 480px = `w-120`,
  dialog max-width 400px = `max-w-100`; `h-dvh` for full-height mobile.
- **Reviews:** design-reviewer PASS; a11y-reviewer one nit only (the 32px ghost
  X close button is below 44px — acceptable on staff surfaces). Native dialog
  satisfies the role=dialog/aria-modal + labelled-by-title requirement.
- **Gates:** lint, typecheck, test, build (web), Storybook all green.

## 2026-06-11 — W1-04 Card, KpiCard, StatusChip (branch design/W1-04-card-kpi-statuschip)

Design loop Wave 1, fourth task. Per SPEC-foundation §4.4–§4.5.

- **Card** renders the right element explicitly (a/button/div) rather than a
  polymorphic `ElementType`, which keeps `onClick`/`aria-*` fully typed. The
  interactive variant is one tab stop; nesting other interactive elements inside
  it is documented as unsupported.
- **KpiCard** composes Card. Its loading state is an interim 32px `animate-pulse`
  placeholder with `TODO(W1-07)` to swap for the real Skeleton once W1-07 merges
  (PLAN cross-task rule).
- **StatusChip AA fix (Q11):** the spec sets each tone's text to its semantic
  color, but `success` (3.52:1) and `warning` (3.27:1) fail WCAG AA on their
  tints (and on white). Those two tones keep the tint + colored 8px dot (graphical,
  3:1) and use `text-primary` for the label; error/info/neutral pass and use
  semantic text per spec.
- **Review fixes:** a11y-reviewer flagged (1) KpiCard's comparison line in
  `text-muted` (2.95:1) — spec said text-muted but that token is "deemphasized
  labels", not body copy — changed to `text-secondary` (5.68:1); and (2) the
  global focus ring `accent-2-500` at ~2.4:1 vs the 1.4.11 3:1 threshold. (1) is
  fixed. (2) is **system-wide** (identical on all four merged components and
  SPEC §2); changing it in Card alone would make its ring inconsistent with every
  other control, so it is kept and logged as QUESTIONS Q12 for a single
  coordinated token change. design-reviewer PASS; a11y re-review clears the
  blocker, leaving only the documented Q12 ring item.
- **Gates:** lint, typecheck, test, build (web), Storybook all green.

## 2026-06-11 — W1-03 Select, Checkbox, Switch (branch design/W1-03-select-checkbox-switch)

Design loop Wave 1, third task. Implemented per SPEC-foundation §4.3.

- **Switch is a native checkbox with `role="switch"`**, not a `<button>`. This
  gets form participation, keyboard operation (Space), and controlled/
  uncontrolled handling for free, and the browser exposes `aria-checked` from the
  checkbox's checked state. The thumb is a sibling span driven purely by
  `peer-checked` (no JS state). Screen owns the accessible name + status text.
- **Checkbox is a native `<input>` styled with `appearance-none`** plus overlaid
  Check / Minus icons toggled by `peer-checked` / `peer-indeterminate`. The
  indeterminate property is set imperatively via a ref effect (it has no HTML
  attribute). Verified `peer-indeterminate` generates the expected CSS.
- **Select reuses W1-02's `control-skin`** (now on main) for an identical Input
  look and Field-context wiring; `appearance-none` hides the native arrow and a
  ChevronDown affordance is overlaid.
- **White Check/Minus and the white thumb on accent-2-600 are graphical objects**
  (WCAG 3:1, ~3.1:1) — not text — so they clear the bar; this is why the checkbox
  fill stays at the spec's accent-2-600 rather than the darker button teal.
- **All three are `"use client"`** (context/hooks/interactivity; the server shell
  imports the barrel).
- **Review fix:** design-reviewer flagged the Check/Minus icons at strokeWidth 2;
  corrected to 1.75 per SPEC §3. Both reviewers then PASS.
- **Gates:** lint, typecheck, test, build (web), Storybook all green. No
  QUESTIONS opened.

## 2026-06-11 — W1-02 Field, Input, Textarea (branch design/W1-02-field-input-textarea)

Design loop Wave 1, second task. Implemented per SPEC-foundation §4.2.

- **Field owns accessibility wiring via React context.** Rather than make every
  screen hand-wire `htmlFor`/`id`/`aria-describedby`/`aria-invalid`/
  `aria-required`, Field generates the ids and a control placed as `children`
  inherits them through a `FieldContext` (`useField`). Input/Textarea fall back
  to their own props when used standalone (no Field). This keeps screen code to
  `<Field label error><Input/></Field>`.
- **Components are client (`"use client"`).** Field calls `createContext`, which
  is client-only; the staff shell (`apps/web/components/app-shell.tsx`, a server
  component) imports the `@osteojp/ui` barrel, so the build pulled Field into a
  server module and failed until the directive was added. Input/Textarea also
  carry it (they use context/hooks and are interactive by nature).
- **Shared `control-skin.ts`** holds the common Input/Textarea visual treatment
  (surface bg, border-strong, accent-2-500 focus border + global ring, error
  border when invalid, muted surface when disabled) so the two controls cannot
  drift apart.
- **Required marker:** the visible `*` is `aria-hidden`; requiredness is conveyed
  programmatically via native `required` / `aria-required` on the control.
- **SPEC-mandated dimensions** kept as-is: input 40px (`h-10`), textarea 96px
  min-height (`min-h-24`) — these are component dimensions the SPEC fixes, not
  free spacing, same treatment as the W1-01 button heights.
- **Gates:** lint, typecheck, test, build (web consumer), Storybook build all
  green. design-reviewer and a11y-reviewer both PASS, zero blocker/fix findings.
  No QUESTIONS opened (no token gaps this task).

## 2026-06-11 — W1-01 Foundation prerequisites + Button (branch design/W1-01-foundation-button)

Design loop Wave 1, first task. Implemented per docs/design/SPEC-foundation.md
§2/§3/§4.1 and docs/brand-tokens.md.

- **lucide-react** added to `packages/ui` as the single spec-approved Wave 1
  dependency (SPEC §3). Logged in QUESTIONS.md Q8 per the new-dependency rule.
  Resolved to v1.17.0 (React 19 peer; tree-shakeable per-icon).
- **Motion tokens** added to `theme.css`: `--duration-fast/base/slow`,
  `--ease-standard` (emits the `ease-standard` utility via the v4 `--ease-*`
  namespace), three token-consuming `duration-*` utilities (v4 has no
  `--duration-*` generator), and a global `prefers-reduced-motion` rule that
  collapses every transition/animation to 0ms (design principle 4).
- **Primary Button ships at `accent-2-700`, not the SPEC §4.1 table's
  `accent-2-600`.** White on accent-2-600 is ~3.3:1, below WCAG AA 4.5:1 for the
  12–16px label; accent-2-700 is ~4.8:1. SPEC §2/§5 mandate AA and the spec's
  own hard rule resolves conflicts in favor of AA/brand-tokens, so the primary
  steps 700/800/900 for fill/hover/active. Logged as QUESTIONS.md Q9
  (recommend correcting the §4.1 table).
- **Destructive hover/active darken via `brightness-90`/`brightness-75`** because
  the `error` semantic token has no numeric scale to step down to (no
  `error-600/700`). No off-document hex, no arbitrary value. Logged as
  QUESTIONS.md Q10 (recommend adding an error scale).
- **Loading preserves width:** with a leading icon the 20px spinner swaps in
  place of it (label stays); without one the content is held at `opacity-0` and a
  centered spinner overlays it. Sets `aria-busy`, blocks interaction (no greyed
  disabled styling).
- **Storybook:** new story titled `Components/Button`, kept separate from the
  pre-existing Storybook scaffold demo (`Example/Button`, imported by the demo
  `Header.tsx`), which was left untouched.
- **Gates:** lint, typecheck, test (incl. the @osteojp/ui token hex-guard),
  build (web, the consumer), and a Storybook build all green. design-reviewer
  and a11y-reviewer both returned PASS (run via general-purpose agents loading
  the `.claude/agents/*-reviewer.md` definitions, since those agent types are
  not registered as spawnable subagents in this harness).

## 2026-06-10 — Workflow setup session

- Added "Definition of done", "Backlog", "RLS verification", "Preview
  verification for PRs", "Human-only setup", and "Environment and secrets"
  sections to root CLAUDE.md.
- Replaced the "flag it and stop" rule for owner-confirmable scope with the
  log-to-QUESTIONS.md, block-ticket, continue protocol.
- Created root script `test:e2e` (`turbo run e2e`) and a turbo `e2e` task so
  the e2e gate is runnable from repo root. Previously only `apps/web` had an
  `e2e` script, so the drafted gate `pnpm test:e2e` did not exist.
- Verified all five gates exist and run: lint PASS, typecheck PASS, test PASS,
  build FAIL (missing Supabase env vars, see QUESTIONS.md Q1), test:e2e FAIL
  (same root cause). Failures pre-exist this change and are environmental.

## 2026-06-10 — Step 1 closeout session

- PR #156 found unmerged despite session precondition. Did not merge it
  autonomously (owner review action). Closeout branch merges the #156 branch
  so this work builds on it; merge #156 before or with this PR.
- Merged global ~/.claude/CLAUDE.md: operator profile sections restored
  alongside the loop protocol (outside the repo, no git).
- Q1 resolution attempted: apps/web linked to Vercel osteojp-platform, env
  pull executed, but development scope is empty and production secrets were
  not pulled locally (e2e mutates data). Q3 and Q4 opened.
- Q2 resolved: docs/SPEC.md created from mega-plan.md; mega-plan.md is now a
  pointer. SPEC is the single source of truth.
- Gates re-run: build still FAIL (portal only; web, admin, api build green),
  test:e2e still FAIL (missing E2E_* creds and seeded DB). Both purely
  environmental, no app code touched per session scope.

## 2026-06-10 — Q3/Q4 resolution session (Max)

- Q3 resolved: dev/e2e credentials will use a dedicated non-production Supabase
  project, never production. Dev Supabase project creation is a follow-up task
  for Ivan. Until then local e2e stays on CI's seeded DB workflow.
- Q4 resolved: osteojp-portal Vercel project created under Ivan_Bong_420's
  projects. Root: apps/portal. Node 22.x. Analytics off. Three NEXT_PUBLIC_*
  env vars added across all environments (non-sensitive). First production
  deployment confirmed green at osteojp-portal.vercel.app. Custom domain
  patient.osteojp.pt deferred to go-live.
- i18n copy tweaks shipped as PR #158 (two login page strings, PT + EN).
  Awaiting Ivan review and merge.

 docs/brand-voice
## 2026-06-11 — Brand voice guide extension session

- Task asked to author docs/brand-voice.md, but the guide already exists
  (PR #5, referenced by SPEC.md, sms-templates.md, and the 2026-06-03 i18n
  copy review). Extended it in place instead of replacing it, preserving all
  established decisions (você register, paciente, consulta/marcação split).
- Re-verified the voice evidence against the live osteojp.pt (homepage,
  osteopatia, fisioterapia, sobre-nos, contactos) on 2026-06-11; findings
  consistent with the original March 2026 scrape.
- New canonical terminology locked in §3.1: terapeuta (platform role label),
  fatura (never recibo/nota for invoices), "clínica de [localidade]" for
  locations, remarcar for rescheduling. "Utente" explicitly rejected for
  addressing patients (SNS/public-sector register; the site's own values copy
  leads with "paciente").
- New sections: §1 five-adjective voice summary, §2.8 staff-UI neutral
  imperative (no "por favor" in staff apps), §6 microcopy patterns (buttons,
  empty states, errors, confirmations, toasts, SMS, email) with PT+EN
  examples, §7 do/don't list. SMS pattern defers to sms-templates.md for the
  GSM-7/160-char constraint rather than duplicating it as a second source
  of truth.
- Docs-only diff; no code or packages/i18n strings touched.

docs/brand-tokens
## 2026-06-11 — Brand tokens rewrite (docs/brand-tokens.md, PR: docs/brand-tokens)

- docs/brand-tokens.md rewritten as the single source of truth for the UI
  redesign: 50-900 scales for primary grey-blue, accent-1 magenta, accent-2
  teal; neutral scale; light-mode surface tokens; semantic colors; type scale
  xs-4xl (Inter + Source Serif 4, latin-ext for pt-PT); radius/spacing/shadow
  scales; Heritage theme rules; ready-to-paste tailwind theme.extend block.
- Color bases kept from the prior doc's 300 DPI sample of
  Logotipo_OsteoJP_2023.pdf (#98B2C2 / #8B1863 / #45B9A7), matching CLAUDE.md,
  rather than the redesign brief's raster approximations. No vector logo asset
  exists in the repo; all three competing value sets are recorded in the doc's
  provenance table, pending verification against a vector source (Q6).
- Scales generated by constant-hue lightness ramps pinned at each base
  (primary@300, accent-1@700, accent-2@500), saturation tapered at the light
  end. Semantic colors and neutrals carried over unchanged from the prior doc
  so existing references (e.g. apps/web/lib/clinical/report/pdf.ts) stay valid.
- The duplicated brand-voice section was dropped from brand-tokens.md;
  docs/brand-voice.md remains the dedicated voice doc and is cross-linked.
- Heritage theme defaults to neutral per tenant; patient-facing enablement is
  owner-confirmable and logged as Q6. No code, config, or packages/ui changes
  in this PR (docs only).

migration-foundation
## 2026-06-11 — Migration pipeline foundation (branch migration-foundation)

- Built the source-agnostic Fisiozero → OsteoJP migration foundation in
  packages/db/src/migration: normalized intermediate types (MigrationPatient,
  MigrationAppointment, MigrationClinicalEpisode, MigrationClinicalRecord,
  MigrationAttachment) grounded 1:1 in schema.ts target columns; staging
  helpers; an idempotent importer; and a validation pass. No Fisiozero
  scraping, adapter, or field mapping was built (blocked on the CSV+ZIP export
  sample) — the seam is `interface FisiozeroSource` in src/migration/source.ts,
  TODO only.
- Idempotency design: target tables get NO source_id column. The new
  migration_staging_rows table (migration 0014, the only migration this wave,
  byte-mirrored to supabase/migrations) doubles as staging area and ledger:
  unique (tenant_id, source_system, entity_type, source_id) with
  imported_entity_id pointing at the created target row. Re-runs update (or,
  for clinical records, skip) instead of inserting — proven by a live-DB test
  that imports the same synthetic batch twice.
- Status machine on staged rows: pending → validated → imported, with failed
  + re-stage-to-pending. Transitions are guarded in SQL WHERE clauses; error
  details are structured and PII-free (codes + field names, never values).
- The importer runs ONLY through withTenantContext (authenticated role, RLS
  applies); tenant_id is still set explicitly on every insert. Patient dedupe
  delegates to the existing merge_patients() SQL function via a thin wrapper —
  not reimplemented.
- Cross-record references use source ids resolved through the ledger; refs to
  platform-owned rows (locations, practitioners, services) use resolver maps
  built per run. Free-text Fisiozero event-type → service mapping belongs to
  the future adapter, not the pipeline.
- migration_staging_rows has the standard tenant-isolation RLS policy + grant;
  covered by a dedicated RLS isolation suite. Both new DB-gated suites were
  added to .github/scripts/assert-rls-executed.mjs (now 8 hard-required
  suites) so they can never silently skip in CI.
- Opened Q5 (QUESTIONS.md): migrated records draft vs locked, and whether a
  dedicated `migrated` record_source value is wanted. Foundation supports
  both; decision needed before the first real batch.
- Gates: lint, typecheck, test (197/197 in packages/db incl. both new suites
  against a seeded local Supabase), build green for web/admin/api/db; portal
  build fails on the known pre-existing missing-env issue (Q1/Q3). supabase
  db reset applies 0000–0014 cleanly.

## 2026-06-11 — Fix main's red DB gate (branch fix/ai-ingestion-rls)

- Root cause of the DB-gate red streak on main: NOT a code change. Supabase
  CLI v2.106.0 (released 2026-06-11) stopped applying the platform's default
  Data API privileges on local start / db reset, so migration-created tables
  get no implicit grants for service_role. Our migrations explicitly grant
  `authenticated` (0003 + per-table) but never `service_role` — that role rode
  entirely on the default ACLs. The db-tests workflow installs the CLI with
  `version: latest`, so the first push run on 2026-06-11 (PR #158, i18n-only)
  picked up v2.106.0 and went red. Every commit in the red streak
  (#158–#164) is docs/i18n/CI-filter only; the introducing change is the
  upstream CLI release, not a repo commit. (The earlier "red since #162" note
  was off by four merges: #158's run at 12:44 UTC was the first failure;
  #157's at 23:00 UTC the previous day was the last green, on CLI v2.103.2.)
- Only one test asserts service_role CAN write (the sanctioned-bypass case in
  ai-ingestion-rls-isolation.test.ts); every other service_role assertion
  checks denials, which is why exactly 1/182 failed with `permission denied
  for table ai_ingestion_requests` (table gate fails before BYPASSRLS
  matters).
- Classification: neither a test defect nor an RLS/policy defect — a missing
  explicit GRANT exposed by upstream hardening. Production is unaffected: the
  existing project keeps grandfathered default privileges.
- Fix (no migration, per the migration-ownership boundary with PR #166):
  explicit service_role grants appended to supabase/seed.sql, which runs
  after ALL migrations on every reset/branch seed — restores prod parity on
  disposable DBs, no-op where default ACLs still apply, and also covers
  tables from future migrations (incl. #166's migration_staging_rows, whose
  suite has the same sanctioned-bypass test).
- Verified by simulation: revoking service_role's table grants locally
  reproduced the exact CI failure (5/6, same error); applying only the new
  seed grants restored 6/6; full reset + suite 182/182; skip-guard, lint,
  typecheck green.
- Follow-ups flagged (not done here, workflows are out of scope this wave):
  (1) move service_role grants into a migration (0015+, after #166 lands) per
  Supabase's recommended durable path, then drop the seed block; (2) consider
  pinning the Supabase CLI version in db-tests.yml — `latest` made the gate
  flip red with zero repo changes.

## 2026-06-11 — Brand token layer + Inter font wiring (feat/ui-design-tokens)

Owner-directed work: implement docs/brand-tokens.md as the canonical Tailwind
token layer in packages/ui, plus wire Inter as the default sans in apps/web.
Token layer + font only; no component restyling.

- **Tailwind version:** v4 (CSS-first). Tokens implemented as `@theme` CSS
  variables in `packages/ui/theme.css`, not a JS config. brand-tokens.md §7 is
  a v3-style block; values are the contract, mirrored as v4 `--color-*`,
  `--text-*`, `--radius-*`, `--spacing-*`, `--shadow-*`.
- **Full doc coverage:** primary / accent-1 / accent-2 50–900 scales (+ DEFAULT),
  neutral 50–900, bg/surface/surface-muted/border/border-strong, text-*,
  semantic colors with `-bg` variants, the xs–4xl type scale (with the doc's
  per-step line-heights and default weights), 4px spacing scale, radius scale
  (DEFAULT=6px), cool-tinted shadow scale, serif family, and the two brand
  gradients (as `@utility bg-gradient-*` since v4 has no background-image theme
  namespace).
- **Legacy type aliases retained:** existing screens use custom type utilities
  (`text-h1`…`text-display`, `text-body-sm`, `text-caption`) that are NOT in
  brand-tokens.md. Removing them would break rendering (guardrail: no component
  edits), so they are kept additively and flagged for migration to the xs–4xl
  scale in the redesign tickets.
- **Naming:** kebab-case per the doc (brand-teal, surface-muted, text-secondary,
  success-bg). Spacing extends Tailwind's numeric scale (space-1=4px), no
  default renames.
- **Font:** Geist → Inter via `next/font/google` in `apps/web/app/layout.tsx`,
  `subsets: ['latin','latin-ext']` (pt-PT diacritics), exposed as `--font-inter`
  and consumed by the `--font-sans` token. `apps/web/app/globals.css` repointed
  to Inter and the hardcoded `Arial` body font removed (font-only). font-mono
  left to the Tailwind default (Geist Mono dropped; 2 web call sites fall back
  to system mono). Other apps (admin/api/portal) keep Geist; out of scope here.
- **Test:** `packages/ui/src/tokens.test.ts` asserts theme.css contains the
  canonical hexes #45B9A7, #8B1863, #98B2C2, #1A2733 and rejects the superseded
  approximations. Added a node `unit` vitest project + `test` script so it runs
  under `pnpm test` without the Storybook browser stack.
- **Known visual delta (see QUESTIONS Q7):** the doc's radius and type scales
  reuse standard Tailwind utility names with shifted values, so in-scope web
  screens render slightly rounder (rounded 4→6, rounded-md/lg/xl shifted) and
  some headings carry the doc's default weights. This is the intended effect of
  installing canonical tokens; no component was edited.
- **Gates:** lint, typecheck, test, build all green. Full `pnpm build` requires
  `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` (CI-supplied; pre-existing portal
  prerender dependency, unrelated to this PR) — verified green with placeholder
  public values. e2e not run: no behavioral/flow change, not in this ticket's
  acceptance.

## 2026-06-11 — Lock canonical brand palette + repair brand-tokens conflict residue (branch docs/tokens-cleanup)

- **Canonical palette locked** to the values sampled from
  `Logotipo_OsteoJP_2023.pdf` at 300 DPI (confirmed true vector via PR #175):
  teal `#45B9A7`, magenta `#8B1863`, grey `#98B2C2`. The earlier approximations
  (`#3DAEB3` teal, `#8E2C7A` magenta) are superseded everywhere.
- **CLAUDE.md corrected:** the Brand section now lists the canonical hexes
  including grey `#98B2C2`, plus a line naming `Logotipo_OsteoJP_2023.pdf`
  (300 DPI, true vector) as the canonical source. (CLAUDE.md already carried the
  correct teal/magenta hexes; this adds the grey hex and the provenance line.)
- **brand-tokens.md repaired:** removed the orphaned git-conflict residue around
  §1.5/§1.6 — the stray label lines `docs/session-8-closeout` and ` main` left
  behind when the `<<<<<<<`/`=======`/`>>>>>>>` markers were stripped. Both
  content blocks kept: the "Canonical values confirmed" note and the
  "### 1.6 Neutral greys" header. File now greps clean for all three markers.
- **QUESTIONS Q6 item (a)** (vector logo existence) is resolved: the vector logo
  assets were added by PR #175. Q6 item (b) (heritage motifs on patient-facing
  surfaces) stays OPEN, pending JP sign-off — untouched here.
- Docs only (brand-tokens.md, CLAUDE.md, DECISIONS.md). No code. No gate impact.

## 2026-06-12 — Lock Wave 1 WCAG AA corrections into the token layer (branch fix/ui-aa-token-pass)

Resolves QUESTIONS Q8–Q13 — the AA decisions taken ad hoc during Wave 1 are now
canonical in the token layer, brand-tokens.md, and SPEC-foundation, so the spec
no longer contradicts shipped reality.

- **Q12 — single focus-ring token.** Added `--color-focus-ring: var(--color-accent-2-600)`
  to theme.css (brand-tokens.md §1.9). accent-2-600 ≈ 3.3:1 on white clears WCAG
  2.1 SC 1.4.11; accent-2-500 (~2.4:1) failed. Migrated every `ring-accent-2-500`
  in packages/ui to `ring-focus-ring` in one mechanical pass (11 components +
  control-skin + 2 stories). The input focus *border* stays `accent-2-500`
  (decorative emphasis, not the AA-critical indicator; SPEC §4.2 unchanged).
- **Q10 — error 50–900 scale.** Generated the same way as the brand scales
  (accent-2 lightness profile, error hue, gamut-safe chroma). `#B23A3A` is dark
  (OKLCH L≈0.52) so it pins at **700** (matching the doc's convention for dark
  saturated bases, e.g. accent-1 magenta at 700), not 500 as Q10 speculated.
  `--color-error` DEFAULT = error-700; destructive Button hover/active now use
  `error-800`/`error-900` (replacing interim `brightness-*`).
- **Q11 — AA-dark semantic text.** Added `success-700 #127B59` and
  `warning-700 #956302` (≥4.5:1 on their tints and white). StatusChip success/
  warning labels switched from the interim `text-primary` to the `-700` token;
  the 8px dot keeps the base tone (3:1 graphical-object).
- **Q9 — primary Button fill.** Corrected SPEC §4.1 + §2 to `accent-2-700` (fill)
  / 800 / 900; code already shipped this.
- **Q13 — portal bottom-nav.** Corrected SPEC §4.11 to active `accent-2-700` /
  inactive `text-secondary`; code already shipped this.
- **Q8 — lucide-react.** Recorded as the approved Wave 1 icon dependency in
  brand-tokens.md ("Approved runtime dependencies").
- **EmptyState heritage prop wired** to `<HeritageDivider variant="azulejo" />`
  (the deferred W1-09 follow-up; SPEC §4.10/§4.12). Decorative, aria-hidden,
  default off; stays off patient-facing portal until JP sign-off (Q6).
- All new hexes verified for monotonicity and WCAG contrast (sRGB + OKLCH math).
  Every value is documented in brand-tokens.md §1.8/§1.9/§7 + Appendix so the
  design-reviewer's "token-only" check passes.
- **Scope / out of scope:** diff is packages/ui + docs + QUESTIONS.md +
  DECISIONS.md only. `apps/web/components/app-shell.tsx` still hardcodes
  `ring-accent-2-500`; correcting it is a separate apps/ change (outside this
  PR's fence) — the app is slated to adopt the packages/ui AppShell. Follow-up
  noted under Q12.

## 2026-06-14 — Wave 2 staff-screens decisions (consolidated from PR bodies, W4-10)

The Wave 2 design-loop PRs (#195 W2-01 … #209 W2-08) recorded their decisions in
the PR bodies because `docs/DECISIONS.md` is outside the Wave 2 path allowlist.
Consolidated here so the log is the source of truth; per-PR detail remains in the
PR bodies.

- **Corrected focus ring on new surfaces (#195 W2-01).** Wave 2 composites
  (Combobox, DatePicker, TimeField, SlotPicker) adopt the corrected focus ring
  `ring-focus-ring` (= `accent-2-600`, brand-tokens §1.9). The pre-existing
  `control-skin` still carried the old `accent-2-500` ring and could not be
  modified in Wave 2 (no edits to existing `packages/ui` files), so the
  composites shipped a new skin. The AA-token pass later ratified `ring-focus-ring`
  as the single ring token.
- **PR-body logging convention.** Every Wave 2 PR (#196 Dashboard, #198 Agenda,
  #201 Appointment Drawer, #203 Patient profile, #207 Clinical record editor,
  #208 Invoicing) noted decisions and changed routes inline because the docs were
  out of allowlist. No behaviour/endpoint/permission changes were made; restyle
  + state-completeness only.
- **Deferred alias debt (#209 W2-08).** The `brand-teal` / `brand-magenta` /
  `brand-grey` aliases still used in non-Wave-2 screens (patients list, auth,
  login, admin, clinical episodes/review, BodyChart) are valid theme tokens, not
  raw-hex debt; migrating them to the semantic `accent-2` / `focus-ring` tokens
  was out of W2-08 scope and left as future debt — picked up by the Wave 4 fix
  wave (W4-02/W4-06/W4-11).

## 2026-06-14 — Wave 3 portal decisions (consolidated from PR bodies, W4-10)

Wave 3 portal PRs (#197 W3-01 … #206 W3-07) likewise logged decisions in PR
bodies (docs out of the Wave 3 allowlist). Notable non-question decisions:

- **Portal migrated to shared tokens + shell (#197 W3-01).** All hardcoded hex
  removed; PortalShell (top bar + 5-tab bottom bar) adopted; Inter + `lang="pt-PT"`;
  a11y hardening (visible focus, AA contrast, 44px targets, SR announcements).
- **Account edit uses the shared Drawer pattern (#205 W3-06).** Replaced the
  inline AccountEditForm. Sign-out added as a standard client
  `supabase.auth.signOut()` + redirect — UI calling the standard auth method, no
  auth/permission/RLS logic changed.
- **Portal API read wrappers (#206 W3-07).** `getMyDocuments`,
  `getDocumentDownloadUrl`, `getMyForms` added over existing `apps/api` endpoints
  — data fetching only.

Owner-confirmable items raised by Wave 3 are consolidated in QUESTIONS.md (same
date).

## 2026-06-16: OsteoJP v2 design system adopted (branch design/v2-spec-authoring)

The v2 design system is authored as a new spec set (SPEC-v2-foundation.md plus six
SPEC-v2-<screen>.md files) and supersedes the v1 visual specs for the staff app
(apps/web). The v1 specs (SPEC-foundation.md, SPEC-staff-screens.md) are kept for history
with a one-line supersede note at the top of each. brand-tokens.md keeps the logo palette
as the logo reference and is not edited; brand-voice.md is unchanged and still governs all
copy.

- **Direction adopted: premium healthcare dashboard.** Glassmorphism (iOS-26 style frosted
  glass), Scandinavian medical minimalism, and culturally personalized heritage (Portuguese
  azulejo plus Moldavian embroidery). Calm, trustworthy, premium, therapeutic. Rationale: the
  v1 clinical-restrained look read as functional but generic; the v2 direction differentiates
  the product and carries the "padrão ouro" positioning visually without warming the copy.
  Tenant scoping preserves licensing neutrality: the glass and sidebar are the product
  default for every tenant; the OsteoJP palette and heritage frame are the OsteoJP tenant
  theme only.

Three reversals from v1, each with rationale:

- **(a) Heritage scope widened.** v1 allowed heritage on auth screens and empty states only
  and forbade it on data screens. v2 makes it a persistent, restrained edge frame
  (HeritageFrame) on staff data screens too, capped in opacity and inset behind content. The
  clinical record editor stays exempt (no ornament behind clinical authoring, unchanged hard
  rule). Rationale: the frame at `restrained` density adds brand presence without harming
  legibility, and the AA/inset rules keep data screens readable.
- **(b) Folk colors now allowed.** v1 banned traditional folk red/black and recolored all
  motifs to the brand palette. v2 adopts Moldavian Burgundy (#A44B58) embroidery and
  Portuguese Blue (#5B8FD9) azulejo as part of the OsteoJP theme palette. Rationale: the
  heritage is the point of the OsteoJP theme; the burgundy and blue are muted, low-opacity,
  and tenant-scoped, so they never leak to other tenants.
- **(c) Palette is no longer logo-derived.** v1 generated all scales from the logo hexes
  (teal/magenta/grey). v2 adopts a new five-accent palette (Portuguese Blue, Moldavian
  Burgundy, Wellness Green, Soft Lavender, Warm Gold) for the OsteoJP theme, not derived from
  the logo. Adopted by Ivan with JP and owner sign-off. Rationale: the logo palette did not
  support the premium-wellness direction; the logo stays the logo reference in
  brand-tokens.md, while the product surface uses the new theme palette.

- **(d) Staff shell changes from top bar to sidebar.** The v1 64px top bar is replaced by a
  280px floating glass left sidebar AppShell across apps/web, with seven nav items (Início,
  Agenda, Pacientes, Fichas Clínicas, Marcações, Revisão, Administração; Relatórios and
  Definições intentionally omitted from v1), an active-item green glass state, and a
  top-right user-area cluster. This is the product default for all tenants. Rationale: a
  sidebar suits the seven-item information architecture and the dashboard density better than
  a top bar, and it is the standard shell for premium dashboard products.

## 2026-06-16 — Docs housekeeping: resolve merge residue in QUESTIONS.md and PLAN.md (branch design/v2-docs-housekeeping)

A prior session stripped the `<<<<<<<`/`=======`/`>>>>>>>` markers from two
files but left orphaned branch-label residue (the same failure mode already
recorded for brand-tokens.md). Cleaned here.

- **docs/QUESTIONS.md** — removed two stray `main` lines (after Q6's recommended
  default and after Q7) left behind by stripped `>>>>>>> main` markers. No
  question content changed; every logged question and resolution is intact.
- **docs/design/PLAN.md "V2 section waves"** — the list was a garbled 3-way
  merge: V2-W2..W5 appeared twice with conflicting checkboxes, plus residue
  lines `design/V2-W2-agenda`, `design/v2-w5`, and two ` main` lines. De-duped
  to one entry per wave. Duplicate entries were textually identical apart from
  the checkbox, so no unique content was dropped; every `per SPEC-v2-*`
  reference (including W7's `per SPEC-v2-marcacoes`) is preserved.
- **Checkboxes reconciled to CLI ground truth** (`gh pr list --state merged`),
  not the garbled file: V2-W0-01..05 (#237–241), V2-W1 (#244), V2-W2 (#245),
  V2-W3 (#242), V2-W4 (#246), V2-W5 (#243), V2-W6 (#251) all merged → ticked.
  V2-W7 left unticked: only the spec PR #248 (`[V2-W7-spec] Add
  SPEC-v2-marcacoes`) merged; the build wave has not started.
- Docs only (QUESTIONS.md, PLAN.md, DECISIONS.md). No code, no gate impact.
  Repo greps clean for all three conflict markers and for branch-label residue.

## 2026-06-16 — Remove temporary [HMAC-DIAG] ingestion diagnostics (branch chore-remove-hmac-diag)

PR #211 added a `logHmacVerificationFailure` helper that emitted one structured
`[HMAC-DIAG]` line per failed HMAC verification, to reconcile the AI partner's
signing against ours during the live handshake. That handshake is now proven (a
201 landed with a clean record), so the diagnostic layer is removed.

- **apps/web/lib/ingestion/hmac.ts** — deleted the `logHmacVerificationFailure`
  export, the `secretDiagnosticFingerprint` helper, and the now-unused
  `createHash` import. `verifyIngestionSignature` and `signIngestionBody` are
  byte-for-byte unchanged.
- **apps/web/app/api/v1/ingestion/clinical-records/route.ts** — removed the
  helper call on the `!verified.ok` branch and the `TODO(remove-after-live-test)`
  comment. The failed-verification path still returns `401 {"error":"unauthorized"}`,
  identical to before.
- Net removal (2 insertions, 76 deletions). Repo greps clean for `HMAC-DIAG`,
  `logHmacVerificationFailure`, `secretDiagnosticFingerprint`, and
  `remove-after-live-test`. Lint green, web typecheck green, all 10 hmac tests pass.

## 2026-06-18 — Fisiozero extractor: decouple as Tier-1 raw archiver (branch feat/fisiozero-raw-archiver)

The "Phase S scaffold + gated test" dispatch (live Playwright scrape of
app.fisiozero.pt feeding the `FisiozeroSource` seam and 0014 ledger) was stopped
and reported: it contradicts `packages/db/src/migration/source.ts` (seam is
deliberately unimplemented, confirmed source is CSV+ZIP, scraping/field-mapping
forbidden before a sample), the `migration_staging_status` enum (no
`extracted`/`verified`), the tenant-scoped/RLS shape of `migration_staging_rows`,
and the V1 scope line ("full historical archive migration" is out of V1). Seven
conflicts logged to QUESTIONS.md (C1–C7).

**Decision (owner, via dispatch guardrail):** build a **decoupled Tier-1 raw
archiver only**. Rationale: the time-sensitive, session-dependent part is getting
the raw bytes out of Fisiozero (GDPR data portability, clinic owns the data)
while a logged-in session can be captured. Normalization (Tier-2 → MigrationRecord)
and ledger writes are deferred until the raw shape is known from real captures, so
no guessed assumptions get baked into the import contract.

- **Scope of this branch:** a standalone tool that, per patient, drives the
  stateful Fisiozero session serially (set-active → ficha → episode/eval lists →
  per-episode detail → consultar_hist → per-patient XLS), scrapes attachment
  anchors from every ficha and episode page, downloads each via the authenticated
  cookie jar, and writes a Tier-1 raw archive: untransformed HTML, the XLS, every
  attachment binary, and a per-patient `manifest.json` with SHA-256 + byte count
  for every file.
- **Explicitly NOT in scope (deferred):** the `FisiozeroSource` implementation,
  any `MigrationRecord` mapping, and any write to `migration_staging_rows`. The
  seam and ledger are untouched.
- **Resumability/idempotency** uses the tool's OWN local checkpoint (SQLite),
  not the 0014 ledger. Re-runs skip patients already archived+manifested.
- **Auth:** session loaded from a Playwright storageState JSON at
  `FISIOZERO_STORAGE_STATE`. Claude never enters credentials; cookie values are
  never logged. A login redirect halts the run with a recapture message.
- **Serial only:** server holds "current patient" in session, so patient fetches
  are never concurrent.
- **Gated:** `--limit 8` for the first reviewed batch; full enumeration requires
  explicit owner go after manual review.
- **Placement:** standalone tool `tools/fisiozero-extractor`
  (`@osteojp/fisiozero-extractor`), added to the workspace via a new `tools/*`
  glob. Playwright pinned at the workspace 1.60.0. No new third-party vendor
  introduced (Playwright already in the workspace). See the canonical
  source-reality decision below (2026-06-18, "scraping Tier-1 raw, not CSV+ZIP").

## 2026-06-18 — Fisiozero migration source: scraping Tier-1 raw, not CSV+ZIP export

Recon (Phase R) established: app.fisiozero.pt has no JSON API and no free
bulk CSV+ZIP export. The only built-in export is a free per-patient XLS that
omits episodes and attachments. A bulk export exists only behind a paid
370 EUR action that also terminates the clinic's access.

Decision: the source.ts seam's assumed CSV+ZIP source does not exist.
Sanctioned path is to capture a Tier-1 raw archive now (full HTML per
sub-view, per-patient XLS, all attachments, per-patient manifest with
SHA-256 and byte counts) under clinic data ownership and GDPR portability,
while authorized access is open. Tier-2 normalization against the
FisiozeroSource seam, and any 0014 ledger writes, are DEFERRED until real
raw captures exist and the true raw shape is known. This supersedes the
"no scraping before a sample export" TODO in source.ts and the Phase 5
deprioritisation in migration-notes.md for the extraction step only.
Owner: Ivan. Scope note: this is the V1 historical migration, owner-confirmed.

### Implementation placement (same decision, build details)
- Tool location: `tools/fisiozero-extractor` (`@osteojp/fisiozero-extractor`),
  added to the pnpm workspace via a new `tools/*` glob. NOT in `packages/db`;
  imports nothing from the migration seam or ledger.
- Branch: `feat/fisiozero-raw-archiver`.
- Local checkpoint (append-only JSONL, states pending/done/absent/error) is the
  resume store, not `migration_staging_rows`.
- Playwright pinned at the workspace 1.60.0 override. No new third-party vendor.
- Gated to `--limit 8` for the first hand-reviewed batch; full enumeration of the
  ~7,964-record range waits for Ivan's explicit go.

## 2026-07-01 - Read-only therapist availability query (migration-free)
Built a tenant-scoped availability query returning per-day booked vs free
intervals for a therapist over a day or week, shared by the new-appointment
panel, the batch engine, and multi-therapist conflict reporting (build once,
consume three times). No schema change, no migration, no Supabase mirror.

Placement and shape:
- `apps/web/lib/scheduling/intervals.ts` - pure interval-set math (mergeIntervals,
  subtractIntervals) on half-open [start, end) instants, mirroring overlap.ts /
  availability.ts (no DB, no `server-only`, unit-testable). free = working
  windows minus booked.
- `apps/web/lib/scheduling/day-availability.ts` - `server-only`
  `getTherapistAvailability(ctx, {therapistId, from, to, locationId?})`, reads
  through `runScoped` (RLS), tenant_id from the verified JWT never from payload.
- Reused the existing `availability.ts` helpers (`lisbonWeekday`,
  `isWithinValidity`, `AvailabilityTemplate`) and `time.ts` UTC<->Lisbon bridge
  rather than re-deriving weekday/validity/timezone logic.

Confirmed column names (read-only recon): appointments start/end =
`starts_at`/`ends_at`; therapist FK = `practitioner_id` (appointments) and
`user_id` (availability_templates), both -> `users.id`.

Booked = status in {scheduled, confirmed, completed}; `cancelled` and `no_show`
excluded (do not block a slot), encoded as a NON_BLOCKING exclusion so it tracks
the appointment_status enum. Working windows come from active
`availability_templates` matched on weekday + validity window and converted from
Lisbon wall-clock `time` columns to UTC per day.

Gates: typecheck 0, lint 0, vitest 64 passed (16 new interval-math cases: overlap,
adjacency, full-day-free, fully-booked, empty template, split shifts, overhang
clipping), apps/web build 0. `git diff` touches no file under
packages/db/migrations/ or supabase/migrations/.

## 2026-07-01 - availability_templates dev seed (migration-free)
Added `packages/db/seed/availability-dev.ts` giving each seeded practitioner
realistic weekly working windows, closing the "no availability_templates seed"
gap flagged during the availability-query loop so `getTherapistAvailability`
returns non-empty working/free on dev (unblocks the availability-query consumer's
live verification).

Shape/decisions:
- 34 rows across USR_1..USR_5, deliberately varied so downstream verification hits
  multiple cases: USR_1 standard Mon–Fri two-shift (LAV); USR_2 split across two
  clinics (LAV two-shift + CB short single shift); USR_3 Mon–Fri off-the-hour
  two-shift (CB); USR_4 part-time single shift (MTN); USR_5 (admin who also
  practices) one shift per clinic. Location map mirrors appointments-dev.
- Per-practitioner counts: USR_1=10, USR_2=8, USR_3=10, USR_4=3, USR_5=3.
- Idempotent by construction: fixed `de000008-*` ids + `onConflictDoNothing`, with
  the `availability_templates_dedupe_uq` natural-key unique constraint as a second
  guard. Re-run inserts 0.
- Wired into the `seed:dev` chain after `dev-reference` (needs users+locations) and
  added the standalone `seed:availability:dev` script.
- Refactored the row builder (`SCHEDULES`/`buildRows`) to a pure export and gated
  the DB write behind a main-module check, so `tests/availability-dev-seed.test.ts`
  can assert the seed's shape (counts, unique ids, weekday/time CHECK invariants,
  tenant-scoping) in the normal `pnpm test` with no database. This makes the seed's
  correctness a CI-enforced gate rather than a one-off manual paste.

Gates: typecheck 0; packages/db vitest 51 passed / 223 gated-skipped (incl. 10 new
seed-shape assertions); prod-ref + missing-URL guards verified to fire; `git diff`
touches no file under packages/db/migrations/, supabase/migrations/, or
.github/workflows/.

## 2026-07-06 — W3-05 tenant settings home for server-side hashed secrets (branch w3-05-tenant-settings-home)

Verdict: **migration-free**. A suitable per-tenant settings home already exists —
`tenants.settings` (jsonb, `packages/db/src/schema.ts`) — so no migration 0032 was
authored (head stays 0031, 32/32 mirror parity).

Why it is safe for a server-only hashed secret:
- Tenant-scoped, fail-closed RLS: `tenants_tenant_isolation` (0001_rls) —
  `USING`/`WITH CHECK (id = jwt_tenant_id())`. A tenant can only read/write its own
  `tenants` row, so one tenant's secret is physically unreadable by another.
- Never client-exposed: the only client-facing read, `getTenantSettings`, PROJECTS
  just name/nif/contacts/config — it never returns the raw blob, so keys added under
  a `secrets` namespace stay server-side. Proven by a unit test asserting the view
  never contains the secret.
- Preserved across saves: `updateTenantSettings` read-merge-writes (`...existing`),
  so the `secrets` namespace survives unrelated settings edits.

Storage contract for W3-06 (appointment-hard-delete password):
- Location: `tenants.settings.secrets.appointmentDeletePasswordHash` (a HASH string,
  never plaintext).
- Write: `setTenantSecret(actor, "appointmentDeletePasswordHash", hash)` —
  `apps/web/lib/admin/tenant-secret.ts`, admin-gated (`settings:manage`), audited
  (key only, PII-free), read-merge-write.
- Read (verify): `getTenantSecret(actor, key)` — server-only, tenant-scoped by RLS,
  not capability-gated (opaque hash, compared server-side inside a gated action),
  never returned to the client.
- W3-06 owns the hashing/verification algorithm and the initial `1234` default.

Gates: web vitest +5 (tenant-secret: write/read/gate + projection-safety);
packages/db adds a db-gated RLS isolation test (`tenant-settings-secret-rls.test.ts`,
runs in db-tests.yml). `git diff` touches no file under packages/db/migrations/,
supabase/migrations/, or .github/workflows/.

## 2026-07-06 — W3-06 password-gated appointment hard-delete (branch w3-06-password-gated-appointment-delete)

Amends the never-hard-delete lock (STATE 2026-06-30 #2): appointments MAY now be
hard-deleted behind a password gate (owner ruling, DECISIONS 2026-07-05). Migration-free.

- **Password:** initial `1234`, changeable in Administração, stored HASHED (scrypt via
  node:crypto — no new vendor) as a tenant secret in the W3-05 home
  (`tenants.settings.secrets.appointmentDeletePasswordHash`). Verified server-side only
  (constant-time), never stored/checked/exposed client-side.
- **Gate:** admin-only — `settings:manage` (the Tenant-settings tier; reception/therapist,
  who hold `appointments:delete` for cancel, cannot hard-delete). Server-enforced.
- **Linked-records guard:** refuses if any `appointment_notes` (0026), `clinical_records`,
  or `invoices` reference the appointment (FK-blocking children; clinical_episodes has no
  direct appointment FK — covered transitively via clinical_records). pt-PT reason returned.
- **Delete discipline:** one tenant-scoped tx — child `analytics_events` (linked by
  entity_id, no FK) deleted first with RETURNING, then the appointment with RETURNING,
  then an `audit_log` `appointment.hard_delete` row (actor + PII-free snapshot: ids +
  ISO timestamps + enums only, never notes/name).
- **UI:** delete control in the edit drawer (admin-only, password prompt via a top-layer
  Dialog); password-change form in Administração.

Gates: web vitest +17 (secret-hash, delete-password, hard-delete action matrix, drawer
delete-control visibility); e2e for password-change + wrong/correct-password delete.
Tenant-scoped delete is covered by the existing cross-tenant appointments DELETE RLS test.
`git diff` touches no file under packages/db/migrations/, supabase/migrations/, or
.github/workflows/.

## 2026-07-06 — W3-09 dev therapists set to the real clinic schedule (branch w3-09-working-hours-real-schedule)

Guarded, idempotent live-DB data op on the shared dev Supabase project (synthetic
data, owner-authorized). NOT a migration, NOT app code — the committed artifact is
the guarded seed script `packages/db/seed/working-hours-real.ts` only.

Target (DECISIONS 2026-07-05): each of the 5 dev therapists (USR_1..5) has
availability_templates Mon–Fri 08:00–20:00 + Sat 09:00–13:00 at their PRIMARY
(first-assigned) location. Weekday convention confirmed vs schema + consumer:
0=Sun..6=Sat (JS getDay), so Sat=6.

Reconciliation (UPSERT + archive, NO hard delete — deletions are owner-confirmable):
- Upsert 30 target rows (stable ids `de000009-<seq>-<weekday>`, onConflictDoNothing).
- Archive (is_active=false) every OTHER row for those therapists, filtered on
  is_active=true so a re-run is a no-op.

Live-count evidence (credentials redacted; guard SEED_DEV_CONFIRM=<ref>):
- BEFORE: 34 templates for dev therapists, all active; Saturday (wd=6) = 0.
- AFTER (run 1): inserted=30, archived=34, deleted=0 → total=64, active=30,
  archived=34. Active per-weekday: wd1–5 = 5 each @08:00–20:00, wd6 = 5 @09:00–13:00.
- AFTER-RE-RUN (run 2): inserted=0, archived=0 → ZERO delta; state identical
  (total=64, active=30, archived=34). Idempotence proven (DECISIONS 2026-07-02).

Reconciliation: 34 (before) preserved as archived + 30 new target = 64 total; zero
deletions. `git diff` touches no file under apps/, packages/db/migrations/,
supabase/migrations/, or .github/workflows/.

## 2026-07-06 — W4-01 Equipa upgrade: zero-mapping primary, per-therapist Horários, password-gated therapist delete (branch w4-01-equipa-team-upgrade)

Three Equipa (/admin/staff) fixes from owner QA after Wave 03. Migration-free.

(a) **Zero-mapping primary service.** The "Serviço principal" dropdown now lists ALL
active tenant services (was: only the therapist's mapped services → "Sem serviços"
for a therapist with none, e.g. Catarina Vieira). setTherapistPrimaryService handles
every case with ONE delete+insert path (never UPDATE — 42501): zero mappings INSERTs
the first service; an unmapped active service is added and made primary; a mapped one
is re-designated. To make the chosen service the earliest-created (= primary, consumed
by W3-03's booking auto-fill) within a single tx, rows are re-inserted with
`clock_timestamp()` (advances within a tx; `now()`/`transaction_timestamp()` would tie
every row). All the therapist's existing services are preserved. Admin-only.

(b) **Per-therapist Horários entry point (link, not rebuild).** W2-12's
/admin/working-hours already does per-therapist CRUD; added a `?t=<therapistId>` filter
(focus the list + pre-select the create form) and a "Horários" link from each Equipa row.

(c) **Password-gated therapist delete (owner-requested 2026-07-06).** Reuses the W3-06
tenant delete password (Administração → Definições) + a linked-records guard: REFUSED
when the user has any appointment, clinical record/episode, clinical note, audit entry,
or analytics event — so an established therapist is never destroyed (deactivate instead);
only an activity-free account (e.g. a mistyped invite) is deletable. Owner-tier protected,
never self. Config rows (therapist_services, availability_templates, time_off) deleted
child-first (RETURNING), then the users row; clinical/audit data never touched.

LIVE-DATA note: verified against the E2E seed tenant only (a new fixture therapist "E2E
Terapeuta Sem Servicos" seeded with zero mappings); the shared DEV project's real
therapist accounts and availability were never modified or deleted.

Gates: web vitest 693 (+ primary-service rewrite tests, staff.delete tests); db 56.
e2e covers the zero-mapping set-primary + Nova marcação auto-fill + Horários link + the
password-gated delete (wrong pw refused, correct pw deletes an activity-free therapist).
`git diff` touches no packages/db/migrations, supabase/migrations, or .github/workflows.

## 2026-07-06 — W4-02 24h time-INPUT sweep: native inputs → 24h TimeField (branch w4-02-24h-picker-sweep)

Completes "24h everywhere, no AM/PM" (DECISIONS 2026-07-05) for time INPUTS. Migration-free.

Recon corrected the loop's premise: there is NO custom 12h/AM-PM picker in the code.
Every time input was a **native `<input type="time">`**, which stores a 24h value but
DISPLAYS in the browser/OS locale — so on a 12h-locale machine it renders the
`09 / 00 / AM-PM` scroll picker owner QA saw. Native inputs can't be forced to 24h.
`packages/ui/TimeField.tsx` was already a locale-independent 24h picker (two selects,
00–23 + minutes, no meridiem) but UNUSED (the drawer even called the swap "a follow-up").

Fix (owner-confirmed 2026-07-06 "swap ALL"): replace every native time input with the
24h TimeField. Value semantics unchanged (in/out is "HH:mm"; DB stays UTC). Mount sites:
- Nova marcação Hora + Agendar lote per-date (appointment-drawer) — controlled TimeField.
- batch failure rebook (batch-failure-dialog) — controlled TimeField.
- patient "schedule again" (appointments-list) — controlled TimeField.
- Horários create + edit start/end (working-hours) — via a new `TimeFieldInput` client
  wrapper that renders TimeField + a hidden `<input name>` so server-action forms still
  submit the 24h value (normalised to HH:mm).

Display was already 24h (W3-08, `formatTimeOfDay` + pt-PT Intl) — not regressed.

Gates: web vitest 693; packages/ui +3 (TimeField 24h render + no-meridiem + min/max);
e2e updated to drive the TimeField selects (new `fillTime` helper) across Nova marcação,
reschedule, Agendar-lote failure, NESA, and Horários. Post-change grep: zero
`type="time"` / meridiem in app+ui code. `git diff` touches no packages/db/migrations,
supabase/migrations, or .github/workflows.

## 2026-07-08 — Staff email edit synced to Supabase auth login (branch fix/staff-email-auth-sync)

Bug: `editStaff` (apps/web/lib/admin/staff.ts) updated only `public.users.email` and
left the Supabase auth login email stale — so an account created with a placeholder
email could not be corrected end-to-end (the person stayed locked to the old login
address). This blocked the "create-with-placeholder, fix-when-the-real-email-arrives"
flow.

Fix (migration-free, invite flow untouched):
- New `updateStaffAuthEmail(userId, email)` in apps/web/lib/auth/provision.ts — the
  auth half. Service-role admin API (`auth.admin.updateUserById`), `email_confirm: true`
  so an admin-initiated change takes effect immediately (no confirmation round-trip that
  would strand the user behind an address they may not control yet). Throws on failure —
  unlike `generateSetPasswordLink`, it MUST surface so the caller can abort. Keeps every
  `auth.admin` call in the one sanctioned module.
- `editStaff`: on an email change, write `public.users` FIRST inside the RLS transaction,
  then call `updateStaffAuthEmail` while that write is still UNCOMMITTED. Ordering is the
  consistency guarantee — `withTenantContext` wraps the callback in
  `getDb().transaction(...)`, so if the auth update throws the transaction rolls back and
  BOTH stores stay on the old email. A `(tenant_id, email)` collision is caught at the DB
  write (before auth is touched) and surfaces as the existing `email_taken` domain error.
  A name-only edit never touches auth.
- Audit: `staff.profile_update` now records old/new email MASKED (`maskEmail`, first 2
  local chars + domain) for an email change — auditable without persisting the full
  address (rule 7). Name-only edits keep the fields-only metadata.

Consistency edge (documented, accepted): if the auth update SUCCEEDS but the transaction
commit then fails in the tiny window after, auth is ahead of `public.users`. Chosen over
the reverse because the collision path — the common failure — is caught before auth is
touched, so the realistic failure modes all leave both stores consistent.

Gates: web vitest — new staff.edit.test.ts (email syncs both stores; auth failure leaves
public.users rolled back with no audit; tenant unique-collision → email_taken before auth;
name-only edit never touches auth; owner-tier; not_found; users:manage gate) + maskEmail
unit tests; lib/admin + lib/auth suites 120 passing. lint 0 errors, typecheck clean, web
build clean (portal build fails only on a missing local NEXT_PUBLIC_SUPABASE_URL for its
static /auth/activate export — env, not this change; portal imports none of these files).
`git diff` touches no packages/db/migrations, supabase/migrations, or .github/workflows,
and does not change the invite flow.

## 2026-07-11 — W5-26 EVA pain scale: Path A (component-side jsonb passthrough), no migration, no v4 seed

Ruling H (SPEC-ficha-medica AMENDMENTS 2026-07-11) requires a 0-10 EVA `intensity`
on Local da dor (`pain_location`) bodychart markers, stored on the marker object in the
record `data` jsonb.

Recon of the save path (read-only, before building):
- `saveRecordAction` (apps/web/app/clinical/[id]/actions.ts) parses the form `data` JSON
  verbatim and passes it unchanged to `updateRecordData`.
- `updateRecordData` (apps/web/lib/clinical/records.ts) writes the whole object to
  `clinicalRecords.data` (`.set({ data: recordData })`) — no key stripping — after
  `validateRecordData`.
- `validateRecordData` (apps/web/lib/clinical/form-template.ts) checks required-field
  PRESENCE only; it does NOT enforce `additionalProperties` and does NOT recurse into
  array items.

Decision: **Path A (preferred, most rule-5-safe).** `intensity` is written/read
component-side in `BodyChart.tsx` and rides through the jsonb column untouched. **No
template change, no `osteopathy-v4` seed, no DB migration** (Path B was not needed; v3
stays immutable, rule 5). `intensity` is additive and optional — only `pain_location`
markers carry it; the marker shape stays `{ marker_type, x, y, view (, intensity?) }`.

Evidence: `form-template.test.ts` pins that `validateRecordData` accepts a marker carrying
`intensity` (and a scale-less one), and never injects `intensity` on other types;
`BodyChartEva.test.tsx` pins display + optional + signed-read-only; `clinical.spec.ts` E2E
pins place-select-reload persistence. Migration-free proof: `git diff` touches no
`packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`, and does not edit
`osteopathy-v3.json`.

## 2026-07-15 — W8-02 staff phone + job title: two nullable columns on users, migration 0036 (branch osteojp-w8-02-staff-phone-job-title)

Wave 08 Dados e KPI, first loop (runs before W8-01a; it unblocks the owner's
manual staff-data entry). Adds a staff contact phone and a professional job
title, both surfaced in Administracao > Equipa; both ship EMPTY (nullable), the
owner fills them by hand after merge.

Recon (against origin/main at 86ebcfd): confirmed `users` (`packages/db/src/schema.ts:190-213`)
had no phone and no job_title column; next migration number is 0036 (0035 latest
in both migration dirs); the edit seam is `editStaff`/`editStaffAction`/`StaffManageModal`;
the `admin.staff.*` i18n namespace exists. No column-scoped GRANT on `users` (only
a table-level `GRANT SELECT` + tenant-isolation RLS + anon REVOKE), so additive
nullable columns need no policy/grant change.

Decisions:
- **Migration 0036 (both migration dirs + journal, snapshot-free).** Two NULLABLE
  text columns on `users` — `phone`, `job_title` — via `ADD COLUMN IF NOT EXISTS`,
  no default, no backfill, no NOT NULL. RLS untouched (columns ride the existing
  `users_tenant_isolation` policy). The repo dropped per-migration drizzle
  snapshots after 0014; the convention since is a `meta/_journal.json` entry plus
  the byte-exact `supabase/migrations/` mirror (`scripts/sync-supabase-migrations.mjs`).
  Followed that convention; `check-journal.mjs` + the supabase sync `--check` both
  pass (37/37).
- **`job_title` is a DISPLAY field, decoupled from the permission role.** It is a
  free-text professional title (Fisioterapeuta, Osteopata, Recepcionista, ...),
  orthogonal to `roleId`/`roles.slug`/`packages/auth` ROLES. `editStaff` never
  writes `roleId`, so a title change can never alter capabilities. Locked by a
  unit test asserting the persisted write has no `roleId`/`role_id` key.
- **Phone is PII (rule 7).** The value is never logged; the audit `staff.profile_update`
  row records only the changed FIELD NAMES (`phone`, `job_title`) via the existing
  `fields` metadata, never the number. A unit test asserts the number never appears
  in audit metadata.
- **Both optional, blank -> NULL.** `normalizeOptionalText` trims and maps blank to
  null; `normalizeStaffProfile` extended to carry phone + jobTitle (name/email
  validation unchanged). Money/format: no phone-format validation (owner enters
  international numbers by hand).
- **UI:** phone + job title are editable in the same Gerir edit form (one
  `editStaffAction` submit); the Equipa list gains a Telefone column and renders
  the job title beneath the role label. Empty when null.

Evidence: schema diff (both columns nullable, no default); local `supabase migration up`
applied 0036 — `information_schema` shows `phone`/`job_title` `text`, `is_nullable=YES`;
empty-by-design query = 15 users, 0 non-null phone, 0 non-null job_title (no backfill);
RLS still enabled on `users`. Gates: lint 0 errors, typecheck 9/9, unit web 1118 passed,
packages/db RLS isolation 348 passed against local DB (DATABASE_URL set), build 4/4 apps,
E2E `staff-contact-fields.spec.ts` green (invite a disposable member, edit phone + job
title in Gerir, both persist across reload, role unchanged). Migration-safe: additive
nullable, `git diff` touches no `.github/workflows/`.

Merge: **OWNER-MERGE (migration loop).** GREEN pushes + pastes evidence + HALTs; the
owner merges. Post-merge the 0036 live-apply to production (drizzle-kit +
DATABASE_URL_DIRECT) is verified with a pasted query before DONE. GREEN never
self-merges a migration loop and never writes to the production DB pre-merge.

 osteojp-w8-01a-services-catalog-packs
## 2026-07-15 — W8-01a pack model (0037) + catalog seed: decisions (branch osteojp-w8-01a-services-catalog-packs)

Wave 08 Dados e KPI, second loop (after W8-02's 0036 merged + applied live). Net-new pack
model + the offered-only-where-priced semantic + the owner's real LV+CB catalog seed.

- **MANUAL no-show / under-24h enforcement (business rule on record).** A pack/group session
  counts as CONSUMED on a no-show or a cancellation under 24h. The platform NEVER auto-charges
  and NEVER auto-decrements on cancellation — staff enforce it via the manual adjust control
  (W8-01c). `patient_pack_instances.sessions_remaining` is decremented at BOOKING (W8-01c) and
  adjusted (consume/restore) manually, audited, never as a charge. Encoded here only as schema
  that supports a monotonic remaining count + a manual adjust trail; the logic is W8-01c.
- **Migration 0037 = two additive domain tables, non-destructive.** `service_packs`
  (definitions) + `patient_pack_instances` (per-patient purchases), each tenant_id + tenant
  isolation RLS + grants + a DB-gated isolation test (`packages/db/tests/pack-model-rls.test.ts`,
  9 assertions incl. offered-tracks-price + rename-preserves-serviceId). `services.price_cents`
  and `service_location_prices` are UNTOUCHED (a destructive price_cents change would be a
  Field-6 owner HALT). Snapshot-free journal convention (post-0014) + byte-exact supabase mirror.
- **"Offered only where priced" is DERIVED, not a new column.** `isServiceOfferedAtLocation` /
  `listServiceOfferings` (`apps/web/lib/admin/services.ts`) read the PRESENCE of an active
  `service_location_prices` row. Canonical service rows seed with `price_cents = NULL` (the base
  is a fallback amount, never an "offered everywhere" signal); every price lives in a location
  row. So a service surfaces at a location iff it has an active price there.
- **Conservative canonicalization for the seed.** Each distinct listed name is its own service
  row; only "Fisioterapia" (identical at both locations) is one row offered at both (LV 55.00 /
  CB 45.00). Plausible cross-location merges (Osteopatia/Posturologia, NESA, Pressoterapia) are
  NOT presumed — QUESTIONS.md 2026-07-15, owner confirms at the CATALOG OWNER CONFIRMATION.
- **Rename-not-recreate for the LIVE reconcile (post-confirmation).** Canonical service renames
  are UPDATEs of `services.name`; historic `appointments.service_id` references stay intact
  (DB-gated proof). "campo 9 - Externos" is DROPPED (placeholder, unreferenced); R.P.G. migrates
  as a REAL service (LV 60.00). The cloud write reconciles by rename, never delete-recreate.
- **Local dry-run counts (127.0.0.1):** 22 canonical services, 23 service_location_prices
  (offers), 14 pack definitions. Matches the loop catalog (12 LV + 11 CB distinct, Fisioterapia
  shared; 8 LV + 6 CB packs).
- **Merge policy:** OWNER-MERGE (migration loop 0037) + CATALOG OWNER CONFIRMATION HALT before
  any cloud write. The 0037 prod apply + cloud seed follow the SAME manual drizzle-kit path
  (DATABASE_URL_DIRECT from packages/db/.env, session 5432) as 0036 — NO workflow, NO Actions
  secret (owner ruling 2026-07-15) — after owner merge + catalog confirmation.

## 2026-07-15 — W8-02 0036 applied to production (manual drizzle-kit, sanctioned path) — W8-02 DONE

Owner HALT ruling (2026-07-15): the `PROD_DATABASE_URL_DIRECT` Actions secret is REFUSED;
workflow-based prod apply (`prod-migrate.yml`) is NOT sanctioned. Migration apply is MANUAL
via drizzle-kit using `DATABASE_URL_DIRECT` from `packages/db/.env` (Supabase session pooler
5432), exactly as done for 0033-0035. Recorded so the executor never routes a prod migration
through the workflow or an Actions secret again this wave.

Provenance accounting (owner-requested): `prod-migrate.yml` was introduced in `a56a2e7`
(PR #165, 2026-06-11) — predates Wave 08; no Wave 08 branch touched it; W8-02 (#585) touched
zero workflow files. Left as-is for the owner to rule on separately. #585 mergedBy =
happygamer1919-tech (owner); GREEN issued no merge command (no self-merge).

Apply + live verification (2026-07-15T19:33:13Z): from main @c167874 (has 0036, NOT 0037 —
one migration in flight), `cd packages/db` + `drizzle-kit migrate` with DATABASE_URL_DIRECT
sourced from `packages/db/.env` (credential never printed). drizzle journal on prod =
37 applied migrations. `information_schema` on prod: `users.phone` + `users.job_title` both
`text`, nullable, no default; empty-by-design = 19 users, 0 non-null phone, 0 non-null
job_title (no backfill). **W8-02 flipped DONE.** 0037 (W8-01a) stays local-only until now;
its prod apply follows the SAME manual path after owner merge + catalog confirmation.
 main

## 2026-07-15 — W8-01a cloud catalog seed applied (Option A amended) — W8-01a DONE

Owner ruled the step-3 reconcile HALT as Option A amended: reconcile the 3 clean rows, insert
net-new + prices + packs, DEACTIVATE the 3 ambiguous legacy rows (never rename/reprice/delete/
map), interim service count of 25 explicitly accepted.

0037 applied to prod via manual drizzle-kit (session 5432, packages/db/.env, credential never
printed); prod journal = 38; service_packs + patient_pack_instances live with RLS enabled +
tenant-isolation policies + all check constraints. The single authorized cloud catalog write
ran as ONE atomic transaction (assertions roll back on any count miss). Reconciliation log:
- RENAME "1ª Avaliação" -> "1.ª consulta / Avaliação (…)" (LV 75.00).
- KEEP "Osteopatia" (LV 70.00) + "Fisioterapia" (LV 55.00 / CB 45.00) on existing rows —
  marcação references INTACT (verified: still referenced post-seed), never delete-recreate.
- INSERT 19 net-new canonical services; 23 service_location_prices; 14 service_packs.
- DEACTIVATE (frozen, name/price unchanged) "Pilates Terapêutico" 40.00, "NESA" 39.00,
  "Massagem Terapêutica" 50.00 — pending JP batch (QUESTIONS 2026-07-15).
Post-commit verified: active(canonical)=22 / prices=23 / packs=14 / frozen=3 / total=25.
Cloud DB is read-only again; this was the single authorized cloud data write of Wave 08.

## 2026-07-21 — W11-00 cartoes-nome-apenas-v2: DIAGNOSIS A (stale production deploy), no source change

Diagnosis-first loop (OWNER VISUAL GATE). The owner reported the agenda card face
still showing icon/time/therapist/service at overlap in production, in INCOGNITO,
after #618 (`75c56a1`, W10-05b) made the face name-only.

Finding (read off Vercel, not assumed): osteojp-platform Production
(`app.osteojp.pt` -> `dpl_8rjBarztYU2EUihWrxUbg1abGH2k`, target production, READY,
`fra1`) serves `githubCommitSha 479cb47` = #617, two merges behind `main`. #618
`75c56a1` merged to `main` at 17:07:38Z but produced ZERO Production deployment of
any state; the newest Production-target deploy is #617 @ 15:48:39Z. Every `main`
merge auto-deployed through #617, then Production auto-deploy stopped. So the owner
hits a Production SERVER running the pre-#618 W10-05 detailed face; incognito could
not help (it clears client cache, not what the server serves), which also
eliminates the stale-client-bundle hypothesis (B).

Decision: this is DIAGNOSIS A (stale deploy), a deploy/pipeline finding, NOT a code
defect. Per the loop policy for A, NO card-source change was made - the source on
`origin/main` is already name-only (one `AppointmentBlock`, both Dia + Semana route
through it; grep confirmed no second card-face renderer). Resolution is an OWNER
redeploy of Production to post-#618 `main`. Because auto-deploy stopped after #617
(not a one-off), Q-W11-00-1 is filed for the owner to confirm the pipeline, not
just redeploy once.

Tests HARDENED regardless (loop step 6, mandatory): the #618-era unit assertions
(`toContain(therapistName)` / `toContain(CONFIRM_LABEL)`) passed only via the HOVER
markup; they are now FACE-SCOPED (the button carrying `agenda-card-patient`,
excluding the `agenda-card-hover` sibling) and assert the ABSENCE of
time/service/therapist-name/icon/confirmation text on the face, name present +
wrapping, in single + cancelled + 3-overlap; the E2E 3-overlap now runs BOTH Dia
and Semana at 1/3 width with a per-view screenshot. Negative control: injecting a
detail row onto the face fails the new assertions; reverting is green. Migration-
free, hover + Marcacoes untouched, no i18n, no new hex. GREEN pushed + HALTED at
the owner visual gate; NOT self-merged.

 osteojp-w11-01-recon-split-plan
## 2026-07-21 — W11-01 recon + SPLIT PLAN v1 (read-only; production-split ground truth)

Read-only recon of the live Supabase project `jaxmkwoxjcgzkwxgbayx` (PostgreSQL 17.6,
eu-central-1 / Frankfurt). No DB write, no dashboard mutation, no secret values, no PII;
live reads ran in one `SET TRANSACTION READ ONLY` transaction (counts + object metadata).
Output: `docs/recon/W11-01-split-plan.md` ending in SPLIT PLAN v1.

Findings: mirror parity HOLDS (supabase/migrations = drizzle source + provenance header,
byte-identical after the header; journal-sync 38<->38); schema head `0037`; no live
security/privacy exposure (clinical-attachments bucket PRIVATE, RLS enabled on all 28
domain tables, immutability trigger `clinical_records_enforce_immutability` ENABLED
`tgenabled='O'`, auth hook `custom_access_token_hook` present). Live extensions: pg_trgm,
pgcrypto, uuid-ossp, supabase_vault, pg_stat_statements, plpgsql - W11-02 enables the full
set before applying migrations (only pg_trgm is migration-created). RLS: 50 live policies
vs 51 CREATE POLICY in migrations - a W11-02 reconcile/verify item (migrations are the
source of truth). Live footprint captured (patients 7 = 6 soft-deleted + 1 active;
clinical_records 29 = 24 draft + 5 signed; audit_log 674; catalog services 19 /
prices 28 / packs 14; users 19).

Decisions/questions: Q-W11-01-1 RULED by owner - the signed immutable residue island +
soft-deleted patients STAY BEHIND on the frozen old project; new prod starts clean (the
governing W11-03 partition rule). Q-W11-01-2 OPEN - audit_log/analytics_events start fresh
on new prod (recommended default), owner rules at W11-03. SPLIT PLAN v1 defines the W11-02
provisioning checklist, the W11-03 freeze-window runbook (expected counts + HALT-on-
mismatch identical to W10-02 + Preview-smoke-before-repoint + CYAN checkpoints), the W11-04
repoint checklist, and the rollback story (old project READ-ONLY-then-FROZEN, 30-day
retention). W11-01 is OWNER-MERGE (docs-only, no code/migration/DB-write/dashboard change).

## 2026-07-21 (evening) — W11-00 v3 SUPERSEDES v2: agenda names as a vertical list (Fisiozero), not cards

Owner ruling (2026-07-21 evening). v2 (name-only cards, #620) is merged, deployed,
and owner-confirmed. The REMAINING defect is the LAYOUT MODEL; v3 supersedes the v2
definition of done in the loop file. Per the ruling the loop file is NOT edited by
GREEN (owner-merge surface) - it keeps the merged Field 8; the superseding ruling
is recorded verbatim in the v3 PR and the deltas are flagged for YELLOW at wave
close-out.

v3 target (reference: Fisiozero weekly view): an appointment is NOT a card. It is
ONE line - the patient full name, coloured in the assigned therapist hue - and
nothing else on the grid face. Implemented (display layer, both Dia + Semana):
- `agenda-grid.tsx`: removed the card renderer (`AppointmentBlock`), the horizontal
  overlap-split (`layoutOverlaps` / per-column widths), the service tint
  (`serviceAccent`/`SERVICE_TINT`), the conflict-ring machinery
  (`conflictingIds`/`sameRoom`/`intervalsOverlap`), and the service-colour legend.
  Added `groupByStart` + an `AppointmentName` line component. Same-start-slot
  appointments stack VERTICALLY (one name per line, full column width, alphabetical
  within a slot); no side-by-side splitting. Start-row position math UNCHANGED (the
  known 9:00-on-9:30 defect is neither fixed nor worsened; Wave 12).
- `therapist-color.ts`: added a `text` utility (`text-*-700`) beside the existing
  `fill` (`bg-*-700`) - SAME token, no new palette, no new hex; AA on the light grid.
- Cancelled name = line-through (never a non-cancelled one). The W10-05 hover popup
  is UNCHANGED on both Agenda views + Marcacoes and stays the sole detail carrier.

Deltas flagged for YELLOW (consequences of the model change):
1. The SERVICE-colour legend + tint are removed (colour now encodes THERAPIST, not
   service). No therapist legend added (the name text is the authoritative cue).
2. The conflict RING is removed (no card box to ring); conflicts read as two names
   stacked at the same slot. Booking still excludes conflicts (W5-12), unchanged.
3. Unused agenda i18n keys (`agenda.legend`, `agenda.serviceOther`,
   `agenda.serviceMassagem*`, etc.) left in place; dead-key cleanup is a YELLOW
   follow-up (removing keys touches both i18n files; Marcacoes keeps its own labels).

Tests rewritten (name-only line, therapist TEXT colour, no bg/stripe/dot/tint/icon,
cancelled strike, same-slot vertical stack + no horizontal-split width, alphabetical
order; E2E adds the (9b) equal-left-x / strictly-different-y proof in BOTH views +
per-view screenshot). `therapist-color.test.ts` green. Negative control: a `bg-`
tint on the face fails the chrome guard. Migration-free, no new hex, hover +
Marcacoes untouched. OWNER VISUAL GATE, not self-merged.
 main

## 2026-07-22 - W11 rulings: named exclusion set (SPLIT PLAN v2), Q-W11-01-2 fresh audit, board collapse

Owner rulings 2026-07-22, finalizing the W11-03 migration scope and folding in CYAN
cycle-2 findings. (Follow-up to the merged #620/#621/#622.)

1. **Exclusion set FINAL (SPLIT PLAN v2, extends Q-W11-01-1).** MIGRACAO plan v2 EXCLUDES
   patient_number {94, 108, 109, 118, 119, 120, 121, 122} and their ENTIRE data trees, via
   BOTH FK paths (patient_id AND clinical_record_id of excluded records). NO cloud
   deletions, NO new deletion feature this wave - the exclusion set is the mechanism;
   nothing is destroyed; the immutability trigger is never touched. Verified read-only
   2026-07-22: the island HALT-check PASSED (the 5 signed immutable records belong to
   exactly #94/#108/#109/#118); #122 (duplicate re-entry of #109) ruled EXCLUDED after the
   safety-rule HALT. Active patients = 0 - owner attests (with staff confirmation) no real
   patient needs to travel, so new prod migrates OPERATIONAL CONFIG ONLY (users 19, roles 4,
   tenants 1, locations 2, services 19, service_location_prices 28, service_packs 14,
   therapist_services 4, availability_templates 13, form_templates 8, time_off 3); every
   patient-linked table migrates 0 rows. W11-03 pre-flight re-enumerates ALL soft-deleted
   patients (any not on the list HALTs) and re-verifies quiescence from the 2026-07-22
   #122 write forward (any new write HALTs).

2. **Q-W11-01-2 RULED:** audit_log (674) + analytics_events (8) START FRESH on new prod;
   the frozen old project retains the full history.

3. **Wave 12 registered (Q-W12-DEL-1, BLOCKED):** password-gated deletion of notes +
   documents from a patient record (lawful hard delete), gated on the lawyer's
   retention-prazo answer + JP approval. Not built in Wave 11.

4. **Board collapse (CYAN cycle-2):** the Wave 11 queue rows for W11-00 and W11-01 are
   collapsed to single DONE rows - W11-00 DONE (#620 diagnosis/v2 + #621 v3 layout),
   W11-01 DONE (#622) - dropping the stale v2 "DIAGNOSIS A" narrative and the OPEN/v2/v3
   duplicate descriptions. W11-02..05 stay OPEN.

W11-02 (provisioning) is next: after this addendum merges, GREEN delivers the W11-02
click-by-click provisioning instruction set and HALTs for the owner to execute.

## 2026-07-22 - W11-02 provisioning verified (new project dfotoodqvmjhbdcxyaxf, empty schema clone at 0037)

Owner performed the dashboard steps; GREEN executed the DB-reachable steps (delegated
2026-07-22) against the NEW project only, old project untouched (zero writes).

DB-side (all PASS): sanity guard (not-old + is-expected ref + empty); extensions (pg_trgm
enabled, full set present); pnpm db:migrate to head 0037 (drizzle count=38) + db:check
clean; immutability trigger ENABLED (tgenabled=O); record_annulments + audit_log
append-only ({INSERT,SELECT}); auth-hook FUNCTION present; claim-flow isolation probe
tenant A=1 / tenant B=0 (rolled back, zero residue); RLS 28 tables / 0 force-off / 50
policies (== old; 50-vs-51 reconciled - migrations net to 50); all 28 domain tables EMPTY.
Storage: bucket clinical-attachments private + empty; storage.objects RLS on; ZERO custom
storage policies on BOTH old and new (signed-URL-only model - nothing to replicate).
Benign migrate WARNING "no privileges were granted for auth/jwt" flagged for owner review
(schema check clean, isolation proven). Evidence: docs/recon/W11-02-provisioning-evidence.md.

Dashboard (owner-attested): Frankfurt Pro; data-prefs OFF; auth-hook REGISTERED
(custom_access_token_hook); auth config + templates 4/4 + SMTP (Resend EU, key from vault)
mirrored; 5 Supabase-scoped values present (legacy anon + service_role). Real-JWT hook
confirmation deferred to the W11-03 Preview smoke.

Security: a prior malformed credential paste leaked the DB password once in session output
(driver Invalid-URL throw); scripts hardened to redact; owner advised to rotate the new
project's DB password. Credential never committed; referenced as <NEW_DIRECT>.

Also drafted MIGRACAO plan v1 (docs/recon/W11-03-migracao-plan-v1.md) - the W11-03
freeze-window runbook: migrates operational config ONLY (11 tables, parents-before-children,
per-table count assertions, HALT-on-mismatch), 0 patient-linked rows, 0 storage objects
(all residue stays behind), audit/analytics fresh; safety re-enumeration + quiescence guard;
Preview smoke before repoint. Authorization phrase: AUTORIZO MIGRACAO plan v1 (MIGRACAO plan
versioned independently from SPLIT PLAN v2). W11-02 is OWNER-MERGE.

## 2026-07-22 (evening) — W11-03 owner ruling: authorized OLD hard-deletes + MIGRACAO plan v2 re-baseline

Ruling of record: `osteojp-mailbox/rulings/OWNER-RULING-20260722-old-hard-deletes.md`
(committed to main by the owner account via #625 — the direct owner commit is the signature).
Supersedes the earlier "NO cloud deletions, nothing is destroyed" posture **for exactly five
rows and nothing else.**

- **Deliberate owner cleanup on OLD (`jaxmkwoxjcgzkwxgbayx`), via the Supabase dashboard.**
  Five hard-deletes, verified live against the audit log as an EXACT match to the ruling (no
  extra row): 20:20:58Z patient #123 (12b0704d), 20:21:14Z appointment 3d82fe24, 20:21:27Z
  appointment 883e8eef, 20:22:11Z patient #122 (9aa565ec), 20:22:20Z patient #120 (065b8add).
- **Identity correction.** Actor `48a34faa` is the OWNER account (per the ruling), not staff.
  Any prior file labeling it staff (incl. `GREEN-ESCALATION-W10-02-plan-v2-drift`) is stale and
  superseded. Reasoning: the owner attested the account is his; the immutability trigger was
  never defeated and the signed island was untouched, consistent with owner-scoped cleanup.
- **Scope of the override.** ONLY the five rows above. The immutability island (patients
  {94,108,109,118}, five signed records) is untouched — verified present, trigger
  `clinical_records_enforce_immutability` still ENABLED (tgenabled=O). The append-only
  audit_log/record_annulments model stands.
- **Quiescence re-anchored** to `2026-07-22T20:22:20.097Z` (the last owner write). Verified:
  `max(audit_log.created_at)` = the anchor event; zero writes after it; all table
  max-timestamps pre-anchor. Any write on OLD after the anchor HALTs W11-03.
- **Exclusion set v1 → v2:** `{94,108,109,118,119,120,121,122}` → `{94,108,109,118,119,121}`
  (#120/#122 physically gone; #123 never in any set). Verified: live soft-deleted set equals v2
  exactly; active patients = 0; every patient-linked table `would_migrate = 0` via BOTH FK
  paths (patient_id AND clinical_record_id).
- **MIGRACAO plan v1 is SUPERSEDED and must never be authorized.** Re-baseline runbook:
  `docs/recon/W11-03-migracao-plan-v2.md`. Authorization phrase is now
  `AUTORIZO MIGRACAO plan v2` (v1's phrase is dead). Same structure: operational config only
  (11 tables, parents-before-children, per-table count assertions, HALT-on-mismatch, atomic on
  NEW), 0 patient rows, 0 storage objects, audit/analytics fresh, Preview smoke before repoint.
- **Evidence reconcile (W11-02).** CYAN observed 29 tables with `relrowsecurity`; GREEN reported
  28. The delta is `storage.objects`: GREEN counted the `public` schema (28 app tables); CYAN's
  29 = those 28 + the Supabase-managed `storage.objects` (RLS on, part of the private-bucket /
  signed-URL model). Both correct at their scope; no gap. Noted inline in the W11-02 evidence doc.

## 2026-07-22 (evening) — W11-03 MIGRACAO plan v2 EXECUTED (config copy OLD → NEW)

Gate complete: `AUTORIZO MIGRACAO plan v2` + plan v2 on main (#626) + CYAN-before CLEAN on main
(#627) + OLD frozen/quiescent. GREEN executed the config copy per
`docs/recon/W11-03-migracao-plan-v2.md`.

- **Copied 11 operational config tables, 115 rows total** (tenants 1, roles 4, locations 2,
  users 19, services 19, service_location_prices 28, service_packs 14, therapist_services 4,
  availability_templates 13, form_templates 8, time_off 3), OLD `jaxmkwoxjcgzkwxgbayx` →
  NEW `dfotoodqvmjhbdcxyaxf`.
- **Method:** single atomic transaction on NEW, `session_replication_role=replica` (no
  audit/trigger side-effects), parents-before-children, per-table `source==target==plan-expected`
  assertion + row-by-row column-level fidelity check (jsonb included). Verified end-to-end via a
  full dry-run (rolled back) before committing. OLD read-only throughout; zero writes to OLD.
- **Zero patient data migrated:** every patient-linked table + audit_log + analytics_events = 0 on
  NEW (fresh), confirmed pre- and post-commit. Immutability trigger ENABLED on NEW; head 0037.
- **Post-commit verify (independent, read-only):** NEW counts exact, all zero-tables 0, jsonb
  intact; OLD untouched (anchor still 2026-07-22T20:22:20.097694Z, newest write still the #120
  hard_delete). Evidence: `docs/recon/W11-03-migration-evidence.md`.
- **Not done (next gates):** CYAN-after reconciliation, then Preview smoke against NEW before any
  Production repoint. W11-04 repoints Production (owner Vercel env swaps) only after both green.
  OLD stays read-only-then-frozen (rollback = repoint envs to OLD).

## 2026-07-23 — W11-03 Addendum A: auth identity copy + jsonb double-encode incident + repair

Plan v2 migrated `public.users` (19) but no `auth` rows, so nobody could authenticate on NEW.
Addendum A (`docs/recon/W11-03-migracao-plan-v2-addendum-A-auth.md`) copied `auth.users` +
`auth.identities` for exactly the 19 migrated staff (UUIDs, emails, `encrypted_password` hashes,
confirmation preserved); OLD read-only; atomic; dry-run before commit. OLD's other 7 auth accounts
(non-staff) correctly stayed behind.

- **Incident:** login still 500'd — Supabase Auth log `Scan error on column "raw app meta data":
  json: cannot unmarshal string`. My copy's jsonb write path double-encoded 3 `auth` jsonb columns
  (`raw_app_meta_data`, `raw_user_meta_data`, `identity_data`) as jsonb **string scalars** instead
  of objects (19 rows each). Count + fidelity checks missed it because the driver decodes one level
  on read-back. **Config-migration jsonb was NOT affected** (correct method there).
- **Repair:** in-place `col = (col #>> '{}')::jsonb WHERE jsonb_typeof(col)='string'`, atomic,
  dry-run first, every row verified byte-identical to OLD (canonical `::text`) before commit. Login
  worked after. Evidence: `docs/recon/W11-03-addendum-A-auth-evidence.md`.
- **Lesson (standing):** a cross-DB jsonb copy must assert `jsonb_typeof` object-vs-string parity,
  not only value equality — the driver's read decode hides a double-encode from a naive check.

## 2026-07-23 — W11-04 Production cutover COMPLETE (repoint to NEW) + DATABASE_URL pooler incident

Production repointed to NEW across platform + api (+ portal URL/anon); owner performed the Vercel
env swaps + redeploys; GREEN verified read-only. Preview smoke was skipped (owner repointed
Production directly), so the smoke ran on Production.

- **Incident:** data pages failed (dashboard "Sem dados", agenda error, `/admin/working-hours` 500)
  while login worked. Server-side only (`.rsc` fetches). Vercel runtime: `getaddrinfo ENOTFOUND
  db.dfotoodqvmjhbdcxyaxf.supabase.co`. Root cause: `DATABASE_URL` held the **dedicated/direct**
  host `db.<ref>.supabase.co` (IPv6-only, no IPv4 add-on → unreachable from Vercel), not the shared
  pooler. `DATABASE_URL` is Sensitive/unviewable, so it couldn't be re-verified by eye; runtime was
  ground truth. Confirmed no integration/duplicate var and code reads only `DATABASE_URL`.
- **Resolution:** owner rebuilt `DATABASE_URL` (shared pooler, 6543) + `DATABASE_URL_DIRECT`
  (5432) on host `aws-0-eu-central-1.pooler.supabase.com`, redeployed.
- **Production smoke GREEN:** login, dashboard (real 0s), agenda (18 therapists + 2 locations),
  `/admin/working-hours` (schedules render), Pacientes (empty); zero console errors; zero traffic
  to OLD. OLD frozen (anchor `2026-07-22T20:22:20.097694Z`, audit 700, newest #120) — rollback
  intact. Evidence: `docs/recon/W11-04-repoint-evidence.md`. W11-05 (hardening/close) is next,
  after the owner declares cutover final.

## 2026-07-23 — W11-05 hardening + close: standing rules + Wave 11 closed (reversible parts)

GREEN performed the reversible W11-05 items + records; the irreversible items wait on the owner's
explicit "cutover final" declaration (OLD stays the live rollback until then).

- **GREEN self-merge RETIRED (standing rule).** From Wave 12 on, EVERY merge to `main` is
  OWNER-MERGE / OWNER VISUAL GATE — no agent self-merge, permanently. The branch-protection change
  is the owner's GitHub authority (owner-performed); this entry is the standing rule. (Mirrors the
  existing agent-governing-files posture on `.github/workflows/` and `.claude/skills/`.)
- **Single migration path.** `prod-migrate.yml` (Path 1, OLD project) is RETIRED and removed by the
  owner (workflow files are owner class). The one sanctioned path is the manual `drizzle-kit`
  direct-connection apply against NEW (`packages/db`, `DATABASE_URL_DIRECT` session pooler 5432).
  Docs updated: `docs/runbook-prod-migrations.md`, `docs/ops/prod-migrate.md`,
  `docs/ops/prod-drift-check.md` (drift-check secret must target NEW).
- **Max access review — CLEAN.** Review flagged Max Tribe holding `owner` (not `therapist`);
  **owner ruled Max is intentionally an owner (he is the developer as well).** Not a defect; no
  change made (Q-W11-05-1). GREEN changed no access.
- **Old-project residue policy.** OLD (`jaxmkwoxjcgzkwxgbayx`, frozen at anchor
  `2026-07-22T20:22:20.097694Z`, carrying the accepted residue island {94,108,109,118,119,121})
  is RETAINED as the rollback. The [30]-day retention clock + the branch-protection re-harden +
  the OLD "freeze final" start on the owner's explicit **cutover-final** declaration (PENDING as of
  this entry). Decommission is a future owner-gated action, never automatic; GREEN never deletes OLD.
- **Backup/restore drill — DEFERRED (documented, not faked).** A full drill (backup -> disposable
  restore -> verify real counts + a signed-URL attachment) is not runnable now: no `pg_dump`/restore
  target in the ops environment, and NEW has no real data/attachments yet. Owner-verify: Supabase Pro
  daily backups + PITR enabled in the NEW dashboard. A real-data drill is a follow-up once real data
  + attachments exist. NOT claimed as passed.
- **Twilio EU + DPA** already on record (`docs/QUESTIONS.md`, owner as actor) — reaffirmed as the
  live-SMS precondition; not built here. Wave 11 close-out report:
  `docs/status/2026-07-23-wave-11-report.md`.

## 2026-07-24 — W12-33 agenda hover popup: isolation/stacking + estado display (defect loop)

Presentation-only defect fix (no migration, no schema, no flags). Two owner-screenshot
defects on the shared appointment hover popup (agenda card + Marcações row).

- **Defect A (isolation/stacking).** The popup rendered UNDER/through neighbouring name
  lines and was clipped by the grid edge. Root cause: the agenda grid root is `.glass-card`
  = `overflow-hidden` + `backdrop-filter: blur(24px)` (a backdrop-filter ancestor is a
  containing block AND paint boundary for descendants), and each start-slot group is a
  `z-10` stacking context — so no z-index or `position:fixed` on the in-tree popup could
  escape. Fix: render the popup through a **portal to document.body** (new shared
  `HoverPopover`), with an opaque surface (`bg-v2-surface` = #FFFFFF, AA on the panel text),
  `isolate` + `z-50`, and viewport-edge-aware anchoring (flip left near the right edge, flip
  above near the bottom, clamp to margins; repositions on scroll/resize). `renderToStaticMarkup`
  forbids portals, so the panel is rendered inline (hidden) on the server/closed state — markup
  stays present for SSR + tests.
- **Defect B (contradictory estado).** The popup showed the estado label ("Confirmada") AND a
  separate confirmation line ("Confirmação pendente") at once. Reconciled the DISPLAY with the
  #653 estados model: the estado (`deriveEstado`) is authoritative; the confirmation line is
  shown ONLY when non-redundant — `estado === "agendada" && confirmation === "pending"`
  (i.e. "aguarda confirmação"). Collapsed for Confirmada and every terminal estado. No data
  or derivation change; only what the panel renders. Reused `EstadoMarker` + `ConfirmationIndicator`.
- **Gates GREEN:** `pnpm lint` (0 errors), `pnpm typecheck`, `pnpm test` (1312 passed),
  `pnpm --filter web build`. Updated the agenda-grid hover test (Confirmada no longer prints a
  confirmation line) and added hover-card unit tests for both defects. OWNER VISUAL GATE — no
  self-merge.

## 2026-07-24 — W12-13 authz regression fix: restore W10-04 therapist scope on note actions (+ NUL-byte dedup key)

Security fix (HIGH) + reviewability fix. No migration, no schema, no flags. W12-13 (#656)
introduced two `"use server"` note actions that bypassed the W10-04 therapist
"own-patients-only" narrowing (`therapistPatientScope`, `apps/web/lib/patients/scope.ts`).

- **FINDING 1 (HIGH, authz).** Two actions read/wrote another therapist's patient data by UUID:
  `listPatientAppointmentsForNoteAction` (`apps/web/lib/notes/appointment-options.ts`) called
  `listPatientAppointments`, which enforces only `appointments:read` + tenant RLS — so a therapist
  POSTing another therapist's patient UUID got that patient's full appointment schedule; and
  `appendAppointmentNoteAction` (`apps/web/lib/patients/actions.ts`) derived `patient_id` from the
  appointment under tenant RLS only, so a therapist could append a note to ANY tenant appointment
  by UUID. Every other patient-data path (`getPatient`, `searchPatients`) AND-in
  `therapistPatientScope`; these two did not.
- **Fix mechanism (reuse the established model, not a new one).** Both actions now precheck patient
  visibility with `getPatient(patientId, { includeDeleted: true })`, which applies
  `therapistPatientScope` exactly as `getPatient`/`searchPatients`/the patient-profile page gate do:
  a non-own patient → `null` → the action returns empty / `{ ok: false }` (deny). `includeDeleted`
  keeps the check to the therapist-scope narrowing ALONE, so owner/admin/reception (unscoped,
  tenant-wide) are provably unaffected — confirmed by unit tests and the `isolation-therapist` E2E
  positive control (admin cross-visibility still green). `appendPatientNoteAction`'s gating is
  untouched (it took a client `patientId` pre-PR; not this PR's regression).
- **FINDING 2 (MEDIUM, reviewability).** `apps/web/lib/patients/notes-merge.ts` built the dedup
  natural key with a LITERAL NUL byte (raw 0x00) between content and timestamp, which made git
  classify the file as binary (`file` → "data"; `git grep -I` skipped it). Replaced the raw NUL
  with the `\0` escape sequence — byte-identical separator at runtime, source stays UTF-8 text and
  reviewable (`file` → "UTF-8 text"). Dedup behaviour unchanged (existing `notes-merge` unit tests
  stay green).
- **Tests added (fail-before / pass-after, verified by reverting the fix).**
  `appointment-options.test.ts` and `actions.append-appointment-note.test.ts` mirror the
  `getPatient`/`searchPatients` therapist-scope pattern (real `@osteojp/auth` matrix; therapist +
  reception both hold `patients:write`/`appointments:read`, so the capability gate genuinely passes
  and the SCOPE check is what denies). On origin/main these FAIL (non-own therapist gets the other
  patient's schedule / `{ ok: true }`); with the fix they PASS.
- **Gates.** `pnpm lint` (0 errors), `pnpm typecheck` (9/9), `pnpm test` (all green incl. new +
  existing `notes-merge`/`scope` suites), `pnpm build` (4/4 apps, portal build needs the same
  `NEXT_PUBLIC_SUPABASE_*` env CI/Vercel already provide). `pnpm test:e2e`: the directly-relevant
  `isolation-therapist` spec is GREEN (therapist own-only + admin cross-visibility), and
  `notes-unification` TWO-MODE (the only spec exercising BOTH changed actions, as admin) is GREEN.
  The broader chromium suite has pre-existing failures that reproduce IDENTICALLY on origin/main
  (stale accumulated local-DB state — AI drafts ad17/ad18 already signed from prior runs — plus
  flaky agenda hover/location specs); a clean `supabase db reset` + reseed clears them but is a
  destructive, owner-gated action, not run autonomously. This change introduces ZERO E2E regression.
- **AUTHZ change → OWNER MERGE GATE. No self-merge, no `--admin`, no force-push.**

 db/0043-clinical-rls-r16
## 2026-07-25 — 0043 clinical_records RLS tighten R16 (strict single-location admin) — branch db/0043-clinical-rls-r16

Highest-risk change in the wave. Built AGAINST CYAN's pre-audit frame
(CYAN-LEDGER-R16-0043-clinical-rls-AUDIT-FRAME-20260724T170931Z). Migration 0043
is hand-authored (mirrors 0038 style; no drizzle-kit generate). Ends in a PR the
executor does NOT merge — CYAN post-audit + owner apply-before-merge.

- **Matrix.** clinical_records staff policies rewritten: owner = all in-tenant
  (unchanged); admin = own-location READ only (scoped to the admin's
  `staff_locations`), admin WRITE REMOVED (matches the app permission matrix
  where admin holds `clinical_records:read` only); therapist = OWN patients;
  reception = DENIED (unchanged, re-proven). The 0001 immutability trigger and
  the 0010 patient self-scope policy (TO patient) are ORTHOGONAL and UNTOUCHED.
- **Patient→location basis = EXISTS-over-appointments.** A patient with
  appointments at N locations is visible to admins of ALL N (never collapsed to a
  single primary column). PLUS a persisted `patients.primary_location_id`
  FALLBACK consulted ONLY for patients with NO appointment carrying a non-null
  `location_id`. The fallback never overrides the appointment basis.
- **Nullability = documented "unassigned → owner-only".** `primary_location_id`
  is NULLABLE. A zero-appointment patient whose fallback is NULL is visible to
  OWNER ONLY (owner = all in-tenant), never to any admin — no silent-NULL
  orphaning (owner always sees it). Chosen over NOT NULL so patient creation is
  never blocked by a missing location context; once an appointment exists the
  appointment basis takes over.
- **Backfill written (idempotent), not skipped.** Even though the table is empty
  post-purge, the backfill statement exists and is correct for any future
  environment: derive from the earliest non-null-location appointment, else the
  creator's SINGLE `staff_locations` membership (only when unambiguous — a creator
  in 2+ clinics stays NULL → owner-only), else NULL. `array_agg(...)[1]` +
  `HAVING count(*)=1` (uuid has no `max()`). Fills only rows still NULL.
- **Helpers.** Two SECURITY DEFINER, STABLE, `search_path=public`-pinned
  functions (`clinical_admin_sees_patient`, `clinical_therapist_sees_patient`),
  each tenant-filtered on `jwt_tenant_id()` on every table read (no cross-tenant
  leak despite DEFINER bypassing RLS); `auth.uid()` = `public.users.id`.
- **Therapist scope = app W10-04 UNION, not CYAN's literal wording.** CYAN's
  frame says "author/practitioner=auth.uid() OR treating appointment". The
  owner-approved app scope (`therapistPatientScope`, W10-04, 2026-07-21) is
  `patients.created_by = uid` OR treating appointment (primary/secondary). The
  RLS predicate is the UNION: record author (`practitioner_id=auth.uid()`) OR
  created_by OR treating appointment. Rationale: RLS is defense-in-depth and must
  NEVER be STRICTER than the app, or it silently hides rows the app intends to
  show (e.g. `listReviewQueue`, which already applies `therapistPatientScope`).
  Including `created_by` is owner-sanctioned (W10-04). Flagged to CYAN as Q.
- **`appointments.location_id` is NOT NULL (CYAN frame said NULLABLE).** Verified
  against origin/main DDL (0000, never dropped). The null-location-appointment
  edge is therefore UNREACHABLE by construction; the helper's fallback guard also
  keys on non-null location (future-proof if ever relaxed). Did NOT weaken the
  column (a core-table constraint = owner-confirmable). Edge proven closed via the
  NOT NULL constraint assertion + the zero-appointment fallback case. Flagged to
  CYAN as Q.
- **Go-forward population = explicit server-side capture.** `createPatient` gains
  an optional, tenant-validated `primaryLocationId` (the create action's location
  context, captured server-side — NOT inferred from `created_by.staff_locations`,
  which is ambiguous for a staffer in 2 clinics). The create FORM does not yet
  supply it (no active-clinic context in the form today) → NULL → owner-only until
  an appointment exists. UI wiring flagged as an owner/CYAN follow-up.
- **Test re-base (no weakening).** Harness `claimsFor` now sets `sub` so
  `auth.uid()` resolves. clinical_records isolation extracted from
  cross-tenant-rls-isolation into a dedicated `clinical-records-location-rls.test.ts`
  (full R16 matrix: owner-all / admin single+both-clinics / therapist-own /
  reception-denied / zero-appointment fallback / null-location edge / cross-tenant
  / admin-cannot-write). adversarial re-home for clinical_records runs as OWNER
  (admin write removed → 0 rows, not a WITH CHECK throw). review-finalize +
  hard-delete-fk re-seeded so the acting therapist OWNS the patient (created_by /
  practitioner_id) + pinned `sub`. migration-upsert-idempotency moved from admin →
  OWNER: a historical clinical-history import writes clinical_records, so under
  R16 it must run as owner or service_role (NOT admin, now read-only on clinical);
  the pipeline has no production caller yet (Q for when it is wired). All security
  assertions preserved.
- **Gates.** `db:check-journal` GREEN (44 files). supabase mirror parity GREEN
  (byte-identical). `pnpm lint` GREEN (0 errors). `pnpm typecheck` GREEN (9/9
  packages). Full `@osteojp/db` RLS/unit suite GREEN (402/402, incl. the new R16
  matrix) against local Supabase with 0043 applied. `pnpm build` GREEN (with local
  dev Supabase env; the bare-worktree portal prerender failure is the known
  QUESTIONS Q1 missing-env issue). `test:e2e` — clinical.spec 18/18 GREEN
  (therapist authoring/sign/version/delete/anular + scoped ficha + reception
  denied), isolation-therapist GREEN; patients.spec 22/24 (the 2 failures are a
  pre-existing responsive-table strict-locator artifact — reproduce with a fresh
  seed, single patient in DB, untouched by 0043).
- **apply-BEFORE-merge; do NOT merge.** AUTHZ + clinical-data change → OWNER
  MERGE GATE. CYAN post-audit → owner terminal apply with pasted journal → merge.
  No self-merge, no `--admin`, no force-push.

 ficha/W12-30-polish-and-bodychart
## 2026-07-25 — W12-30 template polish (top-5, PDF templates) + bodychart order (v5) (branch ficha/W12-30-polish-and-bodychart)

Two related ficha/template changes, one PR (DO NOT MERGE — owner visual gate on
the printed documents + the new-ficha field order).

**TASK A — W12-30 template polish.** The audit (`docs/design/W12-30-template-polish-audit.md`,
merged #651) lists 19 presentation-only items with a recommended top-5. Owner
picked "the best ones / finish this one". Implemented the PDF-template portion of
the recommended top-5 against the three live pdf-lib renderers:

- **A1 + B1 — real logo on the clinical report + RGPD PDFs.** Replaced the drawn
  teal-square + magenta-bar + Helvetica "OsteoJP" stand-in mark with the real
  embedded logo raster (`clinicLogoBytes()` / `doc.embedJpg`) the Declaração
  already ships — one brand identity across every printed document. Sized to a
  40pt header lockup (native aspect 322×358); fiscal-ID block unchanged.
- **A3 + B2 — restrain the magenta.** Every section heading (Paciente / Registo /
  Assinatura on the report; consent-item + patient + signature headings on RGPD)
  moved off magenta to INK. Magenta now appears only inside the embedded logo,
  matching the token rule "accent, sparingly, never a dominant surface". The
  `MAGENTA` const is fully removed from both renderers.
- **A5 — brand-neutral hairline.** The ad-hoc `rgb(0.85,0.85,0.85)` rule colour
  is now brand neutral-200 `#E2E8EE` (shared `rule()` in report + RGPD, and the
  new Declaração footer rule).
- **C1 — Declaração print-branding-rule gap.** Added the branded location-contacts
  + clinic-fiscal footer the print rule requires on every declaration (the report
  + RGPD already carry it; the Declaração did not). Reuses the SAME data helpers
  as the report: `resolveLocationContact()` (contact block) and
  `resolveClinicFiscal()` (fiscal identity). Threaded `sourceLocation` +
  `fiscalSource` through `generate.ts` → `buildDeclaracaoModel` → the renderer.
  The verbatim Fisiozero legal BODY is untouched; only the surrounding chrome was
  added. Fiscal values remain the owner-gated F1/F2 placeholders (nome fiscal por
  confirmar / NIF 000000000) — visible layout now, "real" once the owner supplies
  them; no value invented.

**Scope call — email-voice items D1/D2/D3 deferred, not implemented.** The audit's
recommended top-5 also includes email register + sign-off (D1+D2) and the
confirmation-email monospace-padding cleanup (D3). Those live in
`lib/reminders/templates.ts` (the reminders pipeline), not the three PDF templates
this PR was scoped to ("the 3 live PDF templates: report / RGPD / declaração").
D2 additionally needs `clinicLocation` threaded into the follow-up/no-show contexts
(dispatch blast radius). Per the safe-subset instruction and the owner-confirmable-
scope rule, the PDF items ship here and the email-voice items are logged to
QUESTIONS.md (W12-30-Q1) with a recommended default (ship as a separate email-voice
PR). Deferred items the audit itself flagged (Source Serif A4/B3/C3; em-dash vs
hyphen D4; fiscal placeholders F1–F4) were NOT touched.

**TASK B — bodychart order in ficha v5 (owner ruling 2026-07-25).** In
`packages/db/seed/form-templates/osteopathy-v5.json`, moved `bodychart` in the
schema `x-order` array from LAST to right AFTER `consultation_reason`. New order:
weight_kg, height_cm, consultation_reason, **bodychart**, relief_aggravation,
observations, mobilidade, special_tests, mobilidade_observacoes, systems_review,
health_problems, clinical_history, diagnostico, treatment_objectives,
treatment_plan, tratamento, episode_date, red_flags. Display-order-only change
(x-order): no property/schema change, no version bump (still v5), JSON valid +
pretty-printed, 18 keys unchanged. Matches byte-for-byte the x-order already
applied to the staged prod-seed copy (`osteojp-prod-apply/.../ficha-v5-only/`).
Updated the two order assertions: the unit test (`form-template.test.ts` v5 order)
and the E2E section-rail order (`clinical.spec.ts`). The v5 PROD seed is owner-run
separately — no seed executed here.

- **Gates.** `pnpm lint` (0 errors; 9 pre-existing warnings in untouched files),
  `pnpm typecheck` (9/9), `pnpm test` (all green: 1330 passed / 5 skipped / 1 todo
  across 7 packages, incl. the PDF render tests, the new Declaração footer +
  model tests, and the v5 form-template order test; DB/RLS suite ran against local
  Supabase). `pnpm build` (4/4 apps; portal build needs the same
  `NEXT_PUBLIC_SUPABASE_*` env CI/Vercel already provide — supplied locally from
  the running local Supabase, no prod). `pnpm test:e2e`: per `apps/web/e2e/README.md`
  the suite is NOT a CI/PR gate (vitest-only) and requires a destructive
  `supabase db reset` + fixture seed + 3 dev servers, not run autonomously; the one
  affected assertion (ficha section-rail order in `clinical.spec.ts`) is updated to
  the new order and mirrored by the passing unit order-test. Owner verifies on the
  preview (visual gate).
- **DO NOT MERGE — owner visual gate.** Owner reviews the three rendered PDFs
  (logo, ink headings, neutral hairline, Declaração footer) and the new-ficha field
  order on the preview before merge.

## 2026-07-25 — W12-20 Pacotes per-location pricing (migration 0044) (branch db/W12-20-pack-location-pricing)

Owner ruling 2026-07-25: "I need the pacote edits to be the SAME as services — to
put pricing per location. Copy the same edit configuration from services into
pacotes." Mirror the Stream-F per-location SERVICE pricing onto PACKS. No new shape
invented — the pack layer is a byte-for-byte analogue of `service_location_prices`.

- **Migration 0044 `service_pack_location_prices`** (hand-authored, mirrors 0007;
  `drizzle-kit generate` NOT used — snapshots stale since 0014). Net-new override
  junction over `service_packs.price_cents`: `tenant_id` NOT NULL + `pack_id` →
  service_packs + `location_id` → locations, `price_cents` NOT NULL, `currency`,
  `is_active`, `created_at`; `unique(tenant_id, pack_id, location_id)`; nonneg CHECK;
  `(tenant_id, location_id)` index. FK ON DELETE: tenant_id cascade, pack_id +
  location_id **no action** (history-safe — a pack/location delete never cascades
  through a price row). Numbered **0044** (0043 reserved for the concurrent
  clinical-RLS migration; NOT taken here). Journal entry idx 43 appended; supabase
  mirror regenerated via `scripts/sync-supabase-migrations.mjs`.
- **RLS mirrors `service_location_prices` EXACTLY:** one `FOR ALL` tenant_isolation
  policy, USING / WITH CHECK both `tenant_id = (select public.jwt_tenant_id())`,
  fail-closed (missing/invalid claim → NULL → predicate FALSE → row invisible), plus
  the table GRANT to `authenticated`. Isolation test `pack-location-prices-rls.test.ts`
  (8 assertions) proves: tenant B sees ZERO of tenant A's override rows (by id AND by
  pack scan), owner BYPASSRLS negative control, WITH CHECK denies a cross-tenant insert,
  and offered-only-where-priced (a pack IS offered at L iff an active price row exists).
- **base-vs-override model (the flagged ambiguity — resolved, NOT halted).** Services:
  `services.price_cents` (nullable base) + per-location override rows; `effectivePriceCents`
  = override ?? base. Packs already carry `service_packs.price_cents` NOT NULL. Decision:
  keep it as the base/fallback and layer the override on top, identical to services. The
  pack base is a strict subset of the service case (base is ALWAYS defined, so no null-base
  branch), so the mirror is unambiguous — no QUESTIONS entry needed. The pack's existing
  single `location_id` scoping field is left untouched (decoupled — coupled-flags lesson).
- **App + UI mirror.** `packs.ts` gains `setPackLocationPrices` / `listPackLocationPrices`
  / `resolvePackPriceCents` / `isPackOfferedAtLocation` / `listPackOfferings` +
  re-exports the shared `effectivePriceCents` (same resolver as services). `deletePack`
  now clears a pack's OWN override rows inside its delete tx (mirrors `deleteService`) so a
  pack blocked only by price config stays hard-deletable. `setPackLocationPricesAction`
  (through `runPack` → invalidates the agenda-reference cache). `PacksSection` renders a
  sibling per-location price grid (`price__<locationId>` inputs + Oferecido/Não-oferecido
  badge + effective hint), the exact analogue of the services editor. New pack-namespaced
  i18n keys (pt + en). Existing pack CRUD (W8-01b) untouched and green.
- **Gates.** `pnpm db:check-journal` (44/44), `pnpm lint` (0 errors), `pnpm typecheck`
  (9/9), `pnpm test` (web 1330 passed; db 396 passed incl. the new RLS isolation suite,
  run live against local Supabase), `pnpm build` (4/4 — portal needs the same
  `NEXT_PUBLIC_SUPABASE_*` env CI/Vercel already provide), `pnpm test:e2e` admin-packs
  chromium 7/7 (incl. the new W12-20 per-location pack-price spec; existing W8-01b CRUD
  still green).
- **Migration 0044 is apply-BEFORE-merge.** Prod NOT touched — the owner applies 0044
  (CYAN clear → terminal apply with pasted journal evidence) THEN merges. Merging before
  apply would deploy app code querying `service_pack_location_prices` before the column/table
  exists. OWNER-MERGE + OWNER VISUAL GATE on the pricing grid. No self-merge, no `--admin`,
  no force-push.
 main
 main

## 2026-07-25 — W12-40: Equipa + Horários consolidated into ONE member-management tab

Folded the separate **Horários** (working-hours) admin tab INTO **Equipa** so a team
member is managed end-to-end from one place. UI/UX + wiring only — NO migration, NO
schema change, NO new server-action contracts, NO prod writes. `ui-ux-pro-max` invoked
for the card + modal + interaction design.

- **One tab.** Removed the `/admin/working-hours` nav entry (`admin/layout.tsx`). The
  route survives as a pure redirect: `/admin/working-hours[?t=<id>]` →
  `/admin/staff[?t=<id>]` (old deep links keep working; `?t=` re-opens that member's
  Gerir modal on the Horários section). Rationale for keeping it as a redirect (not a
  hard 404): preserves any bookmarked/linked schedule URLs and the deep-link contract the
  Agenda/other surfaces relied on. Logged as a resolvable default in QUESTIONS (Q1).
- **Per-member cards.** Replaced the Equipa data TABLE with a responsive card grid
  (`sm:2 / xl:3` cols, light+dark, tokens only, no raw hex). Each card: member colour
  spine + dot (from `therapistColor()` FNV palette — the W9-05/W12-21 `*-700` tokens),
  name (authoritative id, colour is reinforcement per W9-05), role chip + job title,
  Ativo/Inativo `StatusBadge`, location chips (derived from `availability_templates`, the
  W5-32 assignment), primary service, and a compact tabular working-hours summary, plus a
  single "Gerir" primary action. Kept `EquipaLocationFilter` + the `SearchBox` toolbar and
  the KPI summary + invite panel unchanged.
- **One Gerir modal** (`StaffManageModal`, extended): a centered top-layer native
  `<dialog>` (`useAnimatedDialog`) with a `SegmentedControl` switching sections, ONLY the
  active section mounted (progressive disclosure): **Contacto** (name/email/jobTitle/phone
  → `editStaffAction`), **Função e acesso** (role → `changeRoleAction`, activate/deactivate
  → `setActiveAction`, password-gated delete → `deleteStaffAction`, in a visually separated
  danger zone), **Serviço principal** for therapists (→ `setPrimaryServiceAction`), and
  **Horários** for non-reception (weekday reconcile → `saveTherapistScheduleAction` + the
  W5-12 Bloquear-horário editor → time-off actions, stacked above). Every control calls its
  SAME existing server action — zero contract change. Because only the active section is
  mounted, the Horários surface still carries NO delete-password field (W4-14 invariant).
- **Server actions.** `working-hours/actions.ts` data behaviour (availability/time-off
  writes + invariants) is UNCHANGED; only the post-write `revalidatePath`/`redirect` target
  moved from `/admin/working-hours` to `/admin/staff`. This is routing, not a contract
  change. The redirect deliberately does NOT carry `&t=` (no modal auto-reopen after a
  write): auto-opening the manage modal on page load raced with the stacked Bloquear-horário
  dialog and flaked the time-off e2e (a fast real user could hit it too). After a write the
  page returns clean, the banner confirms, and the card summary updates; the deep link
  (`/admin/working-hours?t=<id>` → `/admin/staff?t=<id>`) still auto-opens via the page-level
  `?t=` handler — the only auto-open path. `TherapistScheduleCard.tsx` deleted (its inline
  schedule editor now lives in the modal); `TherapistBlocks.tsx` reused as-is.
- **Guards preserved.** No-invite gate, owner-tier visibility (`manageable`), location-
  scoped `listStaff` (0045), the 24h `TimeFieldInput` (W12-31), and the scrypt delete gate
  all intact.
- **Tests.** `StaffManageModal.test.tsx` rewritten (sections + contact form pins).
  Re-pointed every working-hours/staff e2e spec to the Equipa surface: `working-hours`,
  `therapist-blocks`, `agenda-blocked-time`, `equipa-location-filter`,
  `equipa-primary-service`, `staff-primary-service`, `staff-contact-fields` (all now drive
  the card grid + Gerir modal; a `data-user-id` card hook backs the deep-link test).
  `staff-invite` unchanged (invite form untouched).
- **Deferred (QUESTIONS Q2).** `staff_locations` (migration 0038) membership + per-location
  `staff_locations.color` EDITING have NO server action in the app yet, and the boundary
  forbids new contracts. Locations + colour are therefore DISPLAYED (derived: availability
  assignment + FNV palette) but not yet editable as explicit membership/colour. Editing the
  per-day location in the Horários section is the current (availability-derived) way to
  change a member's clinics. A follow-up ticket should add `setStaffLocations` /
  `setStaffColor` + wire the colour picker.
- **Gates.** `pnpm lint` (0 errors), `pnpm typecheck` (0 errors), `pnpm test`
  (155 files, 1335 passed / 5 skipped / 1 todo), `pnpm build` (4/4 — portal needs the same
  `NEXT_PUBLIC_SUPABASE_*` env CI/Vercel already provide), `pnpm test:e2e` affected specs on
  chromium (serial). DO-NOT-MERGE: owner VISUAL gate on the new card grid + Gerir modal.

## 2026-07-26 — W12-40-Q2: editable staff location membership + agenda colour (GREEN)

- **Built the write layer #663 deferred.** New `apps/web/lib/admin/staff-locations.ts`:
  `listStaffLocations` (read, `users:read`), `setStaffLocations` (exact add/remove diff of a
  member's clinics; unknown/cross-tenant id rejected; `users:manage` + audited), `setStaffColor`
  (per-(member,location) colour; W12-21 palette allowlist; no-op when unchanged; requires an
  existing membership → `not_found`). Server actions `setStaffLocationsAction` /
  `setStaffColorAction` mirror the existing void→revalidate→redirect pattern. New "Locais e cor"
  section in the Gerir modal (membership checkboxes + per-clinic colour picker).
- **Non-migration.** `staff_locations` (0038) already exists; its RLS write policy
  (owner/admin) already matches the `users:manage` gate, so no schema/RLS change.
- **Colour model = per (member, location)** (matches the schema's per-row `color` + W12-21's
  "per-(therapist, location) values"), not one-colour-per-person. Card shows the first set
  colour; picker is per-clinic. Owner-confirmable (QUESTIONS).
- **Colour source.** Added an exported `THERAPIST_PALETTE` (the 15 W12-21 tokens + 4 reused) in
  `therapist-color.ts` — the picker and the `setStaffColor` allowlist share one source. No raw
  hex (brand constraint); AA guarded by `tokens-therapist-palette.test.ts`.
- **Card reflection.** The Equipa card colour now prefers a saved membership colour, falling
  back to the FNV hash. The AGENDA still uses the FNV hash — wiring the scheduling view to the
  stored per-location colour is a separate follow-up (the W12-21 legend/values work).
- **Gates.** typecheck 9/9, lint 0 errors, test 1347 passed / 5 skipped, `web` build ✓ (portal
  build fails only on the pre-existing `NEXT_PUBLIC_SUPABASE_*` prerender prereq). e2e +
  db-tests run in CI (REQUIRED). Non-migration → self-merge on green per policy, unless the
  owner takes the visual gate (recommended, per the #663 precedent).

## 2026-07-26 — e2e suite stabilization (owner-chosen; unblocks #664 normally)

- **Why.** #664's required e2e check reded across 3 CI runs on PRE-EXISTING flaky
  specs unrelated to the W12-40-Q2 change (proven: the feature + those specs pass
  locally). Root cause = pathologically slow/overloaded CI runners (a 7.8s-local
  test observed at 96s on CI) plus two locator/hover races. Owner chose "stabilize
  the suite first, then merge #664 normally" over an admin-merge.
- **Fixes (root cause, not masking; all verified locally — 20/20 pass in 50s):**
  1. `playwright.config.ts`: global test `timeout` 30s → **120s** — absorbs the
     slow-runner variance that was the dominant timeout-class flake.
  2. `therapist-blocks.spec.ts:97`: explicit `test.setTimeout(180_000)` — the
     single longest test (multi-dialog); a bad runner hit 96s.
  3. `notes-unification.spec.ts`: `.first()` on the "Detalhes da marca" trigger —
     fixes the strict-mode "resolved to N elements" flake at its root (both tests).
  4. `scheduling.spec.ts:125`: wrapped the post-reschedule hover+assert in a
     `.toPass()` retry loop (same guard notes-unification uses) — fixes the
     hover-popover revalidation race that caused the intermittent `toBeVisible` fail.
- **Scope note.** These touch pre-existing specs unrelated to W12-40-Q2 but are
  required to get #664's e2e green; they harden the suite for every future PR. No
  product/source logic changed.

## 2026-07-27 — W12-40-T2: therapist colours wired across the agenda (GREEN)

- **Colour model = per PERSON** (owner ruling 2026-07-27, supersedes the artifact's
  per-location proposal). Stored as `staff_locations.color`, collapsed to the
  first-non-null membership = the person's colour — the SAME rule the Equipa card
  already uses (`staff/page.tsx`), so agenda and Equipa always agree.
- **Wiring (one seam).** A correlated subquery in the agenda `appointmentSelection`
  (`lib/scheduling/data.ts`) attaches `colorKey` to every `AgendaAppointment`
  (tenant-pinned, mirrors the `notes` coalesce). The two render sites —
  `agenda-grid.tsx` (name-line) and `appointment-hover-card.tsx` (the shared hover
  panel that feeds BOTH the agenda card and Marcações) — resolve
  `paletteColorByKey(appt.colorKey) ?? therapistColor(id)`. One change → colours
  reflect on agenda + hover + Marcações + Equipa consistently.
- **New AA-safe token** `--color-v2-gray-700 #4B5563` (7.56:1 on white) +
  `THERAPIST_PALETTE` entry `gray`/"Cinzento" (for Samuel). Palette AA test → 16.
- **Owner colour list → AA-safe palette keys** (2026-07-27): exact where possible;
  forced substitutions (AA / missing token) = yellow→mustard, light-green→
  chartreuse, plum→wine, teal-blue→teal, gray→new token. See QUESTIONS.
- **Gates:** typecheck 9/9, test 1354 pass (incl. new resolver + stored-colour
  render + gray token), lint 0, web build ok. Stored path unit-covered; e2e
  exercises null→FNV fallback (seed sets no colours in the e2e fixture).
- **Non-migration.** The colour VALUES + any missing memberships are an owner-run
  prod seed, staged separately (per-person colour + clinic membership per the list).

## 2026-07-27 - Pre-Launch loop set + board governance + handoff correction (YELLOW)

Wave 12 is CLOSED; opened the PRE-LAUNCH phase (not a numbered wave). Authored the
loop set `docs/loops/prelaunch/` (PL-01, PL-02, PL-03a, PL-04, PL-05, INC-02),
moved the board to a committed source of truth, and corrected a stale handoff
claim. Docs-only; owner-merge; YELLOW does not merge its own PR.

- **Board is now a committed source of truth, not an artifact.** Renamed
  "OsteoJP - Wave 12 board" -> "OsteoJP - Pre-Launch Board". `docs/board/prelaunch-board.json`
  is the source of truth; the claude.ai artifact is only a RENDER of it. A board
  claim is never truth on its own - the `evidence` field carries the proof.
  `docs/board/validate-board.mjs` is the board's own definition of done: it exits
  non-zero if any card is `status=shipped` with `evidence=null` (or a launch gate
  is `state=pass` with `evidence=null`), plus enum/lane/blocked-on integrity.
  Proven: valid board exits 0; a broken copy (shipped-with-null-evidence,
  pass-with-null-evidence, blocked-with-null-blocked_on) exits 1. Spec:
  `docs/board/BOARD-SPEC.md`.
- **Launch readiness is COUNTED, never estimated:** gates passed / 9 (G1..G9,
  pass/fail, no partial credit). Seeded fail-closed at 0/9 until each gate's
  evidence exists.
- **Three briefing-versus-reality mismatches caught at authoring (rule 11), encoded
  in the loops and flagged to the owner rather than guessed past:**
  1. **PL-01** - the briefing hypothesised the agenda should "split same-hour
     appointments into columns" on an "hour-only grid (migration 0041)". Recon:
     the vertical stack is INTENTIONAL and locked by a test
     (`agenda-grid.tsx:39-46`; `agenda-cards.spec.ts:104`), and 0041's
     `slot_granularity_min` is STORED but has ZERO grid consumers (inert). The loop
     fixes by BOUNDING the vertical stack to the hour band (satisfies the DoD),
     NOT by columns, and halts-loud if columns are the only path. Q-PL-01-1.
  2. **PL-04** - the briefing framed NESA as a service to ADD ("currently 20
     services"). Recon: NESA is ALREADY seeded ("Tratamento NESA" LAV + "NESA" CB +
     template + pack; 22 services). So the loop authors a QUESTION (missing for a
     therapist / at a location / not seeded on prod) + a CYAN prod-existence check,
     NOT a catalogue insert. Recommended default: the NESA therapist David Batista
     has no user row yet (deferred-invite set). Q-PL-04-1.
  3. **PL-05** - the naive fix (filter Terapeuta dropdown to `role='therapist'`)
     would drop the owner JP, who is a practicing clinician (role=owner). "Bookable"
     is the `therapist_services` signal, not raw role. Q-PL-05-1.
- **PL-03: no migration.** Recon proved declaracoes are transient (no DB table/
  column; `generate.ts:20-23`), so PL-03a (UI + PDF observacoes) is the whole fix.
  No PL-03b build loop authored; persistence would be a future owner design
  decision (rule 8 immutability), tracked as a loose-end.
- **INC-02 root cause named.** The synthetic "Teste CB" on prod is a symptom; the
  cause is that Rodica has no usable non-prod target (`seed-e2e.mjs` defaults to
  local; no Vercel-preview-for-Rodica exists). Authored the pt-PT sheet template
  `docs/ops/rodica-ambiente-de-teste.md` + Q-INC-02-1 (owner provisions the env).
  Purge = CYAN read-only inventory -> owner AUTORIZO; signed records ANNULLED not
  deleted (rule 8). YELLOW scopes NO data and runs NO prod write.
- **Handoff correction (append-only, not silent).** `docs/handoff/WAVE-12-CLOSE-20260727.md`
  listed Tiago Grilo + David Batista as rowless invite-flow deferrals. Owner
  reports both in the live Terapeuta dropdown carrying seeded colours (a seeded
  colour needs a user row). Added Correction C-1 (original text preserved, inline
  pointer added) correcting the record and routing the row/colour/role mechanism to
  a CYAN read-only check (YELLOW has no prod access). Lesson: close-out state must
  be re-derived from a live CYAN read, never carried from a seed script's ID_MAP.

 prelaunch/PL-06b-is-bookable
## 2026-07-28 - PL-06b: users.is_bookable flag governs the Terapeuta dropdown (migration 0046)

- Owner RULING (2026-07-28): Option 2 - an explicit is_bookable boolean, chosen over
  the role-set option. Rationale: role governs AUTHORISATION, the service mapping
  governs PRESELECTION (PL-06a), the flag governs DROPDOWN PRESENCE - three concerns,
  three signals. Role sets rot at every hire (the exact failure that dropped JP).
- Migration 0046 adds users.is_bookable (default false) + a tenant-scoped backfill of
  the owner-SIGNED-OFF attested id-map (16 true = 15 therapists + JP; 5 false), keyed
  BY ID (never fuzzy-matched). therapist-bookable.ts predicate becomes row.isBookable;
  both PL-05 arms removed. data.ts selects the flag (roles/therapist_services join
  dropped). Equipa Contacto form gains an is_bookable checkbox (users:manage, audited).
- RLS: is_bookable inherits users_tenant_isolation (FOR ALL, tenant-keyed); role-gating
  of staff management is app-layer. Isolation re-proven in users-is-bookable-rls.test.ts.
- Drizzle numbering note: drizzle-kit generate mis-numbered the file 0045 (the 0043 gap
  makes it use entries-count, not maxidx+1) and regenerated the whole schema (snapshots
  stop at 0014 - migrations 0015+ are hand-authored). 0046 was hand-authored to match.
- Merge policy: OWNER-MERGE, APPLY-BEFORE-MERGE. Ivan applies 0046 from the prod-apply
  worktree, pastes the journal, then merges. One migration in flight.

## 2026-07-28 - PL-06a: therapist service mapping is a PRESELECTION, not a RESTRICTION (#682)

- Owner ruling (2026-07-28, re-confirmed in his own words): the per-therapist
  service assignment in Equipa is a default, never a hard constraint. Implemented:
  the booking Servico Select (appointment-drawer.tsx) now lists ALL active services
  for every therapist; the mapping only preselects the primary (oldest mapping,
  W3-04 convention). Removed the drawer filter (serviceOptions no longer narrows by
  therapistServiceIds) and the now-dead result state.
- No server-side therapist+service reject exists (createAppointment passes serviceId
  through), so the negative DoD holds by absence. Migration-free (no schema files).
- JP's Terapeuta-dropdown restoration is PL-06b (is_bookable flag), a separate
  owner-gated migration, never composed into PL-06a.
- Rodica's NESA ruling (all therapists perform NESA) is satisfied by PL-06a alone:
  NESA is selectable for every therapist. No roster write. CB-NESA stays closed.
- Merge policy: OWNER VISUAL GATE, no self-merge.
 main

## 2026-07-29 - PL-09: role + location access model (planned, post-test)

- Owner ruling: enforce per-role location scoping - therapist own data; reception
  all therapists at their location only; admin their location only + admin panel
  limited to their location; owner all. Basis = staff_locations (0038).
- Recon (2026-07-29): clinical_records (0045) ALREADY matches the target for all
  roles. Everything else (appointments, patients, statistics, admin panel) is
  tenant-wide -> reception + admin currently see MORE than target (real access
  gaps). No viewer location-resolver, no location JWT claim; two divergent
  "assigned location" sources (availability_templates vs staff_locations).
- APPROACH (owner-approved): proper phased build (Phase 0 resolver -> 1 app-layer
  scope -> 2 RLS migrations w/ isolation tests, apply-before-merge -> 4 admin-panel
  limit), ENABLED AFTER the acceptance test. Never a broad RLS flip mid-test.
- Admin panel limited to their location: YES. Admin statistics/KPI: HELD - the
  typed spec asked for it but the confirmation checkbox left it unchecked;
  statistics stays owner-only until reconfirmed (Phase 3 not built).
- Full blueprint: docs/loops/prelaunch/PL-09-location-access-model.md.

## 2026-07-29 - PL-09 Phase 2 split: patients RLS built, appointments RLS blocked

- App-layer milestone COMPLETE + live: Phases 0/1/3/4 merged to main (#693, #694,
  #695, #696). #695 (Phase 3 admin stats) had a REAL E2E failure - a stale
  estatisticas owner-gate spec, not infra - fixed and merged.
- Phase 2 (RLS defense-in-depth) SPLIT BY RISK after code recon:
  - Phase 2a - patients RLS: BUILT as migration 0047 (packages/db + byte-identical
    supabase copy, journal idx 46) with a full isolation matrix
    (patients-location-rls.test.ts). Gates green locally: lint 0-err, typecheck 9/9,
    test 1392 passed (the DB-gated test skips without DATABASE_URL; CI runs it),
    build ok. Apply-before-merge: staged for Ivan's prod apply + CYAN verify, NOT
    self-merged (migration doctrine outranks the general self-merge delegation).
  - Correctness note: did NOT reuse clinical_admin_sees_patient (0045) - it is
    STRICTER than the patients app scope (its primary_location_id fallback is gated
    on "no appointments", and it ignores patient_2_id), so reusing it would hide
    rows the app shows. New helper patient_visible_to_located_viewer mirrors
    patientLocationScope + viewerLocationScope's no-lockout rule exactly. Reused
    clinical_therapist_sees_patient (exact match to therapistPatientScope).
    Reception is ALLOWED (location-scoped) on demographics, unlike clinical.
  - Phase 2b - appointments RLS: BLOCKED on a design decision (logged to
    QUESTIONS.md). conflict.ts (booking) reads cross-practitioner (room clash) and
    cross-location (a therapist can't be in two clinics at once) appointments under
    the caller's tenant tx; any PL-09 restriction on appointments hides those rows
    -> silent double-booking. Needs the conflict queries elevated to SECURITY
    DEFINER first. Not built; its own ticket, after Phase 5.

## 2026-07-30 - PL-09 completed end-to-end + board/handoff reconciled (GREEN)

Closes the PL-09 role + location access model. Supersedes the 2026-07-29 note above
that recorded Phase 2b as "not built; its own ticket."

- **Phase 2b SHIPPED (#702), migration 0048.** The blocker was resolved as
  designed: `appointment_conflicts` was added as a SECURITY DEFINER function so the
  booking conflict check sees the full all-therapist / all-location / all-patient
  set, and only THEN did appointments RLS restrict the caller (therapist own via
  practitioner_id/practitioner_2_id; admin + reception via location_id in
  staff_locations; owner all). This also fixed a real regression Phase 2a had
  introduced: the room-clash check was silently missing clashes when the other
  appointment's patient was not visible to the booker. Deployed Option A (apply
  0048, then merge immediately so Vercel redeploys within minutes; controlled
  pre-launch traffic makes the window negligible).
- **Apply-before-merge honoured for both 0047 (#697) and 0048 (#702).** Both PRs
  were held DRAFT until Ivan applied from the prod-apply worktree (ref-guard
  dfotoodqvmjhbdcxyaxf) and CYAN ran an independent read; only then merged. Journal
  idx 48 on main. The 0046 drift lesson held.
- **Also merged:** #701 (docs: correct the prod project ref, retired jaxm... ->
  dfoto...). CLAUDE.md now names dfotoodqvmjhbdcxyaxf as prod.
- **Board reconciliation.** The board JSON had not been updated since #690
  (readiness 7/9) and carried no PL-09 card despite the entire 6-phase build having
  merged. Added a single PL-09 card (lane=shipped, gate=owner_merge,
  evidence.kind=journal citing 0047+0048 applied + PRs #692..#702) and bumped
  as_of to 2026-07-30. Validator green (22 cards, 12 shipped, launch readiness
  unchanged at 7/9 - PL-09 is defense-in-depth, not a launch gate). Re-rendered.
- **Handoff refreshed.** Wrote docs/handoff/PRELAUNCH-20260730.md mirroring the
  board so repo ground truth survives chat boundaries (the prior handoff,
  WAVE-12-CLOSE-20260727, predated PL-09 entirely).
- **State of the run:** the executor feature queue is CLEAR. Every remaining board
  card is owner/people-blocked (PL-04 rodica; INC-02a/b, JP-role-defect,
  JP-mapping-frozen, INC-03, CANARY ivan; LE-ci-quarantine infra) or deferred
  (PL-03b, LE-resend). Launch gates open: G2 (Ivan: live-SMS env + UI-booked
  canary) and G8 (JP: lawyer RGPD sign-off). Open owner loose end: rotate the prod
  DB password pasted in chat during the apply window.

## 2026-07-30 - PL-10: agenda name-line compacted (owner feedback) (GREEN)

Owner feedback: the agenda patient name-line is too big, bold, and shows every
middle name ("Abilio Jose de Carvalho Fernandes" reflects all four). Rulings:
smaller font, remove bold to save space, show only first + last name.

- Change confined to `apps/web/app/agenda/agenda-grid.tsx` (`AppointmentName`):
  new exported `shortPatientName(fullName)` (<=2 words unchanged, >2 words -> first
  + last), typography `text-sm -> text-xs` and `font-semibold -> font-normal`, and
  render `shortPatientName(appt.patientName)` on the line.
- **Full name is NOT lost:** the W10-05/W12-33 hover popup is unchanged and still
  carries the full name + all detail. Disambiguation lives there; the grid line is
  just the compact face.
- **Scope guard:** agenda grid line ONLY. The Marcacoes row and the hover panel are
  deliberately untouched (owner named the agenda). `patients.full_name` is a single
  column (no first/last split), so the shortener parses the one string like the
  existing `firstName()`/`initialsOf()` helpers do.
- **Literal rule:** first token + last token. Smarter surname/particle handling
  (Junior/Filho) is a future loop if ever wanted - not decided here.
- Tests: agenda-grid.test.tsx 24 pass (helper unit + render shortened-on-face /
  full-in-hover + typography). Updated the W11-00 full-name assertion to the
  shortened expectation + a full-name-in-hover assertion. e2e de-risked (every
  agenda fixture is "Maria Silva", 2 words; CSS assertions check text-decoration,
  not font). Lint 0-err, typecheck clean, build ok.
- Self-merged on green per owner authorization (2026-07-30): non-migration,
  staff-facing UI, no agent-governing files. PR #704. Board: PL-10 card added
  (shipped). Owner visual gate on the Vercel preview / prod after deploy.

## 2026-07-30 - Dispatch reconciliation: the three "PL-08/09/10" loops from live testing

The owner dispatched three loops from live team testing under numbers that COLLIDE with
already-merged/applied work. Reconciled by CONTENT (the DoDs), verified against origin/main:

| Dispatch said | Actually is | Tracked as | State |
|---|---|---|---|
| PL-09 = appointment save blocked | new bug (PL-09 = location model, shipped) | **PL-11** | PR #705 DRAFT (migration 0049, apply-before-merge) |
| PL-10 = therapist self-booking | new UX (PL-10 = name-line #704, merged) | **PL-12** | PR #706 ready (owner visual gate) |
| PL-08 = notes thread; "PL-08b migration 0047" | PL-08 = Ativar-login (#691); notes = W12-13 (shipped); 0047 taken (patients RLS, applied) | **PL-13** | HELD - Q-PL-13-1 (append-only vs edit-stamps); backfill = 0050 not 0047 |

- Migration numbers: 0047 = patients RLS (applied), 0048 = appointments RLS (applied, #702),
  0049 = PL-11 appointments write-escape (this run, staged), next free = 0050.
- PL-11 root cause + fix: see the PL-11 DECISIONS entry on the PL-11 branch (appointments_rls
  lacked the created_by author escape 0047 has; a located admin/reception saving out of their
  clinic hit WITH CHECK). Failing->passing proven live; full DB isolation 452/452 on 0049.
- PL-12: therapist self-lock on the create form (non-migration); serviceOptions not narrowed;
  agenda read-scope (W10-04) untouched. Held for owner visual gate.
- PL-13 (notes): W12-13 is merged incl. the CI-guarded no-leak assertion. Remaining edit-stamps
  + profile-read-only items conflict with the shipped append-only immutable design; HELD on
  Q-PL-13-1. Backfill (0050) ready to build once the model is ruled.
- Run authorized by the owner (2026-07-30, "do as you recommend, I authorize decisions, I will
  review when I come back"). Migrations were NOT applied and migration/RLS PRs were NOT
  self-merged (doctrine, reaffirmed 3x); they halt for owner terminal apply.
## 2026-07-30 - PL-11: appointment save unblocked (appointments RLS created_by escape) + availability advisory

Reported by the live team (Lurdes): "appointment save blocked". Dispatched by the
owner as "PL-09", but PL-09 is the location-access model (shipped) - tracked as a new
loop PL-11 to avoid the number collision. Owner authorized an autonomous GREEN run.

- ROOT CAUSE (one line): the 0048 `appointments_rls` policy gates writes with the same
  location/ownership predicate it uses for reads and, UNLIKE the patients policy (0047),
  has NO `created_by = auth.uid()` escape - so a location-scoped admin/reception saving
  an appointment whose location_id is outside their staff_locations fails WITH CHECK, the
  INSERT...RETURNING is rejected, and createAppointment throws.
- CORRECTION to the dispatch theory: "therapist with zero availability_templates" is NOT
  the mechanism. evaluateAvailability returns {configured:false, covered:true} for zero
  templates (availability.ts:115-116), so findScheduleConflicts emits NO availability
  conflict. A zero-template therapist is not blocked by availability. The block is the
  appointments RLS write-scope; the availability ruling is a separate correct fix.
- PERMISSION MATRIX (from code) - appointment actions:
  - Capability (packages/auth/permissions.ts): appointments:read/write held by owner,
    admin, therapist, reception (all four). appointments:delete: owner/admin/reception.
    So "all active staff roles may create/edit appointments" already holds at the
    capability layer; the block was purely RLS row-scope.
  - RLS row-scope after 0049 (appointments_rls FOR ALL): owner=all in-tenant;
    therapist=own (practitioner_id|practitioner_2_id) OR authored (created_by);
    admin/reception=own-location (location_in_viewer_scope) OR authored (created_by) OR
    unassigned=>all (no-lockout); every role may CREATE (created_by=self on insert);
    cross-tenant denied (tenant_id top-level).
- FIX (migration 0049 `0049_appointments_write_created_by`): add
  `created_by = (select auth.uid())` to appointments_rls USING + WITH CHECK, mirroring
  0047 exactly. Only appointments_rls is replaced; no table/column/function touched;
  appointments_patient_selfscope (0010) intact.
- SEMANTIC CHOICE (owner ratify at apply, Q-PL-11-1): the escape is AUTHOR-specific,
  not a blanket write-open. Minimal reading of the ruling that preserves PL-09
  defense-in-depth (editing an appointment you did NOT author is still read-scope bounded).
- Availability made ADVISORY (owner ruling): blockingConflicts() (conflict-core.ts, pure)
  drops availability from the block set in createAppointment + rescheduleAppointment;
  therapist/room double-bookings and time_off still block (overridable via "Save anyway").
- REPRO (failing->passing, proven LIVE on local synthetic DB by swapping the policy on one
  DB): the 3 "located staff author out-of-scope save" assertions fail on the 0048 policy
  with `new row violates row-level security policy for table "appointments"`; pass on 0049.
  Full DB isolation suite 452/452 on 0049 (no cross-tenant/adversarial-escape regression).
- Gates green local: db:check-journal (49/49), lint (0 err), typecheck, DB suite (452),
  web unit (1401), web build (web app builds; portal build fails only on missing local
  NEXT_PUBLIC_SUPABASE_* env - pre-existing, green in CI, untouched by PL-11).
- MIGRATION -> apply-before-merge. PR opened DRAFT; HALTS for owner terminal apply +
  CYAN read, then merge. Located-admin E2E deferred (Q-PL-11-2; e2e seed has no
  staff_locations - the DB-isolation test carries the repro).

## 2026-07-30 - PL-11/12/13 landed + board reconciled to 26 cards (GREEN)

Closes the dispatch run and reconciles the board to it.

- PL-11 (#705) SHIPPED + APPLIED: migration 0049 applied to prod under
  apply-before-merge. The owner ran the terminal apply; the first attempt was a
  NO-OP (the prod-apply worktree could not checkout the PL-11 branch - it was held
  by another worktree - so db:migrate ran against main, which lacks 0049). Re-run
  from the worktree that owns the branch (osteojp-pl-11-appt-save) applied 0049.
  VERIFIED by independent read: appointments_rls now carries created_by in USING +
  WITH CHECK, and drizzle __drizzle_migrations count went 48 -> 49 (count-delta,
  not inferred - the 0046 lesson). Then merged. Appointment save unblocked for the
  located admin/reception case; availability advisory.
- PL-12 (#706) SHIPPED: therapist self-lock on the create form (non-migration UI).
  Self-merged on green per the owner self-merge authorization; owner visual gate on
  the deploy.
- PL-13 (#707 dispatch-note) HELD: the notes-thread edit-stamp DoD conflicts with
  the shipped append-only/immutable model. Blocked on the owner ruling Q-PL-13-1
  (keep append-only vs. add mutable edit-stamps + relax immutability). The 0050
  backfill is ready but coupled to that ruling. #707's DECISIONS/QUESTIONS merge
  conflict with main was resolved by UNION (both sides kept, nothing dropped).
- BOARD: added PL-11 (shipped), PL-12 (shipped), PL-13 (blocked_on_people/ivan);
  validator green (26 cards, 15 shipped, launch readiness unchanged 7/9 - none of
  these is a launch gate). Re-rendered and re-published to the maintained board
  artifact (83e26fe7, url= in place, never re-minted).
- NUMBERING: the dispatch used PL-08/09/10 which collide with shipped work; tracked
  by content as PL-11 (save bug), PL-12 (self-lock), PL-13 (notes) per the
  dispatch-reconciliation entry above.

## 2026-07-30 - PL-13: appointment notes made editable in place + last-edited stamp (GREEN)

Owner ruling (Q-PL-13-1): "make them editable with last-edited stamps" (the non-default
option; the recommended default was keep append-only). Built:

- **Migration 0050** (`0050_appointment_notes_editable`, apply-before-merge): add
  `edited_at` (NULL = never edited) + `last_edited_by` to appointment_notes, and add the
  missing in-tenant UPDATE policy (`appointment_notes_tenant_update`). DELETE stays denied
  (no policy) - editable, never deletable; created_at is never rewritten. UPDATE policy is
  TENANT-ONLY (like the 0026 SELECT/INSERT policies); the finer "who may edit" rule is
  app-layer.
- **`editAppointmentNoteAction`** (patients/actions.ts): patients:write + the same W10-04
  therapist own-patient re-check as the append path (loads the note's patient_id server-side,
  then getPatient applies therapistPatientScope); UPDATEs body + stamps edited_at +
  last_edited_by. Any staff with patients:write may edit (owner spec: "edit freely"), not
  author-only; last_edited_by records who.
- **Read + UI**: listPatientNotes returns editedAt/editedByName/editable (unified rows
  editable, legacy patient_note_revisions read-only). Profile Notas tab gets a pen affordance
  (NotesList client component) opening an inline editor, and shows "Editada por X · <datetime>"
  when edited. This is the surface the therapist named ("in the patient's appointment history,
  everything in one place"). The composer stays.
- **Scope**: NOT the legacy backfill (pre-W12-13 rows → editable = a separate 0051 follow-up,
  data migration with dedup risk, not needed for the core ask), and NOT converting the agenda
  drawer / Marcações popup into editable threads (they stay single-coalesced-note; out of the
  ruling).
- **Verification**: the two RLS tests that asserted UPDATE-denied updated to UPDATE-allowed
  in-tenant / denied cross-tenant / DELETE-denied, PROVEN against a local DB (supabase db reset
  applied 0050 clean; 102 RLS assertions pass on 127.0.0.1). Unit test for the edit action
  (therapist scope, trim, blank, reception). e2e edit-flow added to notes-unification.spec.ts
  (edit → stamp → survives re-read). Gates: typecheck (db+web), lint 0-err, web unit 1424,
  build, journal 50/50, supabase sync. Q-PL-11-1 also answered (keep author-specific escape).

## 2026-07-30 - PL-13 SHIPPED: 0050 applied+verified on prod, #709 merged (GREEN)

Migration 0050 applied to prod (dfotoodqvmjhbdcxyaxf) under apply-before-merge. The apply
used a DETACHED checkout of origin/notes/PL-13-editable-notes-stamps (git checkout
origin/<branch>) because the branch was held by another worktree - the exact fix for the
0049 no-op (a plain `git checkout <branch>` in the prod-apply worktree is rejected and
silently leaves you on main). Independent read verified: edited_at + last_edited_by columns
present, appointment_notes_tenant_update policy added, DELETE still denied, drizzle count
49 -> 50. CI all green incl. DB-gated RLS + the new Playwright edit-flow e2e. #709 merged;
edit UI deploys with the columns already on prod (DB-ahead window is safe - old app never
selected the new columns). Board: PL-13 -> shipped; artifact re-published.

## 2026-07-30 - Lurdes change request intake: PL-14, PL-15a, PL-15b, PL-16, PL-17 (GREEN)

Owner CR raised by Lurdes (admin @ Linda-a-Velha), scoped by GREEN into five board cards
before any build, per the intake rule.

- **PL-14 - implicit location.** RULING (from the CR, no ambiguity): a location-restricted
  staffer must never see a location CONTROL. One helper resolves the viewer's effective
  location set (viewerLocationScope); exactly one location -> no control at all, applied
  implicitly server-side, shown as a static label; more than one -> a picker restricted to
  that set; unrestricted viewer (owner / unassigned) -> full tenant picker unchanged. Swept
  across Agenda, Equipa, Marcacoes, Faturacao, the appointment drawer and Horarios. Two live
  defects folded in: the Equipa picker is fed the TENANT-wide location list (it offers CB to
  an LV-only admin), and the Agenda therapist dropdown is deliberately unscoped (16 staff
  incl. CB-only therapists). The therapist filter is re-based on staff_locations (0038)
  rather than availability_templates, which the PL-09 comment deferred as "Phase 1b".
- **PL-15a / PL-15b - patient location.** The CR's "why does Lurdes not see all patients"
  traces to the create-patient form never sending primaryLocationId: the column (0045), the
  validation and the createPatient action all accept it, only the UI is missing, so every
  patient created since 0045 is NULL-located and visible only to its creator + owner until a
  located appointment exists. Evidence before build (PL-15a, read-only prod script run by the
  owner), then PL-15b adds the field (auto-set for single-location staff, per PL-14),
  surfaces the location in the list + ficha, and backfills the NULL remainder from the most
  recent appointment. Zero-appointment patients are NOT guessed - they go to the owner
  (Q-PL-15-1).
- **PL-16 / PL-17 - notes.** PL-13 shipped the editable thread on the patient profile only
  and explicitly left the drawer and the Marcacoes popup as a single coalesced note; the
  owner re-raised those surfaces, so they are now their own cards. No migration: every save
  already APPENDS an appointment_notes row, so the thread exists in data and is merely not
  rendered. PL-16 renders it in the booking panel (Adicionar nota + stamped board, reusing
  NotesList/NotesComposer, no fork). PL-17 covers the other three surfaces: a Notas button
  per Marcacoes row, the agenda hover pinned to the LATEST note, and a ficha note that names
  and links to its marcacao (needs appointmentId in the note projection; column exists).

## 2026-07-30 - Lurdes CR built and shipped: PL-14, PL-15b, PL-16, PL-17 (GREEN)

All four non-migration cards from the intake shipped the same session, self-merged on
green CI per the owner's standing authorization. #713, #714, #715, #716 on main.

- **PL-14 (#713)** - the implicit-location rule is now ONE pure module
  (lib/auth/location-choice.ts) applied to seven surfaces. A control renders only when
  it offers more than one real choice; a single-clinic viewer gets no control and the
  server pins the id, so removing the control also removes the `?location=` shortcut.
  Two live defects closed on the way: the Equipa filter was fed the TENANT-wide location
  list (that is how an LV-only admin was offered Castelo Branco), and the Agenda
  therapist dropdown listed every staff member including CB-only therapists. "Assigned"
  is now working hours UNION staff_locations - the hours-only derivation covered 5 of 11
  members, so it was hiding most of a real team behind a specific-location view.
  DELIBERATELY UNCHANGED: the Gerir modal's membership checkboxes, because
  setStaffLocations writes exactly the posted set and a narrowed list would silently
  drop a member's other-clinic membership.
- **PL-15b (#714)** - the patient form now writes primary_location_id. The column, the
  validation and createPatient have accepted it since 0045/R16; no UI ever sent it,
  which is the whole cause of "Lurdes sees 4 of 7". updatePatient accepts it too now, so
  a mis-filed or location-less patient is fixable from the UI. The migration half (0051
  backfill) stays open and apply-before-merge.
- **PL-16 (#715) / PL-17 (#716)** - the note thread the data has held since W12-13 is
  now rendered everywhere it belongs: the booking panel (board + "Adicionar nota"), a
  "Notas" button per Marcacoes row, the agenda hover labelled as the LATEST of N, and a
  ficha note that names and opens its marcacao. No migration for any of it. packages/ui
  Dialog gained optional confirm props so a present-only popup has one dismiss button.

**Verification note worth keeping.** Two E2E lessons this session. (1) A Playwright run
on the PL-14 branch failed four unrelated specs with 2-minute timeouts; a rerun with NO
code change passed clean - degraded GitHub runners, the same condition that quarantined
therapist-blocks.spec.ts:97. Do not "fix" code on one red E2E run without a rerun.
(2) The opposite also happened: PL-15b's required clinic field broke ~10 specs for a
REAL reason (the shared fillPatientForm helper did not fill it). Red E2E is only
informative when you read which assertion failed - infra flake times out, a real
regression fails an assertion the same way every retry.

## 2026-07-31 - Reception change-request intake: PL-18 through PL-25 (GREEN)

Owner handed over seven items raised first by reception and then broadened by him. Written as
eight board cards BEFORE any building (PL-21 and PL-22 are one ask split in two, because one
is an improvement to a shipped form and the other is a new feature that consumes it). Every
card carries what a READ of origin/main established, not what the report assumed - three of
the seven turned out to have a different cause than the report implies:

- **PL-18 (reception location-pinning)** is very likely NOT a missing rule. viewer-locations.ts
  already returns the staff_locations set for reception and admin identically, and getAgendaOptions
  already narrows both the location list and the therapist roster on that scope (PL-14). What
  produces "sees both clinics, sees all staff" is the deliberate FALLBACK: no assignment ->
  scope `null` -> unrestricted. A staged read-only prod script confirms this before any code
  is written, and the audit + the Equipa warning ship regardless. Q-PL-18-1 logged.
- **PL-20 (NIF)** - the declaracao dialog ALREADY prefills from patients.nif (W12-24). It
  renders an editable input seeded with the stored value, which is what reads as "asking
  again". The fix is the PL-14 shape applied to patient data: known -> static line, unknown ->
  asked once and written BACK, never asked a third time.
- **PL-21 (agendar lote)** - the batch ENGINE is not the limit. batch.ts has accepted an
  explicit per-slot list since W2-09, built for exactly this Rodica case. The limit is the
  form, which exposes only "every N weeks" + a count. So a generator + UI change, not a
  scheduling-engine change, and PL-22 (bloquear lote) reuses the same generator over time_off.

Migration count for the batch: exactly ONE (PL-23, the insurance numbers column), sequenced
after the already-carried 0051 backfill since only one migration is ever in flight. PL-24
needs none (sex is a free varchar, no DB enum). PL-25 is half code (aligning the slot grid to
the hour) and half data (the per-location granularity), and only the data half is gated.

Owner authorised self-merge on green required checks for this batch. Migrations and prod
writes stay hard-gated as always.

## 2026-07-31 - Reception CR built and shipped: PL-18 through PL-25 (GREEN)

Eight cards from the 2026-07-31 reception change request, written to the board first (#719)
and then executed one PR per card, self-merged on green CI under the owner's standing
authorization. The migration card is the single exception and stays owner-gated.

**Three of the seven reported items had a different cause than the report implied.** Recording
that here because the pattern repeats: a user describes a SYMPTOM accurately and infers a cause
that the code does not support, and building the inferred fix would have added a second
mechanism beside a working one.

- **PL-18 (reception sees both clinics).** No missing rule. `viewerLocationScope` has covered
  reception and admin identically since PL-09; `getAgendaOptions` narrows both the location list
  and the therapist roster (PL-14); the team-schedule editor already drops its per-day select at
  one clinic; `/admin` is unreachable by reception. The reported screen is the deliberate
  no-assignment FALLBACK: zero `staff_locations` rows -> scope `null` -> "not location-
  restricted" -> every clinic, every colleague. Shipped the thing that was actually missing: the
  fallback is no longer silent (Equipa flags it). Read from `staff_locations`, NOT from the
  Equipa location chips - those are hours UNION staff_locations, so an admin with working hours
  displays a clinic chip while the scope still falls back to all. The chips answer "where does
  this person work"; the warning answers "what does the platform restrict them to". Q-PL-18-1
  carries the policy question (keep the fallback, or require an assignment at account creation).
- **PL-20 (declaracao asks for the NIF again).** It already prefilled from `patients.nif`
  (W12-24). What reads as "asking again" is rendering an editable box seeded with a known value -
  and the same box looks plainly empty for a patient whose NIF was never captured, so one control
  meant two different things. Fixed with the PL-14 shape: known -> shown, unknown -> asked once
  and written BACK. The write-back is re-decided server-side from the stored row (never from the
  client's belief) and fills an EMPTY field only, so a one-off NIF typed onto a single
  declaration cannot rewrite a patient's fiscal number.
- **PL-21 (agendar lote too limited).** The batch ENGINE has accepted an explicit per-slot list
  since W2-09 - built for exactly this Rodica case. The limit was the FORM, which exposed only
  a count and an every-N-weeks step. So a generator + UI change, no scheduling-engine change,
  and PL-22 reuses the same generator over `time_off`.

**Sweep results worth keeping, because they are the answer to "is that all?"**

- PL-20's sweep for other forms that re-ask stored patient data found exactly ONE (the
  declaracao NIF). Faturacao reads name/NIF/address from the patient through the InvoiceXpress
  mapper; the RGPD form and ficha medica are generated from the record; Reagendar and Marcar
  novamente already reuse the marcacao's own therapist and location.
- PL-24's audit found the clinical `general-anamnese-v1` form template still offers "Outro" for
  sex. Deliberately NOT changed: form templates are immutable once a clinical record references
  them (hard rule 5), so that needs a new template version and its own card.

**PL-25 needed two changes, not one.** The per-location step (0041) is necessary but not
sufficient: `listOpenSlots` started its series at each template's own `start_time`, so a
therapist beginning at 09:30 produced 09:30/10:30/11:30 at a 60-minute step - an hourly cadence
that never lands on an hour. The grid is now midnight-ALIGNED, rounding UP so a generated start
can never precede the therapist's declared hours (rounding down would advertise a slot
`availabilityCoversExists` then rejects at confirm - the exact disagreement that query exists to
prevent). Verified against a real PostgreSQL 17.6 rather than asserted. The VALUE became an
admin control (Admin -> Localizacoes) rather than a prod UPDATE: nothing in the product could
set `slot_granularity_min`, so "make booking hourly" would otherwise have meant hand-writing to
prod. Two choices only, 30 and 60; 15 is absent because ":15" is what the CR removes and a
control that can re-create the reported problem is not worth having.

**Migration discipline.** Exactly ONE migration in the batch (0051, PL-23's insurance column).
It took 0051 because the PL-15b `primary_location_id` backfill reserved that number but was
never built; the backfill becomes 0052. Numbers follow build order, not reservations. PL-22's
"undo a batch as a unit" was NOT built for the same discipline: it needs a `batch_id` column on
`time_off`, a second migration, and only one is ever in flight.

**Dead code removed rather than left beside its replacement.** `generateLoteDates` was a strict
subset of `generateLoteSchedule` (`weekdays:[n]` + a count reproduces it exactly, asserted in
the new suite), so it went rather than becoming a second way to say the same thing.

**Migration 0051 APPLIED and VERIFIED on prod 2026-07-31** (owner ran it from the
osteojp-prod-apply worktree, detached at `origin/feat/PL-23-patient-insurance-numbers`; GREEN never
touched prod). Independent read, pasted rather than inferred: column `jsonb`, `nullable=NO`,
`default='[]'::jsonb`; the array CHECK constraint present; **10 patient rows, 0 with a NULL**;
`drizzle.__drizzle_migrations` count 51 as expected; last hash
`9adc86ad8eab1e96503aafefe4d4121247f6e93663cfcbd6b163a5517fd311b0`. Only then was #726 merged.

**One CI catch worth recording, because it is the case the doctrine exists for.** PL-20's Playwright
run failed `declaracao.spec.ts` on ALL THREE attempts with the same assertion - the signature of a
real regression, not the degraded-runner flake. The spec asserted the W12-24 contract (the patient's
NIF arrives PREFILLED INTO AN EDITABLE BOX), which is exactly what PL-20 removes, since that box is
what reads as "the declaracao asks for the NIF again". The fix was to update the spec to the new
contract, not to weaken the feature - and it exposed that the write-back had no action-level tests
at all, which is the riskier half since it writes to patient records. Four were added: saved when the
record was empty, NEVER when it already held one, no patient read at all when no NIF was supplied,
and the document still returned when the write-back fails. Two other specs failed in the same run
(`agenda-cards`, `marcacoes-tab-edit`); neither touches anything PL-20 changed and both passed on
sibling PRs off the same base, so they were treated as flake and cleared on rerun.

## 2026-07-31 - PL-27: a stale capability gate hid an existing control from reception (GREEN)

Owner report immediately after the reception CR shipped: reception has neither the agenda's
"Bloquear horário" button nor batch blocking. His own diagnosis was exactly right -
*"it's something existent but not visible on their interface"*.

**Root cause, and the lesson worth keeping: a capability gate outlived the capability it named.**
`agenda/page.tsx` gated the control on `settings:manage`. That was CORRECT when W12-28 shipped it,
because blocks were a settings-tier action then. PL-09 Phase 5 created the explicit
`schedule:manage` capability, granted it to reception ("reception OWNS scheduling for their
location's therapists"), and moved every `time_off` write onto it. The server followed; the UI
check did not. Worse, the UI's own comment asserted the two were *"the SAME capability
createTimeOffBlock server-enforces"* - a statement that was true when written, became false, and
was never re-read. Reception has been able to block time server-side ever since PL-09; nothing in
the agenda ever offered it to them.

The fix is one line plus the comments that were lying. The test added is deliberately an
INVARIANT, not a symptom check: whoever may WRITE a block is who may SEE the control. A future
regate has to break a test rather than silently hide a control from the role that needs it.

**Second half, and a scoping lesson about where a feature lives.** PL-22 shipped bulk blocking
that day - into the per-therapist "Bloquear horário" modal on Horários/Equipa. That satisfied the
card and still left the owner correctly reporting the feature as missing, because the agenda is
where the day is actually managed and the agenda offered single blocks only. Shipping a capability
into a surface nobody uses is not shipping it. The agenda dialog now offers "Repetir bloqueio"
through the SAME `generateLoteSchedule` + `createTimeOffBlockBatch`, so all three recurrence forms
behave identically and none can drift.

No migration, no capability change, no relaxed guard: the server still re-asserts
`schedule:manage` AND the location scope, so reception can only ever block a therapist at their
own clinic.

## 2026-07-31 - Session close: final board pass, and two diagnoses corrected (GREEN)

Session shipped ten PRs (#719-#730): the eight-card reception CR, PL-27, and the CI un-quarantine.
Board closes at 42 cards, 30 shipped. **Launch readiness moved 7/9 -> 6/9, and that is not a
regression in the product** - see G3 below.

**Two wrong diagnoses corrected, both the same shape: a symptom read as infrastructure.**

1. **The reception CR itself.** Three of seven reported items had a different cause than the report
   implied (recorded in the earlier entry today). The pattern: a user describes a symptom
   accurately and infers a cause the code does not support.
2. **The e2e quarantine (2026-07-27).** `therapist-blocks.spec.ts` was quarantined as "GitHub
   runners degraded, 7s -> 186s". Re-enabling it failed CI three times for three IDENTICAL minutes
   and the Playwright artifact named the real cause: *"element is not stable ... element was
   detached from the DOM, retrying"* for the full 180s. Every write in that spec is a server action
   ending in `redirect("/admin/staff?m=<code>")`, and the test waited with
   `waitForURL(/admin\/staff/)` - a pattern the CURRENT url already satisfies. It waited for
   nothing, then clicked into the outgoing DOM. Locally the race is won (7s); on CI it was lost
   every time. The 186s was never a 26x slow runner, it was one click burning its budget.
   **Lesson: "passes locally, times out on CI" is a RACE until proven otherwise - read the artifact
   before blaming the runners.** The quarantine cost four days of that test not running, during
   which PL-14, PL-18 and PL-22 all changed the exact surface it covers.

**G3 re-opened (readiness 7/9 -> 6/9).** Auditing the board for accurate status surfaced a
credential exposure tracked nowhere in the repo: the prod DB password was pasted into a chat on
2026-07-30, one day AFTER G3's rotation evidence. The gate certified a property that had since
become false. GREEN flipped it to fail and opened `INC-04-prod-db-password-exposed` (Q-SEC-1). This
is the owner's risk call to reverse, but the board should not make it silently - and the reason it
survived two sessions is precisely that it lived in an assistant memory note instead of a card.

**PL-27, and a scoping lesson.** PL-22 shipped bulk blocking into the per-therapist modal on
Horários/Equipa the same day the owner reported bulk blocking as missing. Both were true: the
capability existed, and it existed nowhere near where reception works. Shipping a capability into a
surface nobody uses is not shipping it. The same report also exposed a capability gate that had
outlived the capability it named (`settings:manage` on a control the server guards with
`schedule:manage`), hiding an existing feature from the only role whose job it is.

**Left for the owner, in priority order:** G2 (the reminder canary - the one launch gate he can
close alone), INC-04 (rotate the exposed credential), G8 (JP's RGPD sign-off), then the staged
read-only script that answers PL-15a and PL-18 in one paste.

## 2026-08-02 - PL-28: the board portal showed a stale board with no warning (GREEN)

Owner screenshot: the portal listed PL-18..PL-25 as TO DO with "no evidence yet" and Shipped 22,
while main had all eight shipped with PR evidence and Shipped 30. He reviews every piece of work
through this artifact, so for two days he was reading a board that said nothing had shipped.

**Root cause.** `seedIsNewer()` compared `as_of` DATES: `SEED.as_of > board.as_of`. All four
publishes on 2026-07-31 carried `as_of: "2026-07-31"`, so the comparison was false every time and
the "newer board" notice never rendered. Compounding it, the **"Load the new board" button lives
inside that notice** - so the one control that would have fixed it was unreachable. The only
remaining escape was the footer's "Discard local changes", which also throws away the owner's own
edits (he had 23).

**A date cannot express "changed again today."** That is the whole defect: a freshness check keyed
on a human-scale date fails silently at human working speed, and fails in the direction that looks
like nothing is wrong.

**Fix.** `render-board.mjs` stamps a sha256 fingerprint of the published JSON into the seed island;
the portal records which publish a browser's snapshot came from (`__basedOn`, kept beside the board
so it never leaks into an Export or a diff); staleness is fingerprint inequality, which catches any
change - a status, an evidence ref, a note - same day or not. Derived at render time so nobody has
to remember to bump it, which is exactly how this bug happened. A pre-fix snapshot has no recorded
provenance and is treated as STALE, so any stranded browser is offered the new board on first load.
Adopting the seed adopts its fingerprint too, or the notice returns on the board the user just
chose.

**Verified in a real browser**, against a reproduction of the owner's exact state (Shipped 22, same
`as_of`, no provenance): the notice appears where it previously did not; "Load the new board"
clears it and survives a reload at Shipped 30; and a CURRENT snapshot carrying local edits is not
falsely flagged, with the edits preserved.

Second self-inflicted bug in two days from the same family as the e2e quarantine: a check that was
true when written, quietly stopped being true, and reported success while doing nothing. Version by
content, not by calendar.

## 2026-08-02 - The prod read disproved my own PL-18 diagnosis (GREEN)

The staged read-only script finally ran. It corrected three things GREEN had asserted, which is
exactly what it was staged to do - and the most important correction is against GREEN's own
conclusion.

**PL-18's diagnosis is wrong.** Every ACTIVE reception and admin already holds a `staff_locations`
assignment (Carlos LV, Raquel CB, Tamara CB, Lurdes LV, Tiago CB). The no-assignment FALLBACK that
PL-18 blamed never fires for any of them. The script said so in its own output, because it was
written to be able to prove GREEN wrong, and GREEN committed in the PR that this outcome would
reopen the audit. Reopened as PL-29. The shipped deliverable (Equipa flags an unassigned
reception/admin) remains correct and useful; only the explanation was wrong.

A second theory - that RLS denies reception the read of `staff_locations`, so the scope silently
collapses to "all" - was checked BEFORE writing it down, and is also dead: 0038's
`staff_locations_select` is tenant-wide `TO authenticated`. Two theories, both disproven by
evidence rather than by argument. **GREEN will not guess a third time**; PL-29 asks for one
observation (what one reception account actually sees) instead.

**Both clinics were already hourly.** GREEN told the owner they sat at 30 minutes and needed
switching. Prod says both were already at 60. That claim came from the 0041 migration DEFAULT, not
from reading prod - inference presented as fact.

**The PL-25 alignment fix was load-bearing, not theoretical.** Linda-a-Velha has 10 active
availability templates starting at 08:30 and 13:30. At a 60-minute step without alignment those
emitted 08:30 / 09:30 / 10:30 - hourly cadence never landing on an hour, the exact trap PL-25
describes, live in production. Castelo Branco has zero off-hour starts.

**Two staged scripts carried the same latent bug.** Both queried `users.role`; the permission role
is `users.role_id -> roles.slug`. The PL-15a script was staged 2026-07-30 and never run, so the
error sat undetected and GREEN copied the pattern into the PL-18 script on 2026-07-31 while
treating the earlier script as proven. Both fixed. **A staged script that has never been executed
is not evidence of anything, including its own correctness** - and reusing its patterns propagates
whatever is wrong with it.

**Q-PL-24-1 closed by data:** zero patients store sex = 'other'.

 chore/twilio-smoke-no-vercel-pull
## 2026-08-02 - Two handoff premises corrected: the Resend domain, and the osteojp.pt root MX (GREEN)

Both corrections are to premises carried in the session handoff, not to shipped code. Every
DNS claim below was re-derived from live read-only `dig` on 2026-08-02, not taken from the
handoff or from repo docs.

- **CORRECTION (a) - "Resend DNS lives on send.osteojp.pt, email test unblocked" was FALSE
  when written.** No Resend domain existed at all until 2026-08-02. The repo agreed with
  that the whole time and the handoff contradicted it: `docs/email-templates-reminders.md`
  and `docs/email-templates-post-visit.md` both say "pending Resend domain verification";
  Q-W6-02-1 and Q-W7-01-1 both carry "the osteojp.pt sending domain must be verified in
  Resend" as an UNMET prerequisite; `docs/cutover-runbook.md` line 59 still has the unchecked
  `[IVAN]` box for it. The domain was created on 2026-08-02 and is **now Verified, region
  eu-west-1, in the `a-and-i-automation` Resend workspace**. Independently confirmed by live
  DNS: `send.osteojp.pt` MX -> `feedback-smtp.eu-west-1.amazonses.com`; `send.osteojp.pt` TXT
  -> `v=spf1 include:amazonses.com ~all`; `resend._domainkey.send.osteojp.pt` TXT -> DKIM
  public key present. So the premise is now true, but it was not true when it was used as a
  premise, and anything reasoned from it before today must be re-checked.
- **(a) consequences the handoff did not carry.** (1) The verified sending identity is the
  SUBDOMAIN `send.osteojp.pt`, not the root `osteojp.pt` that every doc names, so
  `REMINDERS_EMAIL_FROM` must be an address at the verified identity - the docs' "a verified
  osteojp.pt sender" is now imprecise and will fail if taken literally. (2) The runbook's
  DKIM check `dig CNAME em._domainkey.osteojp.pt` is wrong on both host and record type; the
  real record is a TXT at `resend._domainkey.send.osteojp.pt`. (3) "Email test unblocked"
  overstates it: DNS is unblocked, the send path is not. `RESEND_API_KEY`,
  `REMINDERS_EMAIL_FROM` and `INVITES_LIVE_SEND` (invites) / `REMINDERS_LIVE_SEND`
  (reminders) are still unset, and the board records invite-email delivery as DEFERRED
  post-launch by owner decision (2026-07-28, re-confirmed 2026-07-31). Domain verification
  removes one precondition; it does not make the test runnable.
- **CORRECTION (b) - the root MX is NOT Google Workspace. It is also not literally Outlook.**
  The handoff's Google Workspace claim is disproved: there is no `aspmx.l.google.com` (or any
  Google host) on `osteojp.pt` at any priority. But the correction as filed ("points at
  Outlook") does not match the RRset either. Live read-only `dig`, 2026-08-02:
  - `osteojp.pt` MX -> `10 a1.spambusters.email`, `20 n1.spambusters.email`, `30 a2.spambusters.email`
  - `osteojp.pt` TXT -> `v=spf1 +a +mx +ip4:62.233.41.48 include:_spf.spambusters.email include:_spfnv7.serverhs.org ~all`
  - `_dmarc.osteojp.pt` -> `v=DMARC1; p=none;`

  All three MX priorities are **spambusters.email**, a filtering gateway. Outlook is
  plausibly the mailbox BEHIND that gateway - the standing ruling in
  `docs/design/DECISIONS.md` (2026-07-21, "MX / email migration POSTPONED INDEFINITELY")
  records that staff stay on webhs + Outlook - but the gateway is what the MX record
  resolves to, and no `*.mail.protection.outlook.com` host appears anywhere in the zone.
  Correct statement of reality: **root MX = spambusters.email (filtering gateway), mailbox
  behind it unchanged per the 2026-07-21 parked-migration ruling; Google Workspace is not
  and has never been in this zone.**
- **(b) consequence: "spambusters MX on the root" is CURRENT REALITY and must NOT be
  reconciled away.** A repo-wide grep (`*.md`, `*.json`, `*.ts`, `*.mjs`) returns ZERO hits
  for `spambusters`, `google workspace`, `gsuite` or `g suite`. There is nothing in the repo
  asserting Google Workspace, so there is no in-repo Google Workspace claim to correct - that
  claim exists only in the handoff. The docs that ARE stale against live DNS are different
  ones, listed below.
- **Stale DNS docs found while verifying - FIXED in the same PR (owner instruction).** The
  runbook's DKIM check would have burned another session on its own, and a doc naming the
  wrong DNS provider is actively misleading, so these were corrected rather than logged as
  debt. (1) `docs/dns-records-pending.md` rewritten: it claimed the provider was Webhs on
  `ns1.webhs.org` / `ns2.webhs.org` (live NS are `aster.dns-parking.com` /
  `helios.dns-parking.com` - Hostinger, so there is no Webhs panel to make changes in), and
  listed `app.osteojp.pt` as pending when it resolves live to `cname.vercel-dns.com`. It now
  carries the live-vs-pending split, the root-vs-`send.` separation, and an explicit "do not
  change the root MX". (2) `docs/cutover-runbook.md` §1.2: dropped the Webhs framing, replaced
  the A-record table with the CNAMEs actually in use, corrected the DKIM row (TXT at
  `resend._domainkey.send.osteojp.pt`, not CNAME at `em._domainkey.osteojp.pt`), and re-pointed
  the Resend checkbox at `send.osteojp.pt`. `patient.osteojp.pt` is the only host still
  unresolved; `app` and `api` are live. (3) `docs/architecture.md` (lines 488, 557),
  `docs/SPEC.md` line 269, both `email-templates-*.md` sender lines, `docs/QUESTIONS.md`, and
  Q-W6-02-1 / Q-W7-01-1 in `docs/design/QUESTIONS.md` all corrected from
  "a verified osteojp.pt sender / pending verification" to the Verified `send.osteojp.pt`
  identity, each stating that an `@osteojp.pt` From will be rejected.
- **Deliberately NOT edited: the append-only logs and the historical records.** Earlier
  entries in this file and in `docs/design/DECISIONS.md`, the wave-07 loop files, the
  2026-07-23 status report and the handoff docs still contain the old "pending osteojp.pt
  verification" wording. They are records of what was believed at the time and are corrected
  by appending (this entry), never by rewriting. `docs/board/prelaunch-board.json` also
  carries the old wording in a card note; the board was left untouched because editing it
  requires the validator + portal republish, and the owner ruled no board card for this work.
- **Method note, per the standing lesson.** The 2026-07-31 close recorded that reported
  causes were wrong four times and that claims must be verified before building on them.
  Both premises here were verified against live DNS before this entry was written, and one
  of the two corrections supplied (b) was itself partly wrong. Handoff premises are
  hypotheses until re-derived.

## 2026-08-02 - #735 merged green; my un-quarantine claim retracted (GREEN)

**#735 (patient JWT verification + rate limiting) merged on fully green CI**, all eight checks
SUCCESS. The red run the owner saw predated the fix: the branch was auto-updated with main at
19:24, main by then carried #739's re-quarantine, and the fresh Playwright run passed at 20:07.
The security PR never broke anything - it was blocked by an unrelated test.

Recorded as `SEC-W1-patient-jwt-verify`. Not GREEN's work, but it belongs on the launch record: the
patient API trusted the identity token a caller presented WITHOUT verifying its signature, so anyone
could mint a token naming any patient and read that patient's clinical data. The code claimed RLS
would catch it; RLS resolves the patient identity from the same unverified token, so it compared the
forgery against itself and agreed. That matters directly to the owner's next block of work, since
the patient portal is the one surface reachable by non-staff.

**`LE-ci-quarantine-reenable` is retracted from shipped.** I marked it shipped on #730 and that was
wrong - the quarantine is back on main via #739.

**The error was my standard of proof, not my diagnosis.** I shipped #730 on ONE green CI run with
retries enabled, and wrote in the PR that the run was the proof. For a racy test that is worthless:
retries mask exactly the failure under test, and one sample cannot distinguish "fixed" from "lucky".
A parallel session measured it the right way - the spec alone, twice each, at `--retries=0`, on
clean `origin/main` AND on an unrelated `apps/api` branch - and all four failed with the same detach
race. Failing on CLEAN MAIN is the decisive fact: the cause is in the spec or the surface it drives,
not in any pending branch. `settleAfterWrite` fixed the writes I could see; something else on that
surface still remounts.

The new exit condition (from #739, stricter than mine): **two consecutive green runs at
`--retries=0`**.

This is the third time in two days the same shape has bitten: a check that looked true, was believed
without adversarial measurement, and reported success while the thing it described was false. The
first two were the stale capability gate and the date-based board freshness check. **One green run
is not evidence for anything that can race.**

Also opened `LE-marcacoes-tab-edit-flake`: PL-02 (a) has now failed on three separate CI runs across
unrelated branches, with a "dialog does not close after save" signature that looks like the same
family as the therapist-blocks race. Deliberately NOT diagnosed yet - it gets reproduced at
`--retries=0` first, per the lesson above.
 main

## 2026-08-02 - Board clear-out: owner ruled on all 14 open items (GREEN)

The owner answered every open question in one pass. Board goes from 15 open cards to 7; readiness
returns to 7/9. Eight cards closed, and three of them closed on real evidence rather than
attestation.

**Closed on evidence, not assertion:**
- **JP-role-defect + INC-03** - JP is `owner` on prod, printed by TWO independent read-only runs the
  same day. The latent 0045 admin-write denial no longer applies to him. He remains bookable as a
  therapist through `is_bookable`, which is exactly the decoupling PL-06b argued for: role governs
  authorisation, `is_bookable` governs presence in the booking dropdown.
- **PL-15a** - fully diagnosed from the owner's pasted output, and none of the three named patients
  is an outstanding defect. Alfredo and Maria now carry LV (PL-15b fixed the cause on 2026-07-30 by
  making the patient form write the clinic). Joao is a Castelo Branco patient and is invisible to an
  LV admin BY DESIGN - the access model working, not a bug. Only 2 of 10 patients still lack a
  clinic; one stays visible via an appointment, the other is a synthetic row. **Q-PL-15-1 is moot:
  the only unbackfillable patient is test data.**
- **PL-29** - reception scoping verified correct against a real reception account. Both GREEN
  theories were wrong AND there was no defect to find. The 2026-07-31 report described the pre-PL-14
  state; PL-14 merged one day earlier and had not been re-checked. Asking for one observation
  instead of guessing a third time was the only thing that resolved it.

**Closed by owner ruling, recorded as rulings and not dressed up as work:**
- **INC-02b** - no purge; testing continues on prod under the owner's green light. FLAGGED: G4 reads
  "prod free of synthetic data" and states pass, which cannot be literally true while sanctioned
  testing continues. GREEN has not flipped G4 (the owner sanctioned it, and it is pre-launch) but
  **G4 must be re-verified at cutover.**
- **INC-02a** - not doing the safe-test-target work; platform changes are closed and focus has moved
  to the client portal. The root cause of the repeat synthetic-data incidents is therefore unchanged
  and now an accepted risk.
- **PL-04** - NESA is now a service at both clinics, so the report cannot recur at CB.
- **JP-mapping-frozen** - closed; `is_bookable` already delivers it.

**G3 returns to PASS by risk acceptance, not by a new rotation.** The owner accepts the chat
exposure and will rotate every password and token once the work completes. Recorded explicitly so a
future reader does not mistake the pass for "never exposed". INC-04 deliberately stays OPEN:
accepting a risk is not removing it, and the owner's scope is broader than this one credential.

**Question-log housekeeping.** Six headings still said OPEN while their own body had answered them,
because answers were appended as new entries rather than editing the heading. The file disagreed with
itself and any open-count read from the headings was wrong. Corrected, with the settled state written
out. Two questions remain genuinely open and both are GREEN's own work (Q-PL-11-2, Q-PL-14-1), not
owner decisions.

**Remaining 7 cards:** 2 owner-side (CANARY-reminder in flight = G2; INC-04 the owed rotation), 3
deferred by decision (PL-03b held, LE-resend post-launch, PL-26 post-launch), and 2 CI defects that
are GREEN's to fix (the therapist-blocks race, the marcacoes-tab-edit flake).

## 2026-08-02 - therapist-blocks un-quarantined, on evidence this time (GREEN)

Two consecutive CI runs at `--retries=0`, with the test genuinely executing (verified in the job
logs, not inferred from a green tick): **21.9s and 21.0s**, against the 180s timeout it used to burn.
Runs 30771682260 and 30771875084. #739's exit condition is met exactly as written.

**Root cause.** Every write in the spec is a server action ending in
`redirect("/admin/staff?m=<code>")`, and /admin/staff is an expensive render - staff, services,
primaries, availability, locations, memberships, plus one time-off query PER member. Re-opening the
modal by CLICKING into that page while it was still committing the post-redirect render let
Playwright resolve the button in the outgoing tree while the incoming render detached it mid-click.
Locally the page settles in milliseconds and the race is always won (~7s); on a CI dev server
compiling routes on demand it was lost every time. The fix is a full `page.goto` before opening: a
navigation is unambiguous, the page is loaded or it is not.

**Three corrections this closed, all of the same shape.**
1. The 2026-07-27 diagnosis ("runners degraded") was wrong. It was always a race.
2. My 2026-07-31 lift was wrong - not the diagnosis, the STANDARD OF PROOF. One green run at
   retries=2 proves nothing about a race, because retries mask the exact failure under test.
3. The proving mechanism itself was broken before first use: a manual run had no `pull_request`
   context, so the docs-only heuristic classified it as docs-only, skipped all 16 gated steps, and
   would have reported **SUCCESS having executed nothing** (#750). I would have read that green tick
   as proof.

That third one is the same failure mode as the stale capability gate (PL-27), the date-based board
freshness check (PL-28), and the test that waited on a condition already true (PL-30 itself):
**something reporting success while doing nothing.** Four instances in three days. The only thing
that caught any of them was checking the mechanism rather than trusting its output.

**Remaining GREEN work: one card** - `LE-marcacoes-tab-edit-flake`, deliberately not diagnosed yet,
to be reproduced at `--retries=0` first.

## 2026-08-03 - marcacoes flake root-caused from the artifact; GREEN's column is empty (GREEN)

The last GREEN card closed, and the answer was **none of the three theories** anyone (including me)
had formed. The Playwright artifact named it in plain text:

> `O terapeuta nao tem horario de trabalho definido neste dia.` + a `Guardar mesmo assim` button

The save was never slow and never conflicted. It was **advisory-gated**. PL-11 deliberately made
availability WARN rather than BLOCK, so booking a therapist on a day they do not work keeps the
drawer open awaiting an explicit confirm. The `book()` helper clicked Guardar once and asserted the
drawer had closed.

**It was never random - it was date-dependent.** `bandDay()` derives a calendar DATE, so
`RUN_DAY_BASE + 45` lands on a different WEEKDAY depending on when the suite runs. On a weekday the
seeded therapist works, one click saves; otherwise the advisory appears. The +100-day retry offset
shifts the weekday by two (100 mod 7), which is why attempt 2 passed. **The retry changed the INPUT
rather than re-running the test** - which is why a week of green retries said nothing, and why it
would have failed reliably on certain calendar dates and never on others.

Fixed by confirming the advisory when present, mirroring the user and the pattern already in
agenda-cards.spec.ts. Verified locally at `--retries=0`: 9 passed.

**The lesson, now three-for-three this week.** therapist-blocks, therapist-self-lock and this one
were each mis-diagnosed by reasoning and each solved in minutes by reading the artifact, which
states the cause outright. Every theory formed before reading it was wrong - including "runners
degraded", "752 cannot have caused it", "it leaves a Maria appointment behind", and "a day
collision". **Read the artifact first.**

**GREEN's column is now empty.** The five open cards are all owner-side or deferred by owner
decision: CANARY-reminder (G2, in flight), INC-04 (the rotation deferred to post-launch), PL-03b
(held), LE-resend and PL-26 (both deferred post-launch). Launch remains G2 + G8.

## 2026-08-03 - G2 closed by the owner: readiness 8/9, only G8 left (GREEN)

The owner ran and confirmed the reminder canary. **G2 passes; launch readiness is 8/9 and the only
remaining gate is G8, JP's RGPD sign-off.**

Worth recording why this gate could only ever be closed this way: nothing in the reminder path is
build-time. A missing `REMINDERS_LIVE_SEND`, Twilio credential or `INNGEST_EVENT_KEY` never fails a
deploy - it silently degrades to sandbox. A config review would have shown green while sending
nothing, which is the same "reports success while doing nothing" failure this repo hit four times in
three days. Only a real send through the prod UI could close it, and that is what was done.

**Two caveats that survive G2 and should not be forgotten at cutover:**

1. **G4 reads "prod free of synthetic data" and states PASS, which is knowingly not literally true.**
   The owner sanctioned continued testing on prod (INC-02b closed by ruling), so synthetic rows are
   there BY DECISION. G4 must be re-verified at the actual cutover, and the signed clinical record
   noted in INC-02b is ANNULLED never deleted (rule 8) if a purge happens.
2. **INC-04 is still open by design.** G3 passes by owner RISK ACCEPTANCE, not because the exposed
   prod DB password was rotated. The owner will rotate every password and token after the work
   completes. Accepting a risk is not removing it, which is why that card was deliberately left open
   rather than shipped.

Remaining 4 cards are all owner-side or deferred by owner decision: INC-04 (the owed rotation),
PL-03b (held), LE-resend and PL-26 (both post-launch).

## 2026-08-03 - PL-31: NIF mandatory on ficha creation, with an audited exemption (GREEN)

Owner CR, verbatim: *"when creating ficha clinica, the NIF field must be as mandatory to fill in,
cannot move forward without it"*. Two things in the code turned that from a one-line change into a
decision, and both were put to the owner **before** any code was written.

**1. NIF was free text, so "mandatory" had to mean something.** `validation.ts` accepted any string
up to 20 characters - `"abc"` saved fine. Mandatory-as-non-empty would have produced a required field
full of `0` and `-`: worse than optional, because it *looks* authoritative on a fatura. But a real PT
NIF check has a cost - foreign patients do not have one, and a hard block with no way through means
reception cannot register a foreign walk-in, so they invent a number and nothing records that they
did.

**RULING (owner): a valid PT NIF - 9 digits plus the mod-11 control digit - with an explicit
"Estrangeiro / sem NIF" exemption that requires a written reason.** The exemption is stored
(`patients.nif_exempt` + `nif_exempt_reason`, migration 0053), so every exception is an auditable act
rather than an indistinguishable empty field.

Two specific values are rejected on purpose and both are worth recording:
- `000000000` **passes the checksum** (weighted sum 0 means the expected control digit is 0, which it
  carries) and is the single likeliest thing typed to escape a required field. The prefix rule is what
  rejects it. A checksum-only validator would have accepted it.
- `999999990`, the *consumidor final* number, is structurally valid and means "no NIF given" - i.e.
  the same thing as the exemption, while looking like a real answer. Accepting it would have made it
  the one-keystroke way to defeat the requirement with nothing recording that it had been defeated.
  Its error message points at the exemption checkbox instead of implying a typo.

**2. There is a second patient-creation path, and enforcing the rule in shared validation would have
killed it silently.** `consultation/actions.ts` `createStubPatientAction` quick-creates a patient from
name + optional phone so a therapist can start recording a walk-in immediately.

**RULING (owner): the stub path keeps name + phone.** The patient is instead marked **ficha
incompleta** - derived, never stored, as `nif IS NULL AND NOT nif_exempt` - which shows a banner on
the ficha and blocks issuing a declaração until the NIF is supplied. The rule binds where it matters
fiscally without blocking clinical work at the worst possible moment.

**Scope, and the two rules that ride along.** Presence is enforced on CREATE only, because the owner
said "when creating" and because patients registered before today legitimately have no NIF - requiring
one on update would have made every legacy ficha unsavable, turning a data-quality rule into a wall
across records that already exist. Without two smaller rules the requirement is defeated in one click,
so: any NIF supplied during an edit must still be well-formed, and a patient who **has** a NIF cannot
have it cleared back to empty (checked in the action, where the current row is available; a patient who
never had one is untouched).

**An exempted patient is COMPLETE, not incomplete.** They have no NIF and the ficha is finished,
because the absence is recorded and explained. Conflating the two would have put a permanent warning
on every foreign patient.

**Migration 0053 is authored here and NOT applied.** GREEN never applies migrations. Column-only add
on `patients`; existing rows land `nif_exempt = false` so the CHECK is satisfied by the DEFAULT rather
than a backfill - nothing is rewritten and no table is rescanned. It deliberately does **not** make
`nif` NOT NULL: legacy patients have none and the ALTER would have failed outright. The database
cannot tell a new ficha from an old one, which is exactly why presence is enforced in the application.

**Gates: lint, typecheck, unit tests (1588 web tests) and the web production build are green locally,
as are `db:check`, `db:check-journal` and `db:sync-supabase:check`. The full `pnpm build` and
`pnpm test:e2e` could NOT be run locally** - this machine has no Supabase env vars, so the portal
prerender and the Playwright webServer both fail before reaching any of this work. Verified on a clean
tree that both fail identically without these changes. **The new `nif-required.spec.ts` is therefore
unverified locally and CI is its first real run.**

## 2026-08-03 - PL-31 CI caught the bug the design named; marcacoes flake re-opened on a control run (GREEN)

**CI caught a real bug of mine, and it was the exact one PL-31's own card said to avoid.**
`createStubPatientAction` routes through `createPatient`, so enforcing the NIF inside the shared
`parseCreatePatient` blocked every consultation walk-in stub. The card said in as many words that
enforcing it there would kill that flow - and then it was enforced there anyway, in the same session.
`consultation-start.spec.ts` went red immediately.

**Fixed as two server actions, not a flag.** `createPatient` requires the NIF, `createStubPatient`
does not, both call a private impl. A `requireNif` parameter on the exported action would have been a
client-supplied bypass: `lib/patients/actions.ts` is `"use server"`, so every export is callable from
the browser and anyone could have posted `requireNif: false`. Splitting it means the browser can only
ask for one of two fixed behaviours, both decided server-side. The bypass is presence-only - a NIF
supplied to the stub path is still format-checked. Four unit tests pin it.

**One of the other four failures was not a test bug: `patients.spec.ts` used `nif: "900000001"`,
which is not a valid NIF** - its control digit should be 7. A fake fixture that had sat there
unchallenged because nothing had ever checked a NIF. The other three were mine: the e2e NIF default
was in the wrong helper, one assertion matched the NIF twice, and two cases hand-filled the form
without choosing a clinic - which is REQUIRED, so the browser blocked the submit on its own
validation and the request never reached the server. Those two would have **passed their URL
assertion while proving nothing**, which is the more dangerous shape.

**LE-marcacoes-tab-edit-flake is RE-OPENED, hours after being marked shipped.** A fifth test failed
that I could not attribute, so rather than call it a flake I triggered a control E2E run on `main`
carrying none of my changes (run 30827445090). **It failed on that exact test.** The advisory-confirm
fix shipped this morning is therefore incomplete: something else also keeps the drawer open on some
calendar dates, and the nine local passes at `--retries=0` could not have shown it, because the input
changes with the date. That is this repo's own rule, written on another card this week: one green run
proves nothing about anything that can race.

Its evidence field was **cleared**, not just its status. The receipt was real but insufficient, and
leaving it attached would let the next reader think the question was settled.

**Board-integrity note worth keeping:** the correct move when a test fails and you cannot attribute it
is to run the control, not to reason about whether it "looks related". The control cost one workflow
dispatch and converted a guess into a fact in both directions - it proved the marcacoes failure was
not mine, AND that a card claiming a fix was wrong.

## 2026-08-05 - INC-06: live credentials sat in two committed docs since June (GREEN)

A routine docs audit, looking for stale files, found working credentials in cleartext in two
committed handoff documents. This was not turned up by a security review, which is the part worth
sitting with.

**Exposed:** a Supabase database password and two full `postgresql://` connection URLs for the dev
project `ufbkzbyghvxtosyrkgjq` (still live, still referenced by `scripts/perf-seed-loadtest.mjs`),
an IfThenPay backoffice key and password, and the password for a QA portal account that still
exists. Verified by pattern match and line count only. GREEN did not read the values and they appear
nowhere in this log, the board, or any commit message.

**Both files are deleted. That is not the fix.** They have been in git history since 2026-06-12 and
2026-06-17, so anyone with repo access, now or in any past clone, still has them. Rotation is the
only fix and it is owner-terminal work.

**Why it survived two months.** Commit `2c8eeb9` scrubbed the SAME database password out of
`HANDOFF-2026-06-18.md` and missed the 06-12 file. A partial scrub reads exactly like a completed
one. Everyone downstream believed the exposure had been handled, and nothing re-checked. That is the
generalisable lesson: **a scrub is not done until you grep the whole tree for the value, not just the
file you remembered.**

**Relation to INC-04.** The owner accepted the prod DB password exposure on 2026-08-02 and said he
would rotate every password and token once the work completed. INC-06 is a second, independent, and
older exposure covering different credentials, including a third-party payment key. It belongs in
that same sweep, but it widens it: dev Supabase, IfThenPay and a QA account, not only prod Postgres.

**Also in this pass:** 17 dead documents removed from `docs/` after a reference-graph audit proved
nothing points at them. Notably `docs/tech-stack.md`, which was never a document at all: it was
committed on 2026-05-18 containing the literal shell command `cat > docs/tech-stack.md << 'EOF'`
and the closing `EOF`. Someone pasted the command instead of running it and nobody opened the file
for eleven weeks, while three other documents linked to it as the authoritative stack reference. Its
real content lives in `docs/architecture.md` section 3; the three referrers now point there.

**What was deliberately KEPT despite looking dead:** the six `docs/design/SPEC-v2-*.md` files, which
no document references but `.claude/agents/design-reviewer.md` and `a11y-reviewer.md` read by
wildcard on every UI diff; and `docs/pr-assets/**`, which is linked from merged GitHub PR bodies by
SHA-pinned raw URLs rather than from the repo. Both would have looked like obvious orphans to a less
careful sweep.

## 2026-08-07 - Migration 0058 applied, and the apply-block doctrine gains a mandatory pre-check (PURPLE)

Migration `0058_patient_terms_acceptances` is **applied to production and proven**, on the second
attempt. Evidence, verbatim owner paste, is at `docs/migration-apply-0058.md` section 8. PR #833
merged after the apply, in the ruled order, squashed to `45d0bcf`.

**The proof is deliberately not drizzle's success message.** Two independent confirmations bracket
the write: the new pre-check said one migration was pending and named it, computed from the database
before anything ran; the table checker said `patient_terms_acceptances EXISTS`, read from
`pg_catalog`, after. `drizzle-kit migrate` printed `migrations applied successfully` on BOTH the
failed attempt and this one, identically, which is precisely why it is not the evidence.

### The doctrine amendment, binding from now

`docs/runbook-prod-migrations.md` gains a section, **"The pre-check is mandatory"**, plus a banner at
the top of the file and three rows in the quick reference. Every future apply block runs
`check-pending-migrations.mjs <N>` with the expected count immediately before `migrate`, and says in
words that a failure means `migrate` is not run at all. **A block without it is not a valid block and
must not be handed to the owner.**

### The root-cause pattern, carded as INC-07 rather than left in a doc

`0049` and `0058` are **the same class of failure**, and naming that is the point of the card. In both,
the checkout, the connection and the SQL file were fine or fine-looking; drizzle printed success; the
schema was unchanged; and the truth surfaced only through independent verification. The surface
causes differ and that is what disguised the shared shape:

- **0049** (2026-07-30): the prod-apply worktree sat on `main` because `git checkout <branch>` was
  rejected and the fallback went unnoticed. The migration was not in the tree.
- **0058** (2026-08-07): the journal `when` for 0058 was **lower** than 0057's. Drizzle's pending test
  is `lastDbMigration.created_at < folderMillis` (`drizzle-orm/pg-core/dialect.js:62`), so a
  backwards timestamp reads as already-applied and the entry is skipped.

The 0058 mechanism deserves its own line because it is repo-specific and non-obvious: **this repo's
journal `when` values are a synthetic series stepping `+100000000`, already years in the future.** A
hand-appended entry using a real `Date.now()` produces a value BELOW its predecessor. That is not a
typo a reviewer would catch by eye - `1786093200000` looks like a perfectly ordinary millisecond
timestamp, and it is; it is just smaller than the one above it.

**The check that was green while the migration was unappliable.** `check-journal.mjs` asserted file
count, `idx` contiguity and filename order. All three reconciled. None of them looked at `when`. A
passing check covers what it asserts and nothing more, and a green check on an adjacent property
reads exactly like a green check on the property you cared about. It now asserts `when` is strictly
increasing and prints the correct next value when it is not - proven load-bearing by restoring the
bad timestamp and watching it fail.

### The generalisable rule

**A command's own success message is never evidence that its side effect occurred.** Verify the side
effect from a different source, and where possible in both directions - before, that the work exists;
after, that the object exists. The 0049 lesson was recorded as "check the schema afterwards", and
that half alone still cost a full owner round-trip on 0058, because an after-check reports the
failure once the owner's terminal session is already over.

### State after

Next free migration number is **0059**. Nothing in the repo holds an unapplied migration, so the
one-in-flight rule is satisfied and `W13-04a-availability-exclusion` may take the slot.

## 2026-08-14 - scripts/ingestion-sign.mjs, and where a root-level test can run (branch tools/ingestion-hmac-signer)

Standalone HMAC signer for the live acceptance session with the AI ingestion partner. Three of the
six acceptance steps need signed POSTs the partner's scenario cannot produce: an exact-bytes replay
(200), a one-character mutation under the same idempotency key (409), and a deliberately bad
signature (401). Owner instruction, out of band, no board card. See Q-ACC-SIGN-1.

### The signer signs the bytes it sends, structurally rather than by claim

There is exactly one Buffer. It is read from disk, optionally mutated once, then hashed and handed to
`fetch`. `buildSignedRequest()` returns the very Buffer it signed, so "signs the exact bytes
transmitted" is a property of the data flow and not of a comment. The HMAC is fed as two byte-wise
`update()` calls (`` `${timestamp}.` `` then the raw bytes), so the body never becomes a string in
this process and no decode or re-encode can alter it.

The defect this is built against is the ordinary one: parse the JSON, re-stringify it, sign that.
Key order, unicode escaping and whitespace all move, the MAC no longer covers what went on the wire,
and the endpoint answers a flat 401 that discloses nothing about why. During an acceptance window
that reads as a wrong shared secret.

### Two byte-level cases that fail loud rather than being repaired

The endpoint MACs over `await req.text()`, a UTF-8 decode of what it receives. Bytes that do not
survive that decode are refused, because signing them would sign something we did not send. A UTF-8
BOM is refused separately, and for the opposite reason: it round-trips, so the signature verifies and
the server's `JSON.parse` then fails, answering 400 during a step whose expected answer is 200, 401
or 409. Both are the §1.3 rule from PORTAL-REHYDRATE.md applied to bytes: on a path that produces a
verdict, an unhandled case must fail rather than fall back.

`--mutate-body` follows the same rule. It flips the first ASCII alphanumeric inside a string VALUE
within the `payload` object, located by walking the JSON structure rather than by searching for the
text `"payload"` (which can appear inside a value). Inside the payload so the transport envelope is
untouched and the request still routes to the same `(tenant, idempotency_key)` pair; inside a string
value so the body stays valid JSON; ASCII alphanumeric so no multi-byte sequence is cut in half. If
no such byte exists it throws. Flipping something else would send a request whose status code answers
a different question than the one being asked.

### Where the test runs, which was the real decision

The test compares the script's signature against `signIngestionBody()` and `verifyIngestionSignature()`
imported from `apps/web/lib/ingestion/hmac.ts` - the endpoint's own code, not a second copy of the
algorithm, which would drift in step with the signer and prove nothing.

`scripts/` is not a workspace package, so `turbo run test` never sees it and a test file there would
have sat in the repo looking like protection while running nowhere. That is the `test.skip()` failure
from §1.3 in a different costume. Three ways out were available:

1. put the test under `apps/web` - rejected, the dispatch ruled that tree untouchable during the
   acceptance window;
2. stand up a `tools/` workspace for it - rejected, it moves the lockfile and the workspace config
   for one file;
3. run it with the Node 22 built-in test runner and add one step to the existing CI quality job -
   taken.

Node 22 strips the TypeScript types on import, so `hmac.ts` is imported directly with no build step
and no new dependency. `pnpm test:scripts` runs `node --test "scripts/**/*.test.mjs"`. The CI step
sits INSIDE the existing `quality` job rather than in a new job, because a new job is a new check
name and would not be in the REQUIRED set - green, and blocking nothing.

### Proven capable of failing

Three negative arms, each applied to the real file, run, observed red, reverted:

- `signBytes` re-serialises the JSON before signing - 6 red, including the cross-check against the
  endpoint helper;
- the mutation lands outside the payload object - 4 red;
- the UTF-8 round-trip guard removed - 1 red.

23 tests, 23 passing on the restored file.

### Nothing in the runtime surface moved

No change to the endpoint, the ingestion library, or anything under `apps/web`. Files: two new under
`scripts/`, one script entry in the root `package.json`, one step in `.github/workflows/ci.yml`, and
these log entries.

---

## 2026-08-17 - PROD_REFS was empty on the day it stopped being safe (PURPLE, branch fix/seed-guard-prod-ref)

> **ADOPTED AND CORRECTED 2026-08-17.** This entry was written by a second terminal
> that had booted as PURPLE from a differently-named directory without either session
> noticing. That session is terminated and its worktree removed; there is one PURPLE.
> The work itself verified clean and is kept. Two of its statements had gone stale
> against its own branch before merge and are corrected in place below, marked where
> they occur.

`packages/db/seed/seed-guard.ts` shipped with `export const PROD_REFS: string[] = []`
and a comment instructing whoever provisioned the production project to populate it.
Production `dfotoodqvmjhbdcxyaxf` was provisioned, migrations `0047` through `0063`
were applied to it, real patient data landed in it, and the list stayed empty. The
comment was the whole enforcement mechanism, and comments do not fail builds.

### What the empty list actually cost

Every dev seed (`patients-dev`, `appointments-dev`, `episodes-dev`, `dev-reference`,
`availability-dev`) resolves its target through `resolveSeedDatabaseUrl`. With the
blocklist empty, the only thing between a shell holding the prod `DATABASE_URL` and
50 synthetic patients in the live clinic database was `SEED_DEV_CONFIRM` - and that
variable is set by the same person, in the same shell, from the same env file. It
defends against forgetting. It does not defend against being wrong about which
database you are pointed at, which is the failure that actually happens.

The two guards are not redundant, and the header comment now says which is which:
`SEED_DEV_CONFIRM` guards against an ACCIDENT, `PROD_REFS` guards against a
DELIBERATE run aimed at the wrong target. The blocklist is checked first and no
opt-in overrides it.

### The list holds TWO refs. This section originally said one, and it was wrong by the
### time it was read.

`dfotoodqvmjhbdcxyaxf` (live production) was added first. This entry then stated,
in the present tense, that the retired old prod `jaxmkwoxjcgzkwxgbayx` was NOT added
and was left for the owner to rule on - the reasoning being that widening a safety
blocklist unasked is still widening scope.

**The owner ruled on 2026-08-17: it goes on.** A safety blocklist that omits a ref
CLAUDE.md already forbids targeting is incomplete by its own logic. It was added on
the same branch, and the reason is on the file: a retired project is one nobody
watches, so a stale connection string in an old env file, shell history or runbook is
exactly where a wrong seed goes unnoticed. **Retired is a reason to add a ref, not to
omit one.**

CORRECTED IN PLACE RATHER THAN APPENDED BELOW, and the original claim is left visible
above rather than deleted, because this log is append-only and later sessions read it
as settled. An entry that says "one ref, deliberately" beside a file holding two is
the exact defect DECISIONS exists to prevent.

### Coverage was zero, not stale

The dispatch asked whether a test asserted the empty list. None did: `seed-guard.ts`
had no test at all. Nothing in `packages/db/tests/` imported it, and `packages/db`
has no `lint` script, so `pnpm lint` never saw the file either. The guard protecting
the production database was the only safety mechanism in the package with no
automated proof it worked.

`packages/db/tests/seed-guard.test.ts` (15 tests, no DB required, always runs) now
pins: EACH blocked ref is present by name, the list is non-empty, both the pooler and
the direct URL forms parse to the same ref, a blocklisted ref is refused EVEN WITH
`SEED_DEV_CONFIRM` set to it, a non-blocklisted ref still requires the opt-in, and a
confirmed dev ref still returns. Each ref is pinned INDIVIDUALLY as well as driven
through the full refusal path: a bare `PROD_REFS.length > 0` would stay green if
somebody replaced the contents rather than emptying them. It lives in `tests/` rather than beside the source
because `packages/db/vitest.config.ts` includes only `tests/**/*.test.ts` - colocated
per CLAUDE.md convention, it would have run nowhere, which is the failure mode
DECISIONS 2026-08-14 §"Where the test runs" already logged once.

### Proven capable of failing

The list was reverted to `[]` on the real file, the suite run, and restored. With one
ref that was 4 red of 10; **re-run on 2026-08-17 with both refs on the list and both
counts corrected: 7 red of 15** - the two by-name assertions, the not-empty
assertion, and all four refusal assertions (each ref, pooler and direct form). 15/15
green on the restored file, and `git status` clean afterwards.

The re-run was done by the adopting terminal rather than taken from this entry. A
negative control reported second-hand is a claim, not a control.

### Gates

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green from the repo root.
`pnpm test:e2e` not run: the change touches no user-facing flow, only a dev-only seed
guard that never executes in the app or in CI.
