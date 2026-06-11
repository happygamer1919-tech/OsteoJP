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

**Focus.** Every interactive element shows `focus-visible`: 2px ring in `accent-2-500`, 2px offset, on every background. No `outline: none` without a replacement ring in the same rule.

**Contrast.** Text on filled surfaces must meet WCAG AA (4.5:1 normal text, 3:1 large). Known trap: `text-inverse` on `brand-teal` (#45B9A7) fails AA. Filled teal surfaces that carry text therefore use `accent-2-600` or darker; the a11y reviewer blocks anything lighter.

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
| primary | `accent-2-600` | `text-inverse` | none | `accent-2-700` | `accent-2-800` |
| secondary | `surface` | `text-primary` | 1px `border-strong` | bg `surface-muted` | bg `neutral-200` |
| ghost | transparent | `text-secondary` | none | bg `surface-muted`, text `text-primary` | bg `neutral-200` |
| destructive | `error` | `text-inverse` | none | darken one step | darken two steps |

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
| success | `success-bg` | `success` | `success` |
| warning | `warning-bg` | `warning` | `warning` |
| error | `error-bg` | `error` | `error` |
| info | `info-bg` | `info` | `info` |
| neutral | `surface-muted` | `text-secondary` | `text-muted` |

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

**Portal layout (mobile-first)**: top bar 56px with BrandLockup `mark` size sm and screen title; bottom tab bar height 64px, `surface` bg, top 1px `border`, up to 5 items (icon 24px over caption label), active in `accent-2-600`, inactive `text-muted`, each tab min 44px touch. Desktop portal centers content at max-width 640px and moves tabs to a top row.

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
