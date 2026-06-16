# Brand & Heritage SVG Assets

Vector assets for the OsteoJP UI redesign. All files are true vector (no embedded
raster), use only the three brand hexes from [`docs/brand-tokens.md`](../brand-tokens.md),
and ship as `viewBox`-only SVGs (no fixed `width`/`height`) so they scale to any
container.

| Token | Hex |
|---|---|
| `brand-grey` | `#98B2C2` |
| `brand-magenta` | `#8B1863` |
| `brand-teal` | `#45B9A7` |

## Source & provenance

The logo files are derived from the official `Logotipo_OsteoJP_2023.pdf` (Adobe
Illustrator CC 2015, true vector, no embedded raster). Converted with
`pdftocairo -svg` (poppler), then split into the three lockups and cleaned:
metadata removed, `viewBox` set, `width`/`height` stripped, fills flattened to the
brand hexes.

The source PDF renders the two cradling hands as gradient meshes and adds a soft
blurred drop-shadow (the only raster element in the export). Per `brand-tokens.md`,
which already collapses each hand to a single flat brand color, the gradients are
flattened to flat `#8B1863` (left hand) and `#45B9A7` (right hand), and the
decorative drop-shadow is dropped. All path geometry is otherwise preserved exactly.

> The source PDF is **not** committed to the repo (it lives outside version control).
> To regenerate, re-run the conversion against the official PDF.

## Brand logo — `packages/ui/src/assets/brand/`

| File | Contents | Intended use |
|---|---|---|
| `logo-full.svg` | Mark + wordmark + tagline ("Osteopatia, Fisioterapia e Formação") | Auth screens (sign-in / sign-up), the full-page brand expression, printed report headers, the "about / footer" brand block. Use where there is vertical room for the tagline. |
| `logo-lockup.svg` | Mark + wordmark (no tagline) | Primary in-app lockup: top nav / app header, email headers, PDF document headers. The default logo for most UI surfaces. |
| `logo-mark.svg` | Mark only, square viewBox | Favicon, app icon, small/collapsed nav, avatars, loading spinners, any square or sub-24px context where the wordmark would be illegible. |

All three are single-color-per-region flat fills using only `#98B2C2`, `#8B1863`,
and `#45B9A7`.

## Heritage motifs — `packages/ui/src/assets/heritage/`

Decorative, culturally-rooted motifs. Each is a single-row, **horizontally tileable**
band on a transparent background, authored on a `16 × 12` viewBox (12 units tall) so
it reads cleanly at an 8–12px rendered height. Strictly brand palette — no red/black
folk colors.

| File | Color | Motif | Intended use |
|---|---|---|---|
| `motif-border-moldovan.svg` | `brand-magenta` `#8B1863` | Moldovan embroidery band: chain of stepped diamonds (ring + center dot + apex buds), symmetric | Decorative border band |
| `motif-divider-azulejo.svg` | `brand-teal` `#45B9A7` | Azulejo scrollwork: quatrefoil rosettes linked by a continuous scroll wave | Section divider |

Both tile seamlessly when repeated side by side (left edge meets right edge with no
visible seam) — implement as a repeating CSS `background-image` or an SVG `<pattern>`.

### Usage rule (non-negotiable)

Heritage motifs are **decorative accents only**. They appear **only** on:

- **Auth screens** (sign-in, sign-up, password reset)
- **Empty states** (no records, no appointments, no results)
- **Loading states** (skeletons, spinners backdrops)
- **Dividers** (section separators)

Do **not** place heritage motifs on clinical record views, forms, data tables,
invoices, declarations, or any dense functional surface. Product chrome stays clinical
and restrained per the brand tone ("padrão ouro", serious, not warm).

## Heritage v2 (edge-frame motifs): `packages/ui/src/assets/heritage/v2/`

Added for the OsteoJP v2 design system (SPEC-v2-foundation.md section 6). These power
the `HeritageFrame` component: a persistent, low-opacity decorative frame behind the
content area. Two new tileable watercolor SVGs, vertically tileable so they run down the
left and right edges and meet the corner pieces with no visible seam.

| File | Color | Motif | Opacity | Placement |
|---|---|---|---|---|
| `embroidery-left.svg` | Moldavian Burgundy `#A44B58` | Moldavian embroidery geometry, watercolor faded | 20 percent | Top-left corner, left vertical edge, bottom-left corner |
| `azulejo-right.svg` | Portuguese Blue `#5B8FD9` | Portuguese azulejo, watercolor faded | 18 percent | Top-right corner, right vertical edge, bottom-right corner |

Scope and rules:

- **OsteoJP-theme-scoped.** These render only when the active tenant theme has heritage
  enabled. Other tenants inherit the same glass and sidebar with a neutral palette and no
  heritage (licensing neutrality, SPEC-v2-foundation section 2).
- The colors `#A44B58` and `#5B8FD9` are the OsteoJP v2 theme accents, not the logo palette.
  The logo palette (teal, magenta, grey) in brand-tokens.md is unchanged and is not used by
  the v2 frame.
- The frame is `aria-hidden`, `pointer-events: none`, inset, opacity-capped, and never
  reduces text contrast below AA. On data-dense screens it runs at the `restrained` density
  (corners plus a thin edge only). It is allowed on auth screens, empty states, and staff
  data screens, and is FORBIDDEN on the clinical record editor.
- Authored `viewBox`-only (no fixed width/height) so they scale to any container edge.
