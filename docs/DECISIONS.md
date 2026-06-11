# Decisions log

Append-only. Every session appends decisions made and reasoning.

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
 main
main
main

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
