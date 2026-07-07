# UI-STYLE.md — OsteoJP surface design language (Wave 04 anchor)

**Established by W4-13 (Equipa dashboard redesign). W4-14 → W4-18 MUST conform to this document.**

This records the patterns already in the app shell, chosen consistently, so the Wave 04 surface redesigns (Horários, Serviços, Pacientes, Agenda, Início) share one visual language. It is a **refinement of the existing shell, not a rebrand** — brand tokens are unchanged (CLAUDE.md: teal `#45B9A7`, magenta `#8B1863`, grey `#98B2C2`; Inter; clinical, generous spacing; no emoji in product UI). All copy is **pt-PT via i18n keys** (`@osteojp/i18n`, keys added to BOTH `strings.pt.json` and `strings.en.json` — `StringKey` is the intersection, so a one-file key fails typecheck).

Reuse the shared primitives from `@osteojp/ui` and the shared admin class strings in `apps/web/app/admin/admin-ui.ts`. Do **not** introduce new `packages/ui` primitives for these redesigns unless a surface genuinely needs one (a `packages/ui` change ripples beyond one surface — HALT and surface the blast radius first).

---

## 1. Card anatomy

- **Container:** `GlassPanel` (from `@osteojp/ui`) is the section container — glass surface, hairline border, `rounded-v2`, float shadow. Pass `title` for a titled panel; omit for a bare container (e.g. a table wrapper).
- **Content card:** `Card` / `GlassCard` for a bordered content block. `GlassCard` supports `title`, `headerAction`, `footer`, and a whole-card `href`/`interactive` (one tab stop — never nest interactive elements inside an interactive card).
- **KPI tile:** `KpiCard` — `label` (caption, `text-xs text-text-secondary`), `value` (32px / `text-3xl`), optional `comparison` sub-line. Use for dashboard summary counts.
- **Padding:** panels/cards use `p-6`; nested action blocks use `p-3`.

## 2. Table anatomy

The standard list surface is a `<table className="w-full border-collapse text-sm">` inside `<div className="overflow-x-auto">` inside a bare `GlassPanel`. Chrome comes from `admin-ui.ts`:

- header cell `adminTh` — `py-2 pr-4 text-left text-xs font-medium text-v2-text-secondary`
- body cell `adminTd` — `py-3 pr-4 align-top text-sm text-v2-text-primary`
- row divider `adminTrBorder` — `border-b border-v2-border`

Columns: identity/name first, then supporting fields, then a **status badge** column, then an **Ações** column last. Keep the primary scannable controls (e.g. the primary-service select + its Definir button + the Horários link) **visible in their own column** — do not bury a core, e2e-anchored control inside a disclosure.

## 3. Spacing scale

4px grid. Section stack `gap-6`; within-card stack `gap-3`; inline control clusters `gap-1`–`gap-2`. Panel padding `p-6`, nested blocks `p-3`. KPI grid `gap-4`. Responsive dashboard grids: `grid-cols-2 … xl:grid-cols-4` for 4-up KPIs; a two-pane header row uses `lg:grid-cols-[minmax(0,28rem)_1fr]` (fixed-ish left pane + flexible right pane that fills the former dead zone).

## 4. Estado badges

Use `StatusBadge` (from `@osteojp/ui`) — a compact tinted pill, no dot, AA-safe label tokens:

- `tone="confirmed"` → green — **active / ativo / confirmed** states.
- `tone="pending"` → warning amber — **pending / a aguardar** states.
- `tone="cancelled"` → neutral grey — **inactive / cancelled / archived** states (neutral, never a red flood).

For richer record/review status that needs a dot, use `GlassStatusChip`. Estado is always a badge, never bare text.

## 5. Button hierarchy

`Button` (from `@osteojp/ui`), `size="sm"` inside tables/rows:

- `variant="primary"` — the one main action of a form/section (e.g. Convidar, Guardar on a top-level form).
- `variant="ghost"` — secondary/row actions (Definir, Aplicar, Guardar in a row, Desativar/Reativar).
- `variant="destructive"` — irreversible actions (Eliminar). Destructive actions that are reference-guarded or password-gated keep their gate **unchanged** — restyle only, never weaken a server-enforced gate.
- Pass `loading` + `disabled` for pending server actions on client forms.

## 6. Toolbar layout & row-actions

- **Toolbar:** a single horizontal row grouping the surface's primary form/actions; on wide viewports pair it with a context/summary pane (`lg:grid-cols-[minmax(0,28rem)_1fr]`) so no dead zone remains. Filters and segmented controls align into one toolbar row.
- **Row-actions disclosure:** group a row's management inputs (edit, role, activate/deactivate, gated delete) into a native `<details>` drawer with a `<summary>` styled as a ghost button (label from i18n, e.g. `admin.staff.manage` "Gerir"; `[&::-webkit-details-marker]:hidden`, `list-none`). This replaces always-on inline inputs with a compact, scannable trigger while keeping every input in the DOM and each action wired to its **same existing server-action handler** (presentational grouping only, zero logic change). No client JS required. Playwright opens the drawer (`summary`) before interacting with the grouped controls.

## 7. Tailwind v4 tokens

Token-only (no raw hex in components), on the 4px grid, with the global focus ring. The palette in use:

- **Surfaces:** `bg-v2-surface`, `bg-v2-surface-hover`, `bg-surface-muted`; glass via `GlassPanel`/`glass-card`.
- **Borders / radius:** `border-v2-border`, `rounded-v2`.
- **Text:** `text-v2-text-primary`, `text-v2-text-secondary`, `text-text-primary`, `text-text-secondary`.
- **Brand:** `text-brand-teal` (links/accents), magenta reserved for brand lockup.
- **Status tints:** `bg-v2-green-100/text-v2-green-800` (confirmed), `bg-warning-bg/text-warning-700` (pending), `bg-surface-muted/text-text-secondary` (cancelled); `text-error`/`border-success`/`bg-success-bg` for form feedback.
- **Focus:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2` on every interactive element.

Shared input class strings live in `admin-ui.ts`: `adminInput` (full-width), `adminInputInline` (compact in-row), `adminLabel`, `adminHelp`, `adminLegend`.

---

**Conformance note:** W4-14 (Horários), W4-15 (Serviços), W4-16 (Pacientes), W4-17 (Agenda header), W4-18 (Início) follow the card/table/spacing/badge/button/toolbar/token patterns above. Any surface that needs a pattern not covered here extends this document in the same PR.
