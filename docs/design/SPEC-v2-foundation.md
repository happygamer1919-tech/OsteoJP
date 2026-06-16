# SPEC-v2-foundation: OsteoJP v2 design system (foundation)

Status: ready for implementation (design loop V2-W0)
Consumed by: docs/design/PLAN.md, V2 waves.

Sources of truth, in priority order:
1. This file (the v2 glass system, palette, AppShell, primitive inventory).
2. docs/brand-tokens.md (logo palette reference, type scale, spacing, radius origin, motion tokens). The logo hexes there stay the logo reference. This file does NOT change them.
3. docs/brand-voice.md (every visible string, PT first, EN second, via packages/i18n keys). Unchanged.

Hard precedence note: this v2 foundation SUPERSEDES the v1 visual specs (SPEC-foundation.md, SPEC-staff-screens.md) for the staff app (apps/web). The v1 specs are kept for history and carry a one-line supersede note at their top. brand-voice.md still governs all copy. brand-tokens.md still governs the logo palette, the type scale, spacing, radius origins, shadows-as-baseline, and motion tokens.

This is a docs-only spec. It defines what V2 waves build. It introduces no code, no migrations, no RLS, no auth, no payment, no webhook, and no workflow changes.

---

## 1. Direction and feel

Premium healthcare dashboard. The visual language draws on four references at once: Portuguese azulejo heritage, Moldavian embroidery geometry, iOS-26 style glassmorphism, and Scandinavian medical minimalism, finished with a luxury-wellness restraint.

The product should read as calm, trustworthy, premium, therapeutic, elegant, and culturally personalized. It is not corporate, not dark, not harshly clinical. The brand-voice register is unchanged: serious, precise, reassuring, formal address with patients. The visual warmth lives in light, glass, and a soft palette, never in the copy.

The feel target: very soft daylight on frosted glass. Surfaces float on faint shadows. Color is used in low saturation, as accent and tint, never as a flood. Heritage ornament is present on the OsteoJP tenant theme only, always restrained, always behind content.

---

## 2. Tenant scoping (critical, this is multi-tenant SaaS)

OsteoJP is licensed multi-tenant SaaS. The visual system splits into two layers, and the split is load-bearing for licensing neutrality.

### 2.1 Product default (all tenants inherit)

These are the PRODUCT DEFAULT and ship to every tenant, OsteoJP included:

- The glass system (cards, panels, navigation glass, blur, radius, shadow, lighting feel).
- The sidebar AppShell (280px floating glass left panel, seven nav items, user-area cluster).
- Layout, radius, shadow, blur, and typography tokens.
- The full glass primitive inventory (GlassCard, GlassKpiCard, QuickActionTile, ResumoChart, StatusChip, StatusBadge, GlassPanel, the AppShell, the user-area cluster).

A non-OsteoJP tenant gets all of the above with a NEUTRAL palette and NO heritage ornament.

### 2.2 OsteoJP tenant theme (this tenant only)

These are scoped to the OsteoJP tenant theme and never leak to other tenants:

- The specific accent palette in section 3 (Portuguese Blue, Moldavian Burgundy, Wellness Green, Soft Lavender, Warm Gold).
- The heritage edge frame (HeritageFrame component, section 6).

Implementation contract: theme tokens resolve per tenant. The glass and shell tokens are tenant-invariant. The accent palette and the heritage flag are tenant-scoped values. The default tenant theme is neutral with no heritage, exactly as today. A tenant opts in to heritage explicitly. This preserves the existing tenant-scoped heritage rule from brand-tokens.md section 6.

---

## 3. Palette (OsteoJP theme)

Adopt these values exactly for the OsteoJP tenant theme. Other tenants substitute a neutral palette behind the same token names.

### 3.1 Base surfaces and text

| Token | Value | Use |
|---|---|---|
| `v2-bg` | `#F7F8FA` | Page background |
| `v2-surface` | `#FFFFFF` | Main opaque surface (where glass is not used) |
| `v2-border` | `rgba(220,225,235,0.6)` | Hairline border on opaque surfaces and dividers |
| `v2-text-primary` | `#223042` | Headings, body, primary text |
| `v2-text-secondary` | `#66727F` | Captions, helper text, metadata, secondary labels. AA-corrected from the initial `#6E7A89` (4.37:1 on white, below the §10 AA floor) to `#66727F` (4.91:1 on white, ~4.6:1 on `v2-bg`); same cool grey-blue hue. |

### 3.2 Accents (base = 500)

| Token | Base hex | Role |
|---|---|---|
| Portuguese Blue | `#5B8FD9` | Azulejo motif, graphs, blue icons, Marcações hoje KPI, blue service category |
| Moldavian Burgundy | `#A44B58` | Embroidery motif, decorative borders, Osteopatia service category |
| Wellness Green | `#7AB79F` | Success, active menu item, patient icons, primary action fills |
| Soft Lavender | `#A786E8` | Clinical records, forms, novas-fichas KPI, lavender service category |
| Warm Gold | `#D5A25A` | Revenue, premium indicators, gold service category |

The active-menu state uses Wellness Green with a glass background `rgba(122,183,159,0.15)`.

### 3.3 Accent scales (50 to 900)

Tuned tint and shade ramps around each base pinned at 500. These are design values, not regenerated by formula at build time. If a primitive needs a step not listed, round to the nearest defined step rather than inventing a value.

Portuguese Blue (`v2-blue`):

| Step | Hex | Step | Hex |
|---|---|---|---|
| 50 | `#EEF4FC` | 500 | `#5B8FD9` (base) |
| 100 | `#DBE7F8` | 600 | `#4275C2` |
| 200 | `#BBCFF0` | 700 | `#345C9C` |
| 300 | `#97B5E8` | 800 | `#294876` |
| 400 | `#7AA1E0` | 900 | `#1F3454` |

Moldavian Burgundy (`v2-burgundy`):

| Step | Hex | Step | Hex |
|---|---|---|---|
| 50 | `#F8EEEF` | 500 | `#A44B58` (base) |
| 100 | `#F1DADD` | 600 | `#8A3D49` |
| 200 | `#E3B6BC` | 700 | `#6E303A` |
| 300 | `#D28E97` | 800 | `#54252D` |
| 400 | `#BC6975` | 900 | `#3C1A20` |

Wellness Green (`v2-green`):

| Step | Hex | Step | Hex |
|---|---|---|---|
| 50 | `#EFF7F3` | 500 | `#7AB79F` (base) |
| 100 | `#DCEDE5` | 600 | `#629C86` |
| 200 | `#BBDDCD` | 700 | `#4E7D6B` |
| 300 | `#A6D2BE` | 800 | `#3C6052` |
| 400 | `#90C5AD` | 900 | `#2C463C` |

Soft Lavender (`v2-lavender`):

| Step | Hex | Step | Hex |
|---|---|---|---|
| 50 | `#F4F0FC` | 500 | `#A786E8` (base) |
| 100 | `#E9E0F9` | 600 | `#8A66D1` |
| 200 | `#D4C3F3` | 700 | `#6E4FAB` |
| 300 | `#C7AEF0` | 800 | `#543C82` |
| 400 | `#B79AEC` | 900 | `#3D2C5E` |

Warm Gold (`v2-gold`):

| Step | Hex | Step | Hex |
|---|---|---|---|
| 50 | `#FBF4EA` | 500 | `#D5A25A` (base) |
| 100 | `#F7E8D2` | 600 | `#BA8742` |
| 200 | `#EFD1A6` | 700 | `#946A34` |
| 300 | `#E7BD83` | 800 | `#6F5028` |
| 400 | `#DEAF6E` | 900 | `#4F391D` |

### 3.4 AA contrast rule for accents (binding)

Base accents (500) and their tints are accent and icon tones. As text on white or on glass they are not guaranteed AA. Any accent used as label text on a light surface uses the 700 step or darker. Status text follows the same rule: the colored dot may carry the base tone (3:1 graphical-object bar), the label text uses 700 or `v2-text-primary`. The a11y reviewer enforces this on every V2 wave.

---

## 4. Glass system

The glass system is the product default and the core of the v2 look.

### 4.1 Glass tokens

| Token | Value | Applies to |
|---|---|---|
| `v2-glass-card-bg` | `rgba(255,255,255,0.72)` | Card and panel fills |
| `v2-glass-card-blur` | `blur(24px)` | Card and panel backdrop filter |
| `v2-glass-card-border` | `1px solid rgba(255,255,255,0.45)` | Card and panel border |
| `v2-glass-nav-blur` | `blur(20px)` | Navigation buttons and the sidebar panel |
| `v2-glass-nav-opacity` | 75 percent | Navigation button surface opacity |
| `v2-glass-active-bg` | `rgba(122,183,159,0.15)` | Active nav item (Wellness Green glass) |

### 4.2 Radius

| Token | Value | Use |
|---|---|---|
| `v2-radius-default` | `24px` | Cards, panels, drawers, inputs inside glass |
| `v2-radius-kpi` | `28px` | KPI cards only |

This is a v2-specific radius scale and sits above the brand-tokens.md radius origin. The brand-tokens radius scale still governs the v1 surfaces that v2 does not touch.

### 4.3 Shadow and lighting

| Token | Value | Use |
|---|---|---|
| `v2-shadow-float` | `0 8px 30px rgba(0,0,0,0.05)` | The single float shadow for cards, panels, KPI cards, tiles |

Lighting feel: very soft daylight, no harsh shadows. Cards appear to float on `v2-shadow-float`. No second, heavier shadow layer. Hover lift adds translateY only, not a darker shadow (see motion, section 8).

### 4.4 Backdrop-filter fallback

Where `backdrop-filter` is unsupported, glass surfaces fall back to a solid `rgba(255,255,255,0.92)` fill so contrast and legibility never depend on the blur. The fallback is a hard requirement, not a nicety: text contrast must hold without the blur.

---

## 5. Typography

Inter is the primary family. SF Pro Display is the documented alternative. The brand-tokens.md Inter stack and type scale remain the baseline; v2 adds the greeting size and confirms the weight ladder.

| Role | Weight |
|---|---|
| Heading | 600 |
| Section title | 500 |
| Body | 400 |

| Token | Size | Weight | Use |
|---|---|---|---|
| `v2-greeting` | 42px | 600 | Page greeting on the dashboard ("Bom dia, Ana") |

No exclamation marks anywhere in the product UI, per brand-voice. The greeting reads "Bom dia, Ana" with no exclamation. This is a hard copy rule the design reviewer checks on every greeting and toast.

---

## 6. Heritage edge frame (OsteoJP theme only)

A persistent, low-opacity decorative frame. OsteoJP tenant theme only. Implemented as a single component, `HeritageFrame`.

### 6.1 Composition

- Left side: Moldavian embroidery geometry, color Moldavian Burgundy `#A44B58`, opacity 20 percent, placed on the top-left corner, the left vertical edge, and the bottom-left corner.
- Right side: Portuguese azulejo, color Portuguese Blue `#5B8FD9`, opacity 18 percent, watercolor faded, placed on the top-right corner, the right vertical edge, and the bottom-right corner.

Assets are the two tileable SVGs registered in docs/design/assets.md (heritage-v2 entry): `embroidery-left.svg` (burgundy) and `azulejo-right.svg` (blue), living at `packages/ui/src/assets/heritage/v2/`.

### 6.2 Allowed and forbidden surfaces

Allowed (as a restrained frame):

- Auth screens.
- Empty states.
- Staff DATA screens (dashboard, agenda, patients, fichas list, review, admin), behind the content area.

Forbidden (hard rule, no exceptions):

- The clinical record editor. No ornament behind clinical authoring. This carries the v1 rule forward unchanged: the editor stays clean.

### 6.3 Inset, opacity cap, and AA rules (binding)

The frame is a backdrop, never a participant in the layout.

1. The frame is inset from the content edges and capped at the opacities above (20 percent burgundy, 18 percent blue). It sits behind content and never crowds right-aligned items (chevrons, phone numbers, status chips).
2. The frame is `aria-hidden="true"` and `pointer-events: none`.
3. The frame never reduces any text contrast below AA. Where content sits near a frame edge, the frame yields: legibility wins over decoration.
4. On data-dense screens the frame is MORE restrained than a happy-path mockup might suggest. The component exposes a `density` prop (`calm` for auth and empty states, `restrained` for data screens). `restrained` reduces the effective coverage and keeps the frame to the corners and a thin edge, so dense tables and grids never read as busy.
5. The frame wraps the content area only, never the sidebar panel.

### 6.4 Component contract (HeritageFrame)

- Renders only when the active tenant theme has heritage enabled. On a neutral tenant it renders nothing.
- Props: `density` (`calm` | `restrained`), and a surface guard that refuses to render on the clinical editor route (defense in depth against accidental placement).
- Positioned absolutely behind the content area; the content area owns a stacking context so the frame never overlaps interactive layers.

---

## 7. Sidebar AppShell (product default)

The sidebar AppShell replaces the staff top bar across apps/web. It is the product default and ships to all tenants (neutral palette, no heritage, for non-OsteoJP tenants).

### 7.1 Panel

- 280px wide, floating glass left panel using `v2-glass-nav-blur` and the nav opacity token.
- OsteoJP logo at the top of the panel, approximately 220px wide. Uses the existing brand lockup asset.
- The panel does not scroll with content; the content area scrolls independently.

### 7.2 Nav items (exact order)

Seven items, in this order:

1. Início
2. Agenda
3. Pacientes
4. Fichas Clínicas
5. Marcações
6. Revisão
7. Administração

Relatórios and Definições are intentionally omitted from v1. Do not add them.

- Active item: Wellness Green accent with the `v2-glass-active-bg` glass background.
- Each item has an icon plus label. Role filtering is applied by the caller exactly as today (the shell renders the nav data it is given; it never invents role logic).
- Marcações routes to a list view of the same scheduling data Agenda renders as a grid (see SPEC-v2-agenda and the V2-W7 ticket). Until that route ships, the Marcações nav item points to a placeholder empty state. The AppShell ships all seven items from day one regardless.

### 7.3 User-area cluster

Top-right of the content area (not the sidebar panel):

- Notification bell.
- Avatar circle with initials.
- Name.
- Role label (example: Ana Morais / Administradora).

This is a single composed primitive, `UserAreaCluster`, consumed by the AppShell. It renders the signed-in staff member from existing session data. No new data.

### 7.4 Heritage integration

The HeritageFrame wraps the content area, not the sidebar panel. On a neutral tenant the frame is absent and the layout is identical minus ornament.

---

## 8. Motion

v2 reuses the existing motion tokens from SPEC-foundation section 2 (duration-fast 150ms, duration-base 200ms, duration-slow 250ms, ease-standard, and the reduced-motion handling). v2 adds one interaction:

- Hover lift: interactive glass tiles and cards translate `translateY(-4px)` on hover over duration-base with ease-standard. No shadow change, no scale. Under `prefers-reduced-motion: reduce`, the lift is suppressed and only a faint border or background tint marks hover.

No motion exceeds the 250ms slow token. No spring, no bounce, no parallax. The "very soft daylight" feel forbids energetic motion.

---

## 9. Glass primitive inventory

The complete set of primitives the V2 section waves consume. Every primitive ships in V2-W0 (foundation). No section wave introduces a new primitive: if a section needs something not listed here, it is a foundation follow-up, never inline in a parallel wave.

| Primitive | Purpose | Key tokens |
|---|---|---|
| `GlassCard` | Generic floating glass container (header, body, footer slots). Interactive variant has a single tab stop and the hover lift. | card bg, blur, border, `v2-radius-default`, `v2-shadow-float` |
| `GlassKpiCard` | Dashboard KPI card: icon circle (accent-tinted), value, caption, optional delta caption. 180px tall. Loading skeleton built in. | `v2-radius-kpi`, accent tints, float shadow |
| `QuickActionTile` | 160x160 glass tile: large icon, label, hover lift translateY(-4px). Single tab stop, acts as a link or button. | card bg, blur, `v2-radius-default`, hover lift |
| `ResumoChart` | Minimal line chart, blue-to-green gradient stroke, light grid, no dark colors. Renders against supplied series or an empty placeholder. | `v2-blue`, `v2-green`, light grid |
| `StatusChip` | Glass restyle of the v1 StatusChip. Tone plus optional dot. Used for record/review status. Label text at 700 or `v2-text-primary` per the AA rule. | accent tints, dot tones |
| `StatusBadge` | Glass restyle of the v1 status badge. Used in lists and appointment rows (Confirmada green, Pendente orange). | green/warning tones |
| `GlassPanel` | Larger glass container for grouped content (upcoming-appointments panel, weekly-summary panel, notes card). Header plus body, optional footer link with chevron. | card bg, blur, `v2-radius-default`, float shadow |
| `HeritageFrame` | The OsteoJP-theme edge frame (section 6). Tenant-gated, aria-hidden, density-aware. | burgundy 20 percent, blue 18 percent |
| `SidebarAppShell` | The 280px floating glass shell (section 7), seven nav items, content area, HeritageFrame integration. | nav glass, active glass, float shadow |
| `UserAreaCluster` | Bell, avatar with initials, name, role label. Consumed by the shell. | text tokens, accent avatar tint |

States every primitive must define where applicable: default, hover, focus-visible (using the existing `ring-focus-ring` token from brand-tokens §1.9), loading (skeleton), empty, error. The section specs reference these primitives by name and never request a new one.

---

## 10. Negative constraints (do not)

Encoded as a hard "do not" list. The design reviewer treats a violation as a blocker.

- No dark mode.
- No neon or aggressive colors.
- No red alert styling. Errors use the restrained error tone from brand-tokens, never a saturated red flood.
- No harsh shadows. Only `v2-shadow-float`.
- No black backgrounds.
- No Material Design (no elevation ladders, no ink ripples, no FABs).
- No skeuomorphism.
- No busy layouts. Whitespace and glass carry the design.
- No medical-equipment or patient imagery.
- No stock photos.
- No low-contrast text. AA is the floor everywhere.
- No 3D or cartoon illustration.

---

## 11. Relationship to v1 and to brand-tokens.md

- The v1 specs (SPEC-foundation.md, SPEC-staff-screens.md) are superseded for the staff app by this v2 set. They are kept for history with a supersede note at the top of each.
- brand-tokens.md keeps the logo palette (teal, magenta, grey) as the LOGO reference and keeps the type scale, spacing, motion tokens, and the focus-ring token. v2 consumes those tokens. v2 does not edit brand-tokens.md.
- brand-voice.md is unchanged and still governs every visible string.
- The three v1-to-v2 reversals (heritage scope, folk colors, palette provenance) and the shell change are logged in docs/DECISIONS.md.
