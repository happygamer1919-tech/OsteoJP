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

## 8. Centered modal (row-actions, dense) — W5-06

For a row-actions group that is too dense to read as an inline `<details>` drawer (§6) — e.g. Equipa "Gerir", where the overflowing staff table pushed the expanded panel far to the right and forced horizontal scrolling — use a **centered modal** instead. This is a deliberate, per-surface deviation from the §6 disclosure, not a replacement for it: keep the compact `<details>` drawer for lighter row groups.

- **Primitive:** build on the shared native-`<dialog>` hook `useAnimatedDialog` (exported from `@osteojp/ui`, the same primitive `Dialog`/`Drawer` use). It provides the focus trap, Escape-to-close, inert background, top-layer stacking, and focus restoration for free. Do **not** add a new `packages/ui` primitive for this (a `packages/ui` change ripples beyond one surface — HALT first); an app-level modal component in `apps/web` on top of the exported hook is the sanctioned path.
- **Surface:** `glass-card` (§1/§7), `rounded-v2`, `shadow-v2-float`, `p-6`, `m-auto` for centering, `backdrop:bg-text-primary/40`. Enter/exit via the `shown` opacity transition (`duration-base ease-standard`).
- **Trigger:** a ghost `Button` in the row's **Ações** column (label from i18n, e.g. `admin.staff.manage` "Gerir"), not a `<summary>`.
- **Close:** Escape, overlay click, and an explicit ghost close control (`common.close`) all request close. One tab-stop discipline, global focus ring on every interactive element.
- **Zero logic change:** the modal holds the **exact same controls**, each still posting to its **same existing server-action handler**. A server-enforced gate (e.g. the scrypt-gated delete) stays **unchanged** — restyle/relocate only, never weakened (§5).
- **Playwright:** open the modal by clicking the trigger button, then interact with the controls inside `getByRole("dialog")`.

## 9. Bodychart marker palette — W5-25

The **Local da dor** bodychart (`apps/web/app/clinical/[id]/BodyChart.tsx`) plots nine clinical marker types (SPEC-ficha-medica.md AMENDMENTS ruling G). Each type renders with a **unique geometric SHAPE and a unique COLOUR**. **Shape is the authoritative carrier of meaning; colour reinforces — never colour alone** (the chart must read in greyscale and for colour-vision-deficient users, so the shape alone disambiguates every type). An **always-visible legend** (not a hover/disclosure) maps each shape+colour to its pt-PT type name.

The §7 token palette does not supply nine distinct hues (magenta is reserved for the brand lockup), so W5-25 adds a dedicated nine-entry marker palette in `apps/web/app/globals.css` (`@theme`). Tailwind v4 generates the `fill-marker-*` / `stroke-marker-*` utilities; components reference them by name, **no raw hex**. Every hue is **AA (≥ 4.5:1) against the chart surface `--color-surface-muted` (#F0F3F6)**; filled shapes carry a thin `stroke-surface` halo to separate from the figure line-art, stroked shapes (cross, ring) carry only their colour stroke.

| `marker_type` | pt-PT label | Shape | Colour token | Hex | Contrast vs #F0F3F6 |
|---|---|---|---|---|---|
| `blockage_dysfunction` | Bloqueio / Disfunção | square | `marker-blockage` | #3538CD | 7.26:1 |
| `scar` | Cicatriz | cross (X) | `marker-scar` | #B42318 | 5.90:1 |
| `hypertonicity` | Hipertonicidade | triangle | `marker-hypertonicity` | #B54708 | 4.87:1 |
| `hypotonicity` | Hipotonicidade | diamond | `marker-hypotonicity` | #107569 | 5.00:1 |
| `pain_radiation` | Irradiação da dor | star | `marker-radiation` | #6941C6 | 5.94:1 |
| `pain_location` | Local da dor | filled circle | `marker-location` | #C11574 | 5.20:1 |
| `paresthesia` | Parestesia | ring (hollow) | `marker-paresthesia` | #175CD3 | 5.38:1 |
| `rotation_right` | Rotação direita | arrow → | `marker-rotation-right` | #027A48 | 4.86:1 |
| `rotation_left` | Rotação esquerda | arrow ← | `marker-rotation-left` | #854A0E | 6.32:1 |

The nine `marker_type` values are the frozen `osteopathy-v3.json` bodychart enum; the shape/colour mapping binds to those values (render-only — the template and the stored marker shape `{ marker_type, x, y, view }` are untouched). The marker glyphs + legend live in `apps/web` (BodyChart.tsx); no `packages/ui` primitive is added.

---

**Conformance note:** W4-14 (Horários), W4-15 (Serviços), W4-16 (Pacientes), W4-17 (Agenda header), W4-18 (Início) follow the card/table/spacing/badge/button/toolbar/token patterns above. Any surface that needs a pattern not covered here extends this document in the same PR.
