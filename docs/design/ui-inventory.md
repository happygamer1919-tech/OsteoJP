# UI Layer Inventory

Audit of the current UI layer, feeding the redesign spec. Read-only snapshot of
branch `docs/ui-inventory` (off `origin/main` @ `309f774`), 2026-06-11.

Every claim below cites a file path. Where a screen or component is absent, that
is stated plainly.

---

## 1. `packages/ui` contents

**The shared UI package is an empty scaffold. It exports zero React components.**

- `packages/ui/index.ts` — exports a single constant: `PACKAGE_NAME = "@osteojp/ui"`.
  The file's own comment says "Storybook scaffold = Max, Phase 2." There are no
  components, no hooks, no utilities.
- `packages/ui/package.json` — declares only `react`/`react-dom` as deps and
  Storybook + Tailwind v4 as devDeps. `exports` map publishes `.` (the index)
  and `./theme.css`. No build step (`main`/`types` point straight at `index.ts`).
- `packages/ui/theme.css` — the package's only real asset: the brand token set
  (see §3).
- `packages/ui/stories/` — Storybook's default boilerplate: `Button.tsx`,
  `Header.tsx`, `Page.tsx` plus their `.stories.ts` and demo `.css`. These are
  the create-storybook samples, **not** OsteoJP components, and are not exported
  from `index.ts` or consumed anywhere.

**No app imports a component from `@osteojp/ui`.** The only references are:
- `@osteojp/ui/theme.css` imported by `apps/web`, `apps/admin`, `apps/api`
  globals (not `apps/portal` — see §3).
- `transpilePackages: ["@osteojp/ui", ...]` in each app's `next.config.ts`
  (`apps/web/next.config.ts:5`, `apps/admin/next.config.ts:6`,
  `apps/api/next.config.ts:8`).

Consequence: **every screen builds its own inline markup.** There is no shared
Button, Input, Card, Dialog, Badge, Table, Field, or layout primitive. The real
(product) components live inside each app's route folders (inventoried in §4).

### Product components that exist today (all app-local, none shared, none with stories)

Staff app (`apps/web`), all `"use client"`:

| Component | Path | Props surface (first line) |
|---|---|---|
| `AppShell` | `apps/web/components/app-shell.tsx:22` | `{ children }` — server component, role-aware sidebar |
| `NavLinks` | `apps/web/components/nav-links.tsx:10` | `{ items: NavItem[] }` |
| `AgendaView` | `apps/web/app/agenda/agenda-view.tsx:20` | multi-prop calendar container |
| `AgendaGrid` | `apps/web/app/agenda/agenda-grid.tsx:67` | multi-prop time grid |
| `AppointmentModal` | `apps/web/app/agenda/appointment-modal.tsx:69` | multi-prop create/edit dialog |
| `RecordForm` | `apps/web/app/clinical/[id]/RecordForm.tsx:29` | JSON-Schema-driven clinical record editor |
| `BodyChart` | `apps/web/app/clinical/[id]/BodyChart.tsx:14` | body-map annotation widget |
| `Attachments` | `apps/web/app/clinical/[id]/Attachments.tsx:24` | signed-URL upload list |
| `DownloadReportButton` | `apps/web/app/clinical/[id]/DownloadReportButton.tsx:12` | `{ recordId: string }` |
| `ReviewEditor` | `apps/web/app/clinical/review/[recordId]/ReviewEditor.tsx:19` | AI/intake review queue editor |
| `PatientForm` | `apps/web/app/patients/_components/patient-form.tsx:39` | `{ patient?: Patient \| null }` |
| `SearchBox` | `apps/web/app/patients/_components/search-box.tsx:9` | `{ initialQuery: string }` |
| `PatientActions` | `apps/web/app/patients/_components/patient-actions.tsx:16` | row action menu |
| `StaffInviteForm` | `apps/web/app/admin/staff/StaffInviteForm.tsx:9` | admin invite form |
| `UpdatePasswordClient` | `apps/web/app/auth/update-password/UpdatePasswordClient.tsx` | auth client form |

Portal app (`apps/portal`):

| Component | Path |
|---|---|
| `TopBar` | `apps/portal/components/layout/TopBar.tsx:3` |
| `BottomNav` | `apps/portal/components/layout/BottomNav.tsx:14` |
| `AppointmentCard` | `apps/portal/components/appointments/AppointmentCard.tsx` |
| `AccountEditForm` | `apps/portal/components/account/AccountEditForm.tsx` |
| `ReminderToggles` | `apps/portal/components/account/ReminderToggles.tsx` |
| `BookingConfirmForm` | `apps/portal/components/booking/BookingConfirmForm.tsx` |
| `SlotPicker` | `apps/portal/components/booking/SlotPicker.tsx` |

Admin app (`apps/admin`): `CreateTenantForm` (`apps/admin/app/CreateTenantForm.tsx`).
API app (`apps/api`): `SetPasswordClient` (`apps/api/app/auth/set-password/SetPasswordClient.tsx`).

**Story coverage: zero.** No product component has a Storybook story. The only
stories are the boilerplate demos.

---

## 2. Storybook

**Installed and configured in `packages/ui`, but only running against demo
boilerplate. Not used by any app, not in CI.**

- Configured: `packages/ui/.storybook/main.ts` (react-vite framework, a11y +
  docs + vitest + chromatic addons, Tailwind v4 via a `viteFinal` hook that
  pushes `@tailwindcss/vite`), `packages/ui/.storybook/preview.tsx`.
- Scripts: `storybook dev -p 6006` and `build-storybook` in
  `packages/ui/package.json:14-15`.
- Deps present: `storybook@^10.4.1`, `@storybook/react-vite`,
  `@storybook/addon-a11y`, `@storybook/addon-docs`, `@storybook/addon-vitest`,
  `@chromatic-com/storybook` (`packages/ui/package.json:17-32`).
- Stories indexed: `../stories/**/*.mdx` and `*.stories.*`
  (`main.ts:15-18`) — resolves only to the three demo stories.

There is no evidence Storybook is wired into the monorepo's lint/test/build
gates, and there are no real component stories to render. Effectively: a clean
Storybook install waiting for a component library that does not exist yet.

---

## 3. Tailwind setup

**Tailwind v4 (CSS-first `@theme`), no `tailwind.config.js` anywhere.**

- Versions: `packages/ui@^4.3.0`; `apps/web`, `apps/portal`, `apps/admin`,
  `apps/api` all `tailwindcss@^4` (`*/package.json`). PostCSS via
  `apps/*/postcss.config.mjs`.
- No `tailwind.config.*` exists in the repo — configuration is the v4 CSS
  `@theme` block.

### Where tokens live

`packages/ui/theme.css` (the single source of design tokens), via `@theme { ... }`:
- Brand: `--color-brand-teal: #45B9A7`, `--color-brand-magenta: #8B1863`,
  `--color-brand-grey: #98B2C2` (`theme.css:16-18`).
- Neutrals: `--color-bg #F7F9FB`, `--color-surface #FFFFFF`,
  `--color-surface-muted #F0F3F6`, `--color-border #E2E8EE`,
  `--color-border-strong #C7D1DA` (`theme.css:21-25`).
- Text: `--color-text-primary #1A2733`, `-secondary #56697A`, `-muted #8A98A6`,
  `-inverse #FFFFFF` (`theme.css:28-31`).
- Semantic: success/warning/error/info + `-bg` variants (`theme.css:34-41`).
- Type scale: `--font-sans: 'Inter', ...` + `--text-display|h1..h4|body|body-sm|small|caption`
  with paired line-heights, and weight tokens (`theme.css:44-70`).
- Spacing: 4px base named scale `--spacing-1..16` (`theme.css:72-80`).

> Token-value caveat already flagged in-file (`theme.css:3-12`): teal/magenta use
> the **PDF-sampled** `brand-tokens.md` values (`#45B9A7` / `#8B1863`), which
> differ from CLAUDE.md's `#3DAEB3` / `#8E2C7A`. theme.css treats `brand-tokens.md`
> as canonical. The spec must resolve which palette is authoritative.

### Per-app theme wiring (inconsistent)

- `apps/web`, `apps/admin`, `apps/api` import `@osteojp/ui/theme.css` and add an
  `@theme inline` block mapping `--color-background`/`--color-foreground` and
  **overriding `--font-sans` to `var(--font-geist-sans)`**
  (`apps/web/app/globals.css:15-20`, `apps/admin/app/globals.css:10-15`,
  `apps/api/app/globals.css:10-15`). The web `body` rule even hardcodes
  `font-family: Arial, Helvetica, sans-serif` (`apps/web/app/globals.css:25`).
- **`apps/portal` does NOT import the brand tokens.** Its
  `apps/portal/app/globals.css:1` is a bare `@import "tailwindcss"`, with a
  system font stack and its own hardcoded hexes (see below). Its root layout
  applies `bg-background text-foreground` utilities
  (`apps/portal/app/layout.tsx:16`) whose backing tokens are **not defined** in
  portal CSS, while `apps/portal/app/portal/layout.tsx:19` uses Tailwind's
  default `bg-gray-50`. Portal is on a different (token-less) design system.

### Hardcoded hex offenders (`#[0-9A-Fa-f]{6}`)

Grep across `apps/web` and `packages/ui` (task scope), extended to the other apps:

- **`apps/web` — clean in components.** Hex appears only in
  `apps/web/app/globals.css:7` (a comment) and `apps/web/lib/clinical/report/pdf.ts`
  (PDF vector-mark generation — a legitimate non-CSS use, no DOM token system
  applies). No `.tsx` component hardcodes a color.
- **`packages/ui` — clean.** Hex only in `theme.css` (the token definitions
  themselves) and 6 occurrences in the demo `stories/*.css` boilerplate.
- **`apps/admin`, `apps/api` — clean.** Zero hex in `.tsx`/`.css`; both consume
  tokens.
- **`apps/portal` — the offender: 53 hardcoded hex occurrences across 19 files**,
  almost all as inline `style={{ ... }}` rather than tokens. Highest counts:
  - `components/appointments/AppointmentCard.tsx` (8) — a per-status color map
    (`scheduled/confirmed/completed/cancelled/no_show` → hardcoded bg/fg pairs,
    `AppointmentCard.tsx:21-25`).
  - `app/portal/clinics/page.tsx` (8), `components/booking/SlotPicker.tsx` (6),
    `app/portal/dashboard/page.tsx` (6), `components/layout/TopBar.tsx` (3),
    `components/account/AccountEditForm.tsx` (3), and 13 more files (1–3 each).
  - The brand teal `#45B9A7` is pasted inline in ~15 places
    (e.g. `TopBar.tsx:10,28`, `BottomNav.tsx:32`, every booking step, auth
    layout/login) instead of `text-brand-teal`/`bg-brand-teal`.

---

## 4. Screen inventory

### Staff screens (`apps/web`)

| Screen | Status | Route(s) | Components used |
|---|---|---|---|
| Dashboard | **exists** | `app/dashboard/page.tsx` (+ `layout.tsx` → `AppShell`) | AppShell, NavLinks |
| Agenda | **exists** | `app/agenda/page.tsx` (+ `layout.tsx`) | AgendaView, AgendaGrid, AppointmentModal |
| Patient profile | **exists** | `app/patients/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`, `new/page.tsx` | PatientForm, SearchBox, PatientActions |
| Clinical record editor | **exists** | `app/clinical/page.tsx`, `[id]/page.tsx`, `new/page.tsx`, `episodes/[id]/page.tsx`; review: `review/page.tsx`, `review/[recordId]/page.tsx` | RecordForm, BodyChart, Attachments, DownloadReportButton, ReviewEditor |
| Appointment modal | **exists** | `app/agenda/appointment-modal.tsx` (rendered inside Agenda) | AppointmentModal |
| Invoicing view | **MISSING** | no route | — backend only: `lib/integrations/{invoicexpress,stripe,ifthenpay}` + `app/api/inngest/*`. No staff-facing invoice UI exists. |

Other staff routes present but outside the six: `app/admin/*`
(locations/services/settings/staff), `app/login`, `app/auth/update-password`,
`app/r/[token]` (reminder link landing).

### Portal screens (`apps/portal`)

| Screen | Status | Route | Notes / components |
|---|---|---|---|
| login | **exists** | `app/auth/login/page.tsx` | API-wired; contains a TODO/placeholder marker |
| activate | **exists** | `app/auth/activate/page.tsx` | phone/token activation, API-wired |
| dashboard | **exists** | `app/portal/dashboard/page.tsx` | API-wired (defaults to empty `appointments[]`) |
| account | **exists** | `app/portal/account/page.tsx` | AccountEditForm, ReminderToggles, API-wired |
| appointments | **exists** | `app/portal/appointments/page.tsx` | AppointmentCard, API-wired |
| booking | **exists** (multi-step) | `app/portal/booking/page.tsx` + `service/`, `slot/`, `confirm/`, `pending/` | SlotPicker, BookingConfirmForm, API-wired |
| clinics | **exists (static)** | `app/portal/clinics/page.tsx` | hardcoded `const CLINICS = [...]` (`clinics/page.tsx:4`), no data source |
| documents | **partial/static** | `app/portal/documents/page.tsx` | 33-line static shell, no live document list wired |
| forms | **STUB** | `app/portal/forms/page.tsx` | 9 lines: `<h1>As minhas fichas</h1>` + literal "A carregar fichas..." + `TODO: Phase D — render intake forms from JSON Schema` |

Portal shell: `app/portal/layout.tsx` wraps pages in `TopBar` + `BottomNav`,
mobile-first `max-w-md mx-auto`.

---

## 5. Fonts, nav/shell, state patterns

### Fonts
- **No app loads Inter, despite `--font-sans: 'Inter'` in `theme.css:44`.**
- `apps/web`, `apps/admin`, `apps/api` load **Geist + Geist_Mono** via
  `next/font/google` (`apps/web/app/layout.tsx:2,6-14`; same in admin/api) and
  override `--font-sans` to Geist. Web's `body` additionally hardcodes Arial
  (`apps/web/app/globals.css:25`).
- `apps/portal` loads **no webfont** — system stack only
  (`apps/portal/app/globals.css:68-71`). Root `<html lang="pt">`
  (`apps/portal/app/layout.tsx:15`) vs staff `lang={htmlLang()}` → `pt-PT`
  (`apps/web/app/layout.tsx:35`).

### Nav / shell
- **Staff:** `AppShell` server component
  (`apps/web/components/app-shell.tsx`) — fixed `w-60` left sidebar, OsteoJP
  wordmark (teal "Osteo" + magenta "JP"), role-gated nav via
  `navItemsForRole(ctx.role)`, sign-out form pinned to bottom. Active-section
  highlight in client `NavLinks` (`nav-links.tsx`) using brand tokens
  (`border-brand-teal`, `bg-brand-teal/10`, `text-brand-magenta`). Token-styled
  throughout. `redirect("/login")` fail-closed.
- **Portal:** `TopBar` (sticky top, skip-link, wordmark with teal accent bar,
  "Contactos" link) + `BottomNav` (fixed bottom, 5 tabs). **`BottomNav` uses
  emoji as icons** — `🏠 📅 📋 📍 👤` (`BottomNav.tsx:7-11`) — and emoji appear in
  page bodies too (`📅`, `📍`, `→` arrows): violates the CLAUDE.md/brand rule
  "No emoji in product UI." Active state via inline `style={{ color: ... }}`,
  not tokens.
- **Admin:** standalone (login + single dashboard page + `CreateTenantForm`), no
  shared shell. **API app:** minimal root + set-password page only.

### Empty / loading / error patterns
- **One error boundary in the whole repo:** `apps/web/app/global-error.tsx`.
  No per-route `error.tsx`, no `not-found.tsx`, no `loading.tsx` anywhere
  (`find apps -name loading.tsx|error.tsx|not-found.tsx` → only global-error).
- **No loading-skeleton UI.** The only textual "skeleton" hit is a code comment
  in `apps/api/app/page.tsx:3`. No `<Suspense>` skeletons, no shimmer
  components.
- **No live-region feedback anywhere:** zero `aria-live`, `role="status"`, or
  `role="alert"` across all apps. Async success/error states have no
  programmatic announcement.
- **Empty states are ad hoc inline**, e.g. portal lists initialise to `[]` and
  render whatever falls through (`dashboard/page.tsx:33`,
  `appointments/page.tsx:16`); `forms/page.tsx` shows a hardcoded
  "A carregar fichas..." string that never resolves.

---

## 6. Spec implications

The 10 facts the design-spec author most needs:

1. **`packages/ui` is empty — there is no component library to restyle. The spec
   must define the full primitive set from scratch** (Button, Input/Field, Select,
   Checkbox/Switch, Card, Dialog/Modal, Table, Badge/Status, Tabs, Toast, plus
   layout shells), then migrate ~24 app-local components into it.

2. **Two divergent design systems exist today.** Staff (`apps/web`/`admin`/`api`)
   is token-based and reasonably clean; the portal (`apps/portal`) is a separate,
   token-less, inline-hex, emoji-icon, mobile-first system. The redesign must
   unify them or explicitly bless two themes (one staff/desktop, one
   patient/mobile) sharing one token source.

3. **Portal has 53 hardcoded hex values across 19 files and never imports the
   brand tokens.** This is the single largest migration: convert every inline
   `style={{ color/backgroundColor: '#...' }}` to tokens, starting with the
   ~15 pasted `#45B9A7` and the `AppointmentCard` status color map
   (`AppointmentCard.tsx:21-25`).

4. **No app uses the documented brand font. theme.css says Inter; staff apps load
   Geist (and web hardcodes Arial on `body`); portal loads no webfont.** The spec
   must pick one font, load it once, and stop the per-app `--font-sans`
   overrides.

5. **The brand palette is unresolved.** `theme.css` uses PDF-sampled
   `#45B9A7`/`#8B1863`; CLAUDE.md states `#3DAEB3`/`#8E2C7A`. Pick the
   authoritative pair before any component is styled (flagged in `theme.css:3-12`).

6. **Invoicing has no UI — only backend integrations exist.** The staff
   "invoicing view" is greenfield; the spec must design it from zero
   (integrations live in `apps/web/lib/integrations/*`, surfaced via Inngest,
   never rendered).

7. **Portal `forms`, `documents`, and `clinics` are stubs/static.** `forms` is a
   9-line placeholder, `documents` is a static shell, `clinics` is a hardcoded
   array. The spec should treat these as new screens, not restyles.

8. **No loading, empty, error, or not-found patterns exist** (one global error
   boundary, zero `loading.tsx`/`error.tsx`/`not-found.tsx`, no skeletons). The
   spec must define these states as first-class, reusable patterns for every
   screen.

9. **Async feedback has no accessibility layer** — zero `aria-live`/`role=status`/
   `role=alert` anywhere. The component spec must bake live-region announcement
   into Toast/Form/Button-pending states (clinical + GDPR product; a11y is not
   optional).

10. **Emoji are used as product UI in the portal nav and pages** (`🏠 📅 📋 📍 👤`,
    `📅`, `📍`), directly violating the brand "no emoji" rule. The spec needs a
    real icon system (e.g. an icon set + shared `<Icon>`), and the redesign must
    strip every emoji.

### Structural notes for the author
- Staff shell (`AppShell` + `NavLinks`) is the best existing pattern to
  generalise — role-gated, token-styled, fail-closed.
- Storybook is installed and Tailwind-v4-aware in `packages/ui` but only renders
  demo boilerplate; it is ready to host real stories once components land, and is
  not yet a CI gate.
- Tailwind is v4 CSS-first everywhere (no JS config); tokens flow from one file
  (`packages/ui/theme.css`). Centralising on that file is the cleanest migration
  path — the work is making `apps/portal` consume it.
