# W6-06a Color-equity palette plan (Wave 06 design pass)

Docs-only. Produced with the `/ui-ux-pro-max` skill (rule categories 1
Accessibility and 6 Typography & Color: `color-contrast`, `color-semantic`,
`color-accessible-pairs`, `color-not-only`, `visual-hierarchy`). This is the spec
W6-06b implements; it changes no product code and no token hex.

## Owner mandate (verbatim)

Promote the logo purple into general UI usage at a fixed equity:
**55 percent white + grey, 25 percent cyan, 20 percent purple.** Accessibility
**AA preserved** throughout. Canonical brand hexes are unchanged; this is a USAGE
ratio, not a re-hex.

## Canonical tokens (unchanged, guarded by `packages/ui/src/tokens.test.ts`)

| Role | Token | Hex | Note |
|------|-------|-----|------|
| Cyan (accent-2) | `--color-brand-teal` / `accent-2-500` | `#45B9A7` | canonical, do not drift |
| Purple (accent-1) | `--color-brand-magenta` / `accent-1-700` | `#8B1863` | canonical logo purple, do not drift |
| Grey (primary) | `--color-brand-grey` / `primary-300` | `#98B2C2` | canonical, do not drift |

The full accent-1 (purple) scale already exists in `packages/ui/theme.css`
(`--color-accent-1-50 #FAF4F8` ... `-700 #8B1863` (base) ... `-900 #4E0E38`); this
plan uses those existing tints. No new hex is introduced.

## The 55 / 25 / 20 usage map (per surface-region)

The ratio is a USAGE budget across each surface, not a per-component rule.

### 55 percent - white + grey (structure)
- Page/app backgrounds, cards, panels, glass surfaces: `bg-v2-surface`,
  `bg-surface-muted`, `GlassPanel`/`glass-card`.
- Borders, dividers, rails: `border-v2-border`, `border-border-strong`.
- Body + secondary text: `text-text-primary`, `text-v2-text-primary`,
  `text-text-secondary`, `text-v2-text-secondary`.
- This is the dominant field on every screen (backgrounds + neutral text + chrome).

### 25 percent - cyan (accent-2) (primary interaction)
- Primary links and text-accents: use **`accent-2-700 #2F7E72`** (4.83:1 on white,
  AA) via a `text-brand-teal`-equivalent token. **Never the base `#45B9A7` for text**
  (2.40:1, fails AA).
- Primary CTAs / filled primary buttons: cyan fill with white or `accent-2-900`
  text (see AA table).
- Data-viz accent: the Estatisticas chart bars (already cyan) and any KPI accent.
- Focus ring stays its existing token (unchanged).

### 20 percent - purple (accent-1) (secondary emphasis)
- Selected / active states: active tab indicator, selected list row accent,
  current nav item marker.
- Section accents: section-header underlines/markers, group dividers on dashboards
  and the patient section, owner-scope areas (Administracao section headers,
  Estatisticas breakdown headers).
- Secondary emphasis: badges/pills for non-semantic emphasis (NOT status - status
  keeps its semantic green/amber/red/neutral tints).
- Purple is the accent that was previously "reserved for brand lockup"; it now
  carries selected/section emphasis at ~1/5 of the accent budget.

### Never recoloured by this plan
- Semantic status colours (success/warning/error/neutral tints).
- The Agenda/Marcacoes service tints (green/lavender/gold/blue/burgundy) - a
  separate presentation palette, deliberate, unchanged.
- The bodychart marker palette (see exclusion below).

## AA proof - every purple (accent-1) pairing this plan introduces

Contrast ratios computed to WCAG 2.1 (normal text needs >= 4.5:1; large text / UI
glyphs need >= 3:1). All introduced purple pairings meet AA for normal text.

| Foreground | Background | Ratio | Meets |
|-----------|-----------|-------|-------|
| `accent-1-700 #8B1863` | white `#FFFFFF` | 8.72:1 | AA (normal text) |
| `accent-1-700 #8B1863` | `primary-50 #F6F8F8` (grey surface) | 8.18:1 | AA (normal text) |
| `accent-1-700 #8B1863` | `accent-1-50 #FAF4F8` (purple tint surface) | 8.04:1 | AA (normal text) |
| `accent-1-700 #8B1863` | `accent-1-100 #F4E6EF` (purple tint surface) | 7.23:1 | AA (normal text) |
| `accent-1-600 #AE1E7C` | white `#FFFFFF` | 6.41:1 | AA (normal text) |
| `accent-1-800 #6D134D` | white `#FFFFFF` | 11.35:1 | AA (normal text) |
| `accent-1-900 #4E0E38` | white `#FFFFFF` | 14.54:1 | AA (normal text) |
| white `#FFFFFF` | `accent-1-700 #8B1863` (purple fill) | 8.72:1 | AA (normal text) |
| white `#FFFFFF` | `accent-1-800 #6D134D` (purple fill) | 11.35:1 | AA (normal text) |
| white `#FFFFFF` | `accent-1-900 #4E0E38` (purple fill) | 14.54:1 | AA (normal text) |

Rules for W6-06b:
- Purple TEXT / glyphs on a light background: use `accent-1-700` or darker
  (>= 6.41:1 everywhere in the table).
- Purple FILL (badge/indicator) with text on it: use white text on `accent-1-700`
  or darker.
- Purple tint SURFACES (`accent-1-50`/`-100`) are backgrounds only; put
  `accent-1-700`+ text on them (>= 7.23:1).

### Cyan AA note (accent-2)
- `accent-2-700 #2F7E72` on white = 4.83:1 (AA) -> use for cyan text/links.
- `brand-teal #45B9A7` on white = 2.40:1 (FAILS AA) -> decorative fills only,
  never text; when used as a fill, text on it must be dark (`accent-2-900`) or the
  fill must be for large UI shapes (e.g. chart bars, where the value is also shown
  as text - `color-not-only`).

## Bodychart marker palette - EXPLICIT EXCLUSION

The nine-entry bodychart marker palette from W5-25 / W5-28 lives in
`apps/web/app/globals.css` under `@theme` as `--color-marker-*` (blockage, scar,
hypertonicity, hypotonicity, radiation, location, paresthesia, rotation-right,
rotation-left), generating the `fill-marker-*` / `stroke-marker-*` utilities. It is
NOT part of the brand palette. This equity plan does NOT touch it: W6-06b must not
add, remove, re-hex, or re-map any `marker-*` token, and
`git diff origin/main -- apps/web/app/globals.css` for the marker block must be
empty.

## Proposed UI-STYLE.md section 7 replacement wording (for W6-06b to apply)

Current section 7 bullet:

> - **Brand:** `text-brand-teal` (links/accents), magenta reserved for brand lockup.

Replace with:

> - **Brand equity (55 / 25 / 20):** structure is 55 percent white + grey
>   (surfaces, borders, `text-*-primary`/`-secondary`); cyan (accent-2) is 25
>   percent for PRIMARY interaction - links/CTAs use `accent-2-700 #2F7E72` for
>   text (AA 4.83:1); never the base `#45B9A7` for text; purple (accent-1
>   `#8B1863` + its tints) is 20 percent for SECONDARY emphasis - selected/active
>   states, section accents, owner-scope headers. Semantic status tints and the
>   Agenda service tints are unchanged. Every introduced purple pairing meets AA
>   (see docs/design/W6-06-color-equity-palette-plan.md). The bodychart
>   `marker-*` palette is out of scope and never touched. Canonical hexes never
>   drift (`packages/ui/src/tokens.test.ts`).

## Constraints for W6-06b (implementation)

- Canonical hexes unchanged; `tokens.test.ts` stays green.
- Every restyled purple pairing carries an AA number from the table above; re-verify
  in situ.
- Bodychart `marker-*` untouched.
- Migration-free, presentation only.
- Any ficha-touching restyle keeps W5-13 compat green.
