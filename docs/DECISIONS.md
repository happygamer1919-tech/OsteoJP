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
