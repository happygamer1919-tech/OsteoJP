---
name: osteojp-design
description: The locked OsteoJP visual system. Load this before any work on an OsteoJP staff-platform surface or its print output - agenda cards, tables, KPI tiles, empty states, Estado badges, buttons, toolbars, colour/token choices, the bodychart, or a PDF (declaration/report/invoice). Use it to pick colours and tokens, keep AA and colour-not-only, and honour the locked agenda/card/bodychart conventions. It mirrors committed authority (docs/design/UI-STYLE.md, docs/design/W6-06-color-equity-palette-plan.md, CLAUDE.md, packages/ui/src/tokens.test.ts); when this file and those source docs disagree, the source docs win.
---

# OsteoJP design system (locked)

This distils the committed design authority so a fresh session does not re-derive
it. It invents nothing. The authorities, in order, are `docs/design/UI-STYLE.md`,
`docs/design/W6-06-color-equity-palette-plan.md`, `CLAUDE.md`, and the guard test
`packages/ui/src/tokens.test.ts`. If this file drifts from them, they win - fix
this file.

## Brand tokens and the canonical-hex lock

- Brand: teal `#45B9A7`, magenta `#8B1863`, soft grey `#98B2C2`. Inter; clinical,
  generous spacing. **No emoji in product UI.** Tone: serious, precise ("padrao
  ouro").
- The canonical hexes are sampled from `Logotipo_OsteoJP_2023.pdf` at 300 DPI and
  are guarded by `packages/ui/src/tokens.test.ts`. **Canonical hexes NEVER drift.**
  Components use tokens only (no raw hex). A new tint goes in UI-STYLE.md as a
  token; it never edits a canonical hex.
- Print branding on every report, declaration, invoice: logo + location contacts
  + fiscal info. The declaration renderer is `pdf-lib` (imperative drawing), not an
  HTML template - `docs/pdf-templates/*.html` is dead documentation.

## Colour equity: 55 / 25 / 20 (the ACCURATE ruling)

W6-06, made perceptible in W7-03. The wave-briefing shorthand "purple accent" is
imprecise; the committed ruling is:

- **55 percent white + grey** - structure: surfaces, borders,
  `text-*-primary`/`-secondary`.
- **25 percent CYAN (accent-2) - PRIMARY interaction.** Links / CTAs use
  `accent-2-700` (`#2F7E72`) for TEXT, AA 4.83:1. **Never the base `#45B9A7` for
  text** (sub-AA).
- **20 percent PURPLE (accent-1 `#8B1863` + tints) - SECONDARY emphasis**, in five
  defined roles only: (1) active tab - the 2px underline AND the label are
  `accent-1-700`; (2) empty-state icon badge - `text-accent-1-700` on
  `bg-accent-1-50`; (3) patient-tab section headers - a 2px `border-accent-1-700`
  left rule; (4) Documentos row icon badges - `accent-1-700` on `accent-1-50`;
  (5) Estatisticas chart - the PEAK bar `accent-1-700`, the rest cyan.

**Purple is emphasis, NOT interaction.** The v2-green `Button` variants and the
sidebar's active nav item are deliberately NOT repainted (that would re-brand the
product's primary interaction colour and invalidate their AA analyses). Semantic
status tints and the agenda service tints are unchanged.

## AA and colour-not-only

- Every colour pairing meets **WCAG AA (>= 4.5:1)**. Pairing tables are in the
  W6-06 plan and `docs/loops/wave-07/W7-03-audit.md`.
- **Colour is never the only cue.** Where colour would carry meaning, the value is
  also printed as text (or an authoritative shape). This rule governs the bodychart
  markers, the per-therapist agenda colour, and every chart.

## Card, table, spacing, badges, buttons

- **Cards:** `GlassPanel` (section container), `GlassCard` (content block; one tab
  stop, never nest interactives), `KpiCard` (label / 32px value / optional
  comparison). Padding `p-6` panels, `p-3` nested blocks.
- **Tables:** `<table>` in `overflow-x-auto` in a bare `GlassPanel`; chrome from
  `apps/web/app/admin/admin-ui.ts` (`adminTh` / `adminTd` / `adminTrBorder`).
  Columns: identity/name first, supporting fields, then a **status badge** column,
  then **Acoes** last. Keep core e2e-anchored controls in their own column, not
  buried in a disclosure.
- **Spacing:** 4px grid. Section stack `gap-6`; within-card `gap-3`; inline
  clusters `gap-1`-`gap-2`; KPI grid `gap-4`.
- **Estado badges:** `StatusBadge` - `confirmed` green (active), `pending` warning
  amber, `cancelled` neutral grey (never a red flood). Estado is always a badge,
  never bare text.
- **Buttons:** `primary` (the one main action), `ghost` (secondary/row actions),
  `destructive` (irreversible; a server-enforced gate is restyled, never weakened).
- **Focus ring on every interactive element:** `focus-visible:outline-none
  focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2`.
- **Row-actions** collapse into a `<details>` "Gerir" drawer (§6) or, when too
  dense, a centered modal on the `useAnimatedDialog` hook (§8) - never a new
  `packages/ui` primitive without surfacing the blast radius first.

## Agenda conventions (as merged through Wave 09)

- **Card body is tinted by SERVICE category** (SPEC-v2-agenda §2.1): the five
  categories map to `-100` fill / `-200` border tints; a service outside the five
  falls to a neutral tint + the "Outros servicos" legend entry. Body labels use
  `text-v2-text-primary` so AA never depends on the tint. **This body tint is the
  locked convention; per-therapist colouring of the whole card is NOT it** (that is
  a registered Wave 10 fallback, only if CB staff QA rejects the stripe).
- **Per-therapist identity (W9-05):** the therapist NAME on every card is the
  authoritative identifier; a deterministic per-therapist COLOUR reinforces it as a
  left **stripe** + a **dot** beside the name. The colour is
  `apps/web/lib/scheduling/therapist-color.ts` - an FNV-1a hash of the therapist id
  into a 7-hue palette of existing `-700` tokens (accent-2, accent-1, v2-blue /
  -burgundy / -green / -gold / -lavender), so no hex drifts and `tokens.test.ts`
  stays green. Colour never the only cue (the name is text); two therapists sharing
  a hue are disambiguated by name.
- **Lifecycle vs confirmation are two locked axes, never merged.** `status`
  (scheduled/confirmed/completed/cancelled/no_show) and `confirmation_state`
  (pending/confirmed/declined) display independently. **Strikethrough = cancelled**
  (`status`), never a confirmation cue - a display binding, not an axis change. A
  **cancelled card SUPPRESSES the confirmation tick**, so a cancelled-and-confirmed
  card can never render a check + a strikethrough as one combined glyph.
- **Blocked-time band (W9-04), scope (A):** `time_off` renders as a muted, hatched,
  **non-interactive** band, and the 30-min slot buttons underneath are `disabled`
  (non-bookable by mouse AND keyboard - never a pointer-events overlay alone).
  `time_off` is per therapist but the grid has DAY columns and no therapist axis,
  so the band is drawn **only when the agenda is scoped to one therapist**; under
  "Todos os terapeutas" no band is drawn (that would falsely claim the whole clinic
  is blocked). The gap is visibility-only - booking already excludes blocked slots
  (W5-12).

## Empty states (W7-03)

Exactly: icon badge, title, subtitle, optional action. **Nothing renders above the
icon.** The azulejo `HeritageBand` and the `EmptyState heritage` prop were removed
platform-wide and must not return. (`HeritageDivider`/`HeritageCorners`/
`HeritageFrame` serve the shell/auth surfaces, not empty states.) The "Acoes
destrutivas" block is a `<details>` collapsed by default, contained where it
mounts, never expanded by default or relocated without an owner ruling.

## Bodychart / legend locks (W5-25)

The Local da dor bodychart plots nine `marker_type` values, each with a **unique
geometric SHAPE and a unique COLOUR**. **Shape is the authoritative carrier of
meaning; colour reinforces - never colour alone** (the chart must read in greyscale
and for colour-vision-deficient users). An **always-visible legend** (not a
hover/disclosure) maps each shape+colour to its pt-PT name. The nine hues are a
dedicated `marker-*` palette in `apps/web/app/globals.css`, each AA (>= 4.5:1)
against the chart surface `#F0F3F6`; **magenta is reserved for the brand lockup**
and is not a marker hue. The frozen `osteopathy-v3.json` enum and the stored marker
shape `{ marker_type, x, y, view }` are untouched (render-only). No `packages/ui`
primitive is added for it.

## i18n and copy

All user-facing copy is pt-PT via i18n keys, added to BOTH `strings.pt.json` and
`strings.en.json` (`StringKey` is the intersection - a one-file key fails
typecheck). en-GB is faithful, not machine-literal. Plain hyphens only; no em/en
dashes; correct pt-PT diacritics.
