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

Mobile: a single-day view inferred from the current behavior (one therapist column, vertical scroll, day navigation). ASSUMPTION: mobile collapses to Dia view; flag to Ivan if v1 mobile differs.

---

## 5. Role gating

- Schedule appointments: Admin, Therapist (own calendar), Receptionist, per the permission matrix and existing checks.
- The therapist filter defaults to the signed-in therapist's own calendar for the Therapist role where v1 already scopes it; the agenda never widens scope beyond the existing query.

---

## 6. Data-dependency flags

None new. Agenda reuses the existing appointments fetch, conflict logic, and create/edit/cancel actions. The Marcações list route (V2-W7) reuses this same appointments fetch rendered as a list rather than a grid; it is specified in its own ticket and adds no new data model.
