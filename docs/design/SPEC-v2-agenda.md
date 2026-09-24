# SPEC-v2-agenda: Agenda

Status: ready for implementation (design loop V2-W2)
Foundation: docs/design/SPEC-v2-foundation.md. All primitives from the section 9 inventory. No new primitive.
Copy: docs/brand-voice.md (PT first, EN second). No exclamation marks. "Marcação" for the booking, "consulta" for the encounter.
Scope: presentation only. Reuses the existing appointments fetch, the existing conflict logic, and the existing create/edit/cancel behavior. No schema, API, RLS, auth, or permission changes.

Route: the existing agenda route in apps/web, inside the SidebarAppShell (Agenda active).

---

## 1. Layout (top to bottom)

1. Title and view toggle row.
2. Date navigation and week-range label.
3. Filters row.
4. Primary action: "Nova Marcação".
5. Week grid (or day grid in Dia view).
6. Service-color legend (bottom).

The HeritageFrame wraps the content area at `density="restrained"`, sitting behind the grid. On data-dense agenda the frame is reduced to corners and a thin edge so it never crowds appointment cards or the time gutter.

### 1.1 Title and view toggle

- Title "Agenda".
- A `SegmentedControl` style toggle: "Dia" and "Semana". ASSUMPTION: v1 already supports day and week views; this restyles the existing toggle. If only one view exists, ship that view and render the toggle disabled on the missing mode, flagged to Ivan.

### 1.2 Date navigation and range label

- Date navigation cluster: previous, glass date picker, "Hoje", next.
- Week-range label, example "15 a 19 de junho de 2026" (Europe/Lisbon, pt-PT month names). In Dia view the label is the single day.

### 1.3 Filters

- "Todos os terapeutas" select (therapist filter).
- "Todas as localizações" select (location filter).
- Both bind to the existing agenda filter state. Select widths must fit their longest option (carry the v1 W4-07 fix forward: no truncated therapist or location labels).

### 1.4 Primary action

- "Nova Marcação", filled Wellness Green button (AA: green-700 fill or darker text per the accent AA rule; the design reviewer checks the fill/text pairing).

---

## 2. Week grid

- Hour gutter starting at 08:00. The 08:00 label must not be clipped (carry the v1 W4-07 gutter fix forward).
- Columns per weekday.
- Current-time line present (horizontal indicator at the present time, current day column only).

### 2.1 Appointment cards (tinted glass, color-coded by service)

Each appointment is a tinted-glass card color-coded by service category:

| Service | Accent |
|---|---|
| Massagem Terapêutica | Wellness Green |
| Massagem Relaxamento | Soft Lavender |
| Drenagem Linfática | Warm Gold |
| Massagem Desportiva | Portuguese Blue |
| Osteopatia | Moldavian Burgundy |

Each card shows: time range, patient name, service, and a person icon. Tint uses the accent at a light tint (100/200) with `v2-text-primary` label text to hold AA. Overlapping appointments render side by side within the column (carry the v1 overlap rendering behavior). Blocked time renders as a muted, non-interactive band.

ASSUMPTION: the five service categories above are the complete color-coded set. If the catalog has services outside this list, they fall back to a neutral glass tint (`v2-border` outline, no accent) and are flagged to Ivan. The legend lists only categories present in the data.

### 2.2 Legend

A service-color legend sits at the bottom of the grid: a swatch plus label per service category present in the current view.

---

## 3. Appointment drawer (create, view, edit)

A restyled glass drawer reusing the existing appointment data and behavior. It replaces the v1 appointment drawer/modal with identical data and permissions.

- Patient search via a `Combobox` (existing patient-search behavior, with the create-patient pivot if v1 had it).
- Conflict banner: a single banner (never stacked) when the chosen slot conflicts, using the existing conflict detection. Warning tone, not red.
- Dirty-discard: editing then closing with unsaved changes triggers the discard confirmation (existing Drawer/Dialog wiring).
- Toasts on create, edit, cancel: success-toast pattern ("Marcação criada.", "Marcação atualizada.", "Marcação cancelada."), no exclamation.
- Modes: create, view, edit, matching the v1 modes exactly.

---

## 4. States

| Surface | Loading | Empty | Error |
|---|---|---|---|
| Week/day grid | grid skeleton (gutter + faint column placeholders) | the empty grid is its own affordance; NO redundant empty-period banner (carry the v1 W4-07 fix: the grid speaks for itself) | ErrorState replacing the grid body, toolbar intact |
| Drawer | field skeletons / disabled submit | n/a | inline field errors + single error banner |

**Mobile — the ASSUMPTION is retired. AGMOB-01, 2026-09-21.**

This section used to read: *"Mobile: a single-day view inferred from the current
behavior (one therapist column, vertical scroll, day navigation). ASSUMPTION:
mobile collapses to Dia view; flag to Ivan if v1 mobile differs."* It was never
ruled. It shipped as a client-side `matchMedia("(max-width: 1023px)")` override
that forced the Dia view and hid the Dia/Semana toggle, and a therapist reported
the consequence in plain words: the weekly view is not possible on the phone.

**What is true now.** Under **768px** the agenda renders the week as a VERTICAL
LIST OF DAYS (Mon–Sat), not as the grid, and the Dia/Semana toggle is visible at
every width. At 768px and above the grid is unchanged. The swap is CSS, so
`view` is only ever the URL's — there is no client-side viewport state and no
second breakpoint to keep in step.

**Why the grid is not simply made narrower.** It is one CSS Grid of
`64px repeat(days, minmax(0, 1fr))`. At 390px the content box is 342px, so six
columns are 46px, and after the column border and the name button's `px-2` a
patient name has 11px — one to two characters a line. A six-column week at phone
width renders; it does not read.

**Why 768 and not 1023.** A six-column grid needs roughly 101px a column to stay
readable, which is what reception reads at 1024 every day. At 768 a column is
109px. So tablets and landscape phones GAIN the real grid, which 1023 denied
them, and 768 is the number `SPEC-staff-screens.md` had already named.

**AMENDED BELOW 640px, AGENDA-MOBILE-WEEK.** The owner ruled that on a phone
Semana is the week GRID, compressed, and Dia is unchanged. So under **640px**
Semana renders a separate compact grid (`app/agenda/agenda-week-compact.tsx`,
decided by `lib/scheduling/agenda-compact-core.ts`): Mon to Sat plus Dom only when
that Sunday holds a booking, a sticky day header whose cells open Dia, a time axis
from 08:00 to 21:00 in 30-minute rows widened to cover any booking outside it
(hour rules only, as on the desktop since W13-B, and the window's end labelled on
the bottom edge), a now line with a one-time scroll to it, and blocks showing the start time, the
first name (truncated), the status glyph and a colour per SERVICE. Concurrent
blocks split the column side by side into at most two lanes; where three or
more run at once, the two lanes' rows are drawn and the others of that moment
sit behind a small "+N" chip on the two blocks' glyph line that opens Dia (or
on the glyph line of a left block starting less than half an hour after the
hidden rows), so three at once read two blocks and "+1" (the card's default,
open as Q-B6-1). A twin pair goes first at its minute, so it keeps both lanes
and the other rows starting then go behind the chip. A half-lane block gives the first name a line of its own,
so a 30-minute row is 34px tall. Between 640
and 767 Semana keeps the list above; Dia keeps the list at every width under 768.
At 640 and up nothing changes: the desktop grid still stacks same-start rows and
never truncates a name (W11-00 v3), and still colours by therapist. Below 640
Bloquear and Nova marcação drop their decorative icons (labels stay), Atualizar
keeps its refresh icon (its visible text is only the time), the three trim their
padding, and the shell header hides its name chip, so the page no longer scrolls sideways at 390 or 360. The
defaults behind this (Q-B6-1 to Q-B6-11) are in docs/DECISIONS.md.

---

## 5. Role gating

- Schedule appointments: Admin, Therapist (own calendar), Receptionist, per the permission matrix and existing checks.
- The therapist filter defaults to the signed-in therapist's own calendar for the Therapist role where v1 already scopes it; the agenda never widens scope beyond the existing query.

---

## 6. Data-dependency flags

None new. Agenda reuses the existing appointments fetch, conflict logic, and create/edit/cancel actions. The Marcações list route (V2-W7) reuses this same appointments fetch rendered as a list rather than a grid; it is specified in its own ticket and adds no new data model.
