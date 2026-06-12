# SPEC-foundation — packages/ui Wave 1 component specifications

Status: ready for implementation
Consumed by: the design loop (docs/design/PLAN.md, Wave 1)
Sources of truth, in priority order:
1. docs/brand-tokens.md (colors, type, spacing, radius, shadows)
2. docs/brand-voice.md (all visible strings, PT first, EN second)
3. docs/design/ui-inventory.md (current state, migration facts)
4. This file (component behavior, anatomy, states)

Hard rule: if this spec and brand-tokens.md ever disagree on a value, brand-tokens.md wins and the conflict gets logged in QUESTIONS.md.

---

## 1. Design direction

Five principles. Every component decision below derives from these.

1. **Calm clinical surface.** White cards on the cool `bg` page color, hairline `border` dividers, generous whitespace. The interface should read like a well organized clinical chart, not a dashboard product.
2. **Rationed accent.** Teal (`accent-2`) is the single action color: primary buttons, active nav, links, focus rings. Magenta (`accent-1`) appears only in the brand lockup, the heritage motifs, and at most one decorative accent per screen. Neither color is ever a large surface fill.
3. **States are first class.** Every async surface ships skeleton, empty, and error states in the same PR as the component. Lists never blank-then-pop.
4. **Fast, quiet motion.** 150 to 250ms, ease-out, no bounces, no scale-ups. `prefers-reduced-motion` collapses all transitions to 0ms.
5. **Heritage as signature, not wallpaper.** The Moldovan and azulejo motifs appear exclusively on auth screens, empty states, loading states, and section dividers. Never behind data. This is the one memorable visual risk; everything around it stays disciplined.

## 2. Global rules

These apply to every component and are enforced by the design-reviewer agent.

**Tokens only.** No hex literals, no rgb(), no arbitrary Tailwind values like `p-[10px]` in component code. Colors, spacing, radius, type, and shadows come from the theme.css token layer. If a needed token does not exist, the task stops and logs it; the loop does not invent values.

**Spacing.** 4px scale only. Component internal padding defaults: compact rows `space-2`/`space-3`, buttons and inputs `space-3` vertical `space-4` horizontal, cards `space-6`, section gaps `space-8`.

**Radius.** Inputs, buttons, chips contextual: buttons and inputs use the default radius (6px), cards use `lg`, chips and avatars use `full`, drawers and dialogs use `xl` on the floating edge only.

**Type.** Inter, weights 400/500/600 only. Scale per brand-tokens.md. Table cells and dense UI use `body-sm` (14px). Labels and chips use `caption` (12px, weight 500). Never bold (700) except where brand-tokens.md explicitly allows.

**Motion tokens.** Added to theme.css in task W1-01:
- `--duration-fast: 150ms` (hover, focus, chip changes)
- `--duration-base: 200ms` (drawers, dialogs, toasts)
- `--duration-slow: 250ms` (page-level skeleton fades)
- `--ease-standard: cubic-bezier(0.2, 0, 0, 1)`
- All transitions wrapped so `prefers-reduced-motion: reduce` sets durations to 0ms.

**Focus.** Every interactive element shows `focus-visible`: 2px ring in the `focus-ring` token (= `accent-2-600`), 2px offset, on every background. The ring color is `≈3.3:1` on white/`surface`, clearing WCAG 2.1 SC 1.4.11; `accent-2-500` was ~2.4:1 and is not used for the ring. Components consume the single `focus-ring` token (`ring-focus-ring`), never a hardcoded scale step. No `outline: none` without a replacement ring in the same rule.

**Contrast.** Text on filled surfaces must meet WCAG AA (4.5:1 normal text, 3:1 large). Known trap: `text-inverse` on `brand-teal` (#45B9A7) fails AA, and so does `text-inverse` on `accent-2-600` (~3.3:1). Filled teal surfaces that carry text therefore use **`accent-2-700` or darker** (`accent-2-700` ≈ 4.8:1); the a11y reviewer blocks anything lighter. `accent-2-600` is for the focus ring and non-text surfaces only. The semantic `success`/`warning` tones likewise fail as text and use their `-700` token for labels (see §4.5).

**Strings.** No hardcoded user-facing strings in components. Components take strings as props; screens resolve them from packages/i18n keys. Copy follows brand-voice.md: sentence case, infinitive verbs on buttons in PT (Gravar, Cancelar, Adicionar), no exclamation marks, no emoji anywhere.

**Emoji.** Forbidden in all UI. Portal emoji removal happens during Wave 3 migration; no new component may render emoji.

**Exports.** Every component exports from `@osteojp/ui` root, has a Storybook story covering every variant and every state listed in its spec, and a docblock usage example.

## 3. Iconography

- Library: `lucide-react`. This is the one new runtime dependency approved for Wave 1, added in task W1-01 in packages/ui only.
- Sizes: 16 (inline with body-sm), 20 (default, buttons and nav), 24 (empty states, page headers). No other sizes.
- Stroke width 1.75 everywhere.
- Color: inherits `currentColor`; never given its own hex.
- Icon-only buttons require `aria-label`. The a11y reviewer blocks any without one.
- Canonical mappings (use consistently across both surfaces): Calendar=agenda/appointments, Users=patients, FileText=clinical records and documents, Receipt=invoices, Settings=settings, MapPin=clinics/locations, User=account, Plus=create, Pencil=edit, ChevronRight=row navigation, X=close, Check=confirm/success, AlertTriangle=warning, Info=info, CircleAlert=error, Clock=pending, Search=search.

## 4. Component specifications

### 4.1 Button

**Variants**
| Variant | Fill | Text | Border | Hover | Active |
|---|---|---|---|---|---|
| primary | `accent-2-700` | `text-inverse` | none | `accent-2-800` | `accent-2-900` |
| secondary | `surface` | `text-primary` | 1px `border-strong` | bg `surface-muted` | bg `neutral-200` |
| ghost | transparent | `text-secondary` | none | bg `surface-muted`, text `text-primary` | bg `neutral-200` |
| destructive | `error` (= `error-700`) | `text-inverse` | none | `error-800` | `error-900` |

Primary fills at `accent-2-700` (not 600): `text-inverse` on `accent-2-600` is only ~3.3:1, below AA for the 12–16px label (§2 contrast). Destructive uses the `error` 50–900 scale (brand-tokens.md §1.8); `error` (= `error-700`) base, stepping to `error-800` / `error-900`.

**Sizes**: sm (height 32px, caption text, px `space-3`), md (height 40px, body-sm, px `space-4`), lg (height 48px, body, px `space-6`). md is default. Portal screens use md minimum (44px touch target met via min-height on tap area).

**States**: default, hover, focus-visible (global ring), active, disabled (`surface-muted` bg, `text-muted` text, no pointer events), loading (spinner replaces leading icon or label is preceded by spinner; button keeps its width, `aria-busy="true"`, pointer events off).

**Anatomy**: optional leading icon (20px), label, optional trailing icon. Icon-only variant is square, requires `aria-label`.

**Props sketch**: `variant`, `size`, `loading`, `disabled`, `iconLeft`, `iconRight`, standard button attributes. Renders `<button>`; an `asChild` or href passthrough is allowed if trivially supported, otherwise skip for Wave 1.

### 4.2 Field, Input, Textarea

Field is the wrapper that owns label, helper text, error text, and required marking; Input and Textarea are the controls inside it.

**Field anatomy** (vertical stack, gap `space-2`):
1. Label: caption size, weight 500, `text-primary`. Required fields append a `*` in `error` color, and the control gets `aria-required`. Optional fields may append the i18n optional-suffix string (per app.doc pattern), decided per screen, not by the component.
2. Control slot.
3. Helper text: small size, `text-secondary`. Replaced by error text when invalid.
4. Error text: small size, `error` color, `role="alert"`, prefixed with the CircleAlert icon at 16px.

**Input**: height 40px, px `space-3`, `surface` bg, 1px `border-strong` border, default radius. Placeholder `text-muted`. Focus: border becomes `accent-2-500` plus the global ring. Invalid: border `error`. Disabled: `surface-muted` bg, `text-muted`. Supports leading icon slot (Search pattern) and trailing slot (clear button).

**Textarea**: same skin, min-height 96px, vertical resize only.

Label is associated via htmlFor/id; error text linked via `aria-describedby`; invalid sets `aria-invalid`.

### 4.3 Select, Checkbox, Switch

**Select (Wave 1 scope)**: styled native `<select>` wrapped in the Input skin with a ChevronDown trailing icon. Same states as Input. A searchable listbox (patient search pattern) is explicitly Wave 2; do not build it here.

**Checkbox**: 20px box, default radius minus 2px, 1px `border-strong`. Checked: `accent-2-600` fill, white Check icon at 14px. Focus ring global. Label sits right, body-sm, clicking label toggles. Indeterminate state supported (minus icon).

**Switch**: track 36x20px, `full` radius, off `neutral-300`, on `accent-2-600`; thumb 16px white circle, travel animated at `--duration-fast`. Renders as `role="switch"` with `aria-checked`. Used for settings toggles (the Ligado/Desligado pattern); paired status text is the screen's job, not the component's.

### 4.4 Card and KpiCard

**Card**: `surface` bg, 1px `border` border, radius `lg`, padding `space-6`, shadow none by default (borders carry the separation; shadows are for floating layers only). Optional header slot (h3 + optional action button right-aligned) and footer slot. Interactive variant (whole card clickable): hover bg `bg`, focus-visible ring, renders as link or button semantics, exactly one tab stop.

**KpiCard** (dashboard summary, borrowed from app.doc): label in caption `text-secondary` on top, value in `h1` size weight 600 `text-primary`, comparison line in small `text-muted` below (string provided by screen). Loading state: label renders, value renders as a Skeleton block 32px tall. Grid behavior is the screen's job (4-up xl, 2-up md, 1-up mobile).

### 4.5 StatusChip

Pill (radius `full`), caption text weight 500, py `space-1` px `space-3`, optional leading 8px dot.

**Tones** (semantic, not status-specific; screens map appointment statuses via i18n):
| Tone | Bg | Text | Dot |
|---|---|---|---|
| success | `success-bg` | `success-700` | `success` |
| warning | `warning-bg` | `warning-700` | `warning` |
| error | `error-bg` | `error` | `error` |
| info | `info-bg` | `info` | `info` |
| neutral | `surface-muted` | `text-secondary` | `text-muted` |

`success` / `warning` labels use the AA-dark `-700` text token (the base tones are ~3.5:1 / ~3.3:1 on their tints and fail AA at 12px); the 8px dot keeps the base tone (3:1 graphical-object bar). error/info/neutral text already clear AA. See brand-tokens.md §1.8 and QUESTIONS Q11.

Canonical appointment mapping for screens (PT terms per brand-voice.md): confirmed=success, pending=warning, cancelled=neutral with strikethrough on the row not the chip, no-show=error, completed=info. The chip itself stays generic.

### 4.6 Drawer and Dialog

**Drawer** (the create/edit surface, app.doc pattern): slides from the right over a `text-primary` at 40% opacity backdrop. Width 480px desktop, 100% under 640px. `surface` bg, radius `xl` on the left edge only, shadow `lg`. Anatomy: sticky header (h2 title + ghost X close button), scrollable body (padding `space-6`), sticky footer (right-aligned actions: ghost cancel + primary confirm, gap `space-3`). Enter/exit at `--duration-base`. Focus trapped, restored on close, Escape closes, backdrop click closes unless `dirty` prop is set (then it triggers the confirm-discard Dialog). `role="dialog"` `aria-modal` labelled by the title.

**Dialog** (confirm/destructive only): centered, max-width 400px, radius `xl`, shadow `lg`. Anatomy: optional icon (24px, semantic color), h3 title, body-sm message, footer with ghost cancel + primary or destructive confirm. Same focus and Escape behavior. Never used for forms; forms live in the Drawer.

### 4.7 Table

Dense clinical list table. `surface` bg inside a Card or standalone with 1px `border` and radius `lg` (overflow hidden).

- Header row: caption weight 500 `text-secondary`, bg `bg`, height 40px, bottom border.
- Body rows: body-sm, height 48px, bottom border `border`, hover bg `bg` when rows are interactive. Interactive rows are reachable by keyboard (row is a link or contains exactly one primary link covering it).
- Cell padding px `space-4`.
- Alignment: text left, numbers and money right, chips and actions right.
- Sort affordance optional per column: ChevronUp/Down 16px, `aria-sort`.
- Built-in states rendered inside the table frame: loading (5 skeleton rows matching column widths), empty (EmptyState component spanning all columns), error (ErrorState spanning all columns).
- Responsive rule: tables never horizontally squash below readability; under 640px screens swap to a stacked card-row pattern (screen-level concern, but Table exports a `TableCardRow` helper for it).

### 4.8 Tabs and SegmentedControl

**Tabs** (section navigation within a screen, e.g. patient profile sections): horizontal row, body-sm weight 500, inactive `text-secondary`, active `text-primary` with 2px `accent-2-600` underline, hover `text-primary`. Keyboard: arrow keys move, proper `role="tablist"` semantics. No lazy-mount logic in Wave 1.

**SegmentedControl** (mutually exclusive input modes, e.g. search-existing vs create-new patient): `surface-muted` track radius `full`, segments py `space-2` px `space-4`, active segment `surface` bg with shadow `sm` and `text-primary`, inactive `text-secondary`. Animates the active pill at `--duration-fast`. Radio-group semantics.

### 4.9 Toast and Banner

**Toast**: bottom-right desktop, bottom above nav on mobile. `surface` bg, 1px `border`, radius `lg`, shadow `lg`, padding `space-4`, max-width 360px. Anatomy: 20px semantic icon, body-sm message, optional single action (ghost sm button), X dismiss. Tones success/error/info (warning rarely toasts). Auto-dismiss 5s, paused on hover and focus. Container is a single `aria-live="polite"` region (`assertive` for error tone). Max 3 stacked, oldest collapses. Enter/exit at `--duration-base`.

**Banner** (standing notices, e.g. pending review, billing): full-width slim bar, py `space-3` px `space-4`, semantic `-bg` background, semantic colored 20px icon, body-sm `text-primary`, optional inline action, X dismiss when `dismissible`. Hard rule carried from the app.doc audit: maximum one banner visible per screen; a second pending notice collapses into the first as a count. Never two stacked banners.

### 4.10 Skeleton, EmptyState, ErrorState

**Skeleton**: `surface-muted` base with a subtle shimmer sweep at `--duration-slow` (sweep disabled under reduced motion, static block remains). Shapes: text line (height matches the text size it replaces), block (arbitrary token-sized rect), circle. Composition helpers: `SkeletonText lines={n}`, `SkeletonTable rows cols`. Rule: skeletons mirror the real layout dimensions so content does not jump on load.

**EmptyState** (copy pattern lifted from app.doc, executed with our brand): centered column, gap `space-4`, padding `space-12` vertical. Anatomy: 48px circular icon badge (`surface-muted` bg, 24px `text-secondary` icon), h3 headline, body-sm `text-secondary` one-line guidance, optional primary or secondary action button. Optional `heritage` boolean: renders the azulejo divider motif (see 4.12) above the icon badge at 10px height. Headline and guidance strings come from screens via i18n; tone per brand-voice.md (an empty screen is an invitation to act, never an apology).

**ErrorState**: same skeleton as EmptyState with CircleAlert in `error`, headline, plain-language cause, and a retry action wired to a callback. Never raw error codes in the headline; codes go in a small `text-muted` line for support reference.

### 4.11 AppShell

Generalizes the existing staff AppShell+NavLinks (the best current pattern per ui-inventory) into packages/ui so both surfaces share it.

**Staff layout (desktop)**: top bar height 64px, `surface` bg, bottom 1px `border`. Left: BrandLockup `lockup` variant size sm linking home. Center-left: icon+label nav items (ghost style; active item gets `surface-muted` bg pill and `text-primary`). Right: location switcher slot, user menu (avatar 32px circle + ChevronDown). Content area: `bg` page color, max-width 1280px centered, px `space-6`, py `space-8`.

**Staff layout (under 768px)**: nav collapses to a hamburger ghost button opening a Drawer with the nav list; a persistent help ghost icon button stays visible (borrowed deliberately from app.doc).

**Portal layout (mobile-first)**: top bar 56px with BrandLockup `mark` size sm and screen title; bottom tab bar height 64px, `surface` bg, top 1px `border`, up to 5 items (icon 24px over caption label), active in `accent-2-700` (≈4.8:1; `accent-2-600` ~3.3:1 fails AA as 12px label and the 24px icon), inactive `text-secondary` (≈5.5:1; `text-muted` ~2.9:1 fails the text and 3:1 icon bars), each tab min 44px touch. Desktop portal centers content at max-width 640px and moves tabs to a top row.

Role-aware nav: AppShell takes nav items as data; screens filter by role via packages/auth/permissions.ts. The shell never hardcodes role logic.

### 4.12 HeritageDivider and heritage surface rules

The only Wave 1 component allowed to render the motif assets from packages/ui/src/assets/heritage/.

- `HeritageDivider variant="moldovan" | "azulejo"`: a horizontal rule built from the tileable SVG repeated via background-image, height 10px, max-width 320px, centered, with `space-8` vertical margin. Decorative only: `aria-hidden`, never focusable, never animated.
- Color comes from the asset (magenta for moldovan, teal for azulejo). No recoloring props in Wave 1.
- Allowed hosts: auth screens, EmptyState (via its `heritage` prop), loading screens, and as a section divider on settings-class screens. The design reviewer blocks any other usage.
- Patient-facing portal usage stays off until JP sign-off (QUESTIONS Q6); staff surfaces may use it now.

## 5. Accessibility baseline (enforced every PR)

1. Visible focus ring on every interactive element.
2. AA contrast on all text and meaningful icons; the teal trap from section 2 applies.
3. Full keyboard paths: drawers and dialogs trap and restore focus, Escape closes, tab order follows visual order.
4. `aria-label` on all icon-only controls; `aria-live` on toast container; `role="alert"` on field errors; `aria-busy` on loading buttons.
5. Touch targets minimum 44px on portal surfaces.
6. `prefers-reduced-motion` respected globally.
7. Language: screens set `lang` correctly (pt-PT default, en-GB alternative); components stay language-agnostic.

## 6. Out of scope for Wave 1

Searchable patient combobox, date and time pickers, the agenda time grid, body chart, file upload tiles, invoice PDF layout, the portal booking stepper, and any screen composition. These are Wave 2 and Wave 3 work and get their own spec files. Do not build ahead of the plan.

---

## 7. HeritageCorners (Wave 4 addition)

Consumed by the design loop, Wave 4 (task W4-01), built in `packages/ui` as a NEW
component. It extends §4.12 (HeritageDivider) and reuses the same two tileable
assets in `packages/ui/src/assets/heritage/`
(`motif-border-moldovan.svg`, `motif-divider-azulejo.svg`). It is the second and
final heritage component; no third heritage surface is introduced by Wave 4.

This is the one place Principle 5 ("heritage as signature, not wallpaper") is
allowed to grow from a hairline divider into a framed presence. Everything below
is written to keep that growth disciplined: heritage frames the content, never
sits behind it.

### 7.1 Purpose and anatomy

HeritageCorners draws the motif as a **perimeter frame** around a full-bleed
surface: ornament clusters anchored in the four corners, optionally joined by
tileable strips along the four edges. The content (an auth card, an empty-state
column) sits centered in a protected inner region the frame never enters.

- Renders as a single `aria-hidden="true"` decorative layer, `pointer-events:
  none`, positioned `absolute inset-0` behind its content (content is a sibling
  at a higher stacking context, or the frame is `z-0` and content `z-10`). The
  frame is never focusable, never animated, never a tab stop.
- Built from the two existing tileable SVGs, **recolored to the brand palette
  only** via the heritage tint rule (§7.4). Unlike HeritageDivider (which bakes
  the asset's own hex), HeritageCorners drives color from tokens so the frame
  obeys the §6 palette structurally.
- The corner clusters use the azulejo four-fold tile (it reads as a corner
  rosette); the edge strips use the moldovan border lattice (it tiles cleanly as
  a running band). Both come from `currentColor`/CSS-variable-driven recolors of
  the existing assets, never new art.

### 7.2 Variants

| Variant | Renders | Allowed on |
|---|---|---|
| `corners-only` (subtle, default) | Four corner clusters only; edges bare. | Auth screens and full-bleed empty states. |
| `corners-plus-edges` (auth only) | Corner clusters plus tileable edge strips joining them on all four sides. | **Auth screens only.** Never on an empty state — it is too much frame around in-app content. |

No other variants. `corners-plus-edges` outside an auth route is a design-reviewer
blocker.

### 7.3 Sizing (4px scale only)

All dimensions snap to the spacing scale in brand-tokens.md §4. No arbitrary
values.

- **Corner cluster**: `space-16` × `space-16` (64px square) per corner, the
  azulejo tile scaled to fill it. Anchored flush to each corner of the host
  surface (top-left, top-right, bottom-left, bottom-right), mirrored per corner
  so the rosette points inward.
- **Edge strips** (`corners-plus-edges` only): `space-6` (24px) band thickness,
  the moldovan lattice tiled along its length (`repeat-x` on top/bottom,
  `repeat-y` on left/right), running between the corner clusters so the frame
  reads continuous. The strips stop at the cluster bounds; they do not overlap.
- **Protected inner region**: the frame reserves a clear inset of at least
  `space-16` (64px) on every edge on screens ≥768px, `space-8` (32px) below
  768px. Content (auth card, empty-state column) renders inside that inset only.
  The frame must not draw within the inner region under any viewport — this is
  what keeps motif away from text and from focus rings.
- **Reduced footprint under 640px**: corner clusters shrink to `space-12` (48px)
  and edge strips are suppressed entirely (`corners-plus-edges` degrades to
  `corners-only` behavior on small screens), so the frame never crowds a narrow
  auth card.

### 7.4 Color (heritage tint rule — binding)

Per brand-tokens.md §6, HeritageCorners recolors the assets to the brand palette
**only**, at the 200-tint level or lighter:

- Permitted: `primary-200`, `primary-300`, `accent-1-200`, `accent-2-200`,
  `neutral-200`. Nothing darker, nothing outside this document, never folk
  red/black.
- Corner rosettes default to `accent-2-200` (teal tint), edge strips to
  `primary-200` (grey-blue tint); a single `tone` prop may swap corners to
  `accent-1-200` for the magenta brand accent on the login screen. At most one
  accent tone per surface (Principle 2: rationed accent).
- Because every permitted tint is a light 200-level value and the frame never
  enters the content region, no text ever sits on the motif; the AA text-contrast
  budget is untouched. The a11y reviewer verifies the inner-region inset rather
  than per-pixel contrast.

### 7.5 Interaction with focus rings and AA (non-negotiable)

1. The frame is `pointer-events: none` and `aria-hidden`, so it cannot receive
   focus and never draws a ring.
2. The protected inner region (§7.3) guarantees the global `focus-ring` (2px
   `accent-2-600`, 2px offset) on any control inside the content never overlaps
   or is visually broken by motif pixels. The reviewer checks that the first
   focusable control's ring clears the nearest frame element by ≥`space-4`
   (16px).
3. No motif element raises the luminance under any text below AA, by
   construction (text lives in the inset, §7.4).
4. `prefers-reduced-motion` is irrelevant (the frame never animates) but the
   component still must not introduce any transition.

### 7.6 Allowed and forbidden hosts

- **Allowed:** auth screens (staff `/login`, portal login/activate once JP signs
  off Q6) and full-bleed empty states (the zero-results surface of a list screen,
  via a dedicated full-bleed empty layout — not the inline EmptyState band of
  §7.7).
- **Forbidden, design-reviewer blocks:** any screen that renders patient or
  clinical data, the clinical record editor, any table, the agenda grid,
  dashboards, invoicing. The forbidden set is the §6 "never on data-dense
  screens" list, restated for this component with no exceptions.
- Portal usage stays OFF until JP sign-off (QUESTIONS.md Q6); staff auth may use
  it now.

### 7.7 EmptyState motif band upgrade (amends §4.10 / §4.12)

The EmptyState `heritage` prop currently renders the HeritageDivider at its 10px
(`h-2.5`) divider height above the icon badge. Wave 4 upgrades that thin divider
to a **motif band of meaningful height at a legible motif scale**, while keeping
HeritageDivider's other hosts (auth, section dividers) unchanged.

Exact sizing (4px scale, used by W4-01 and W4-04/W4-05 empty states):

- **Band total height**: `space-12` (48px), up from the current 10px.
- **Motif tile height inside the band**: `space-6` (24px) — the "legible scale";
  roughly 2.4× the divider, large enough that the azulejo four-fold pattern is
  recognizable rather than a texture line.
- **Vertical breathing room**: `space-3` (12px) above and below the motif row
  inside the band (12 + 24 + 12 = 48 = `space-12`). No off-scale padding.
- **Width**: unchanged max of 320px, centered, `repeat-x` tiling.
- **Placement in the EmptyState column**: the band is the first row of the
  existing centered column; the gap between the band and the icon badge moves
  from `space-4` to `space-6` so the heavier band has room. All other EmptyState
  anatomy (badge, h3, body-sm, action) is untouched.

This upgrade is delivered as a band mode on the heritage surface (e.g. a
`size="band"` option on HeritageDivider, or a small dedicated `HeritageBand`
sharing the asset and tint plumbing — implementer's call in W4-01, but a NEW
file, never an edit that changes HeritageDivider's default divider rendering).
The band recolors per the §7.4 tint rule (azulejo, `accent-2-200`).

### 7.8 Exports and stories

Exports from `@osteojp/ui` root with a docblock usage example. Storybook
coverage (hard gate for W4-02 per PLAN.md):

- HeritageCorners: both variants (`corners-only`, `corners-plus-edges`), both
  corner tones (teal default, magenta accent), at three widths (narrow mobile
  card, tablet, full desktop auth surface) showing the protected inner region and
  a focused control inside it clearing the frame.
- EmptyState band upgrade: the upgraded band rendered above a sample EmptyState,
  side by side with the legacy 10px divider for the size delta.
