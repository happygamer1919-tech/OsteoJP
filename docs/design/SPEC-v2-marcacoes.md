# SPEC-v2-marcacoes: Marcações

Status: ready for implementation (design loop V2-W7)
Foundation: docs/design/SPEC-v2-foundation.md. All primitives from the section 9 inventory. No new primitive.
Copy: docs/brand-voice.md (PT first, EN second). No exclamation marks. "Marcação" for the booking, "consulta" for the encounter, always "paciente" (never "utente").
Scope: presentation only. Marcações is a **list view of the same scheduling data Agenda renders as a grid** — the same appointments fetch and the same conflict logic, presented as a chronological, filterable list rather than a time grid. No schema, API, RLS, auth, scheduling-logic, or permission changes, and no new data model.

Route: `/marcacoes` in apps/web, inside the SidebarAppShell (Marcações active). This route replaces the current Marcações placeholder empty state (SPEC-v2-foundation §7.2): the AppShell already ships the nav item; V2-W7 wires the real list behind it.

Relationship to Agenda: Marcações and Agenda are two presentations of one dataset. Agenda (SPEC-v2-agenda) is the time grid; Marcações is the list. Everything data-bearing — the fetch, the service categories, the status values, the conflict detection, the role scope — is shared and unchanged. Where this spec says "reuse Agenda's", it means literally the same source, restyled into list form.

---

## 1. Layout (top to bottom)

1. Page header: title and subtitle.
2. Filters row.
3. Appointment list inside a glass container.

The HeritageFrame is inherited from the SidebarAppShell at `density="restrained"`, sitting behind the content area. This screen adds NO second frame. Marcações is not the clinical record editor, so the inherited frame is allowed here (SPEC-v2-foundation §6.2).

### 1.1 Page header

- Title "Marcações".
- Subtitle at `v2-text-secondary`, formal "você" register, paciente terminology, no exclamation mark. PT "Consulte as marcações dos seus pacientes." / EN "View your patients' bookings."

There is no primary "Nova Marcação" action on this screen: creating a booking lives on Agenda and its appointment drawer (SPEC-v2-agenda §1.4, §3). Marcações is a read-and-filter surface over the same data. (If V1 already exposed a create entry point on the list, carry it forward unchanged and flag the duplication to Ivan rather than inventing a second create flow.)

### 1.2 Filters

Reuse Agenda's filter controls where they already exist, bound to the same filter state, restyled as glass selects/inputs. The set, in order:

- **Intervalo de datas** (date range). Glass date inputs; defaults to the existing Agenda default window.
- **Localização** (location): "Todas as localizações". Select width must fit its longest option (carry the v1 W4-07 no-truncation fix forward).
- **Estado** (status): "Todos os estados" — the appointment status values v1 already uses (e.g. Confirmada, Pendente, and any cancel/complete states present in the data). The list never invents a status the data does not carry.
- **Serviço** (service): "Todos os serviços" — the five service categories below plus Other.
- **Terapeuta** (therapist): "Todos os terapeutas". Same select-width rule.

Filters are presentation over the existing query parameters; they add no new query field. Any filter Agenda does not already support is out of scope and must not be added here.

---

## 2. Appointment list (GlassPanel + rows)

A `GlassPanel` is the single glass container for the list. Inside it, each appointment is one row — a `GlassCard` row on wider viewports or a stacked card under 640px — ordered chronologically by start time (ascending), reusing whatever ordering the existing appointments fetch returns. The list is paginated or windowed exactly as the existing fetch already behaves; this spec adds no new paging behavior. If v1 loads the window at once, keep that and flag a performance follow-up to Ivan (not a design ticket).

### 2.1 Row content

Each row shows, left to right (wrapping gracefully on narrow widths):

- **Date and time** in Europe/Lisbon, pt-PT formatting (date stored UTC, displayed Lisbon, per the platform date rule).
- **Patient name**.
- **Service** as a service-tinted `GlassStatusChip`, color-coded by the same five Agenda categories plus Other:

| Service | Accent (chip tint) |
|---|---|
| Massagem Terapêutica | Wellness Green |
| Massagem Relaxamento | Soft Lavender |
| Drenagem Linfática | Warm Gold |
| Massagem Desportiva | Portuguese Blue |
| Osteopatia | Moldavian Burgundy |
| Other (any service outside the five) | Neutral glass (`v2-border` outline, no accent) |

  The chip uses the accent at a light tint (100/200) with label text at the 700 step or `v2-text-primary` to hold AA (SPEC-v2-foundation §3.4). The "Other" fallback is the same neutral-glass rule Agenda uses for uncategorized services.

- **Location**.
- **Therapist**.
- **Status** as a `StatusBadge` (Confirmada green, Pendente orange, and the other v1 status tones), per SPEC-v2-foundation §9. Status label text holds AA per the accent rule (dot may carry the base tone; the label is 700 or `v2-text-primary`).

### 2.2 Conflict marker

Rows whose appointment conflicts (overlapping slot) carry a conflict marker consistent with Agenda: a warning-tone indicator on the row, using the **same conflict detection Agenda already runs** — no new logic. Warning tone, never a saturated red (SPEC-v2-foundation §10). A single marker per affected row; markers are never stacked.

### 2.3 Row interaction

Opening a row routes to the same appointment view/drawer Agenda uses, with identical data and permissions. The whole row is a single tab stop; any trailing chevron is decorative (the row is the control) and MUST be `aria-hidden="true"` so it is not announced (WCAG 1.1.1 / 4.1.2, SPEC-v2-foundation §6.3). If v1 has no list-row open behavior, the rows are non-interactive read items and this is flagged to Ivan rather than wiring a new navigation target.

---

## 3. States

| Surface | Loading | Empty | Error |
|---|---|---|---|
| List | row skeletons inside the glass container | `EmptyState` ("Sem marcações para os filtros selecionados." inviting a filter change) | `ErrorState` inside the glass container |

- **Loading**: skeleton rows inside the `GlassPanel`.
- **Empty**: a single `EmptyState`. The empty copy invites adjusting the filters, never apologises, and offers no create action (creation lives on Agenda). The `EmptyState` may render its own heritage band (calm density) — empty states are an allowed heritage surface (SPEC-v2-foundation §6.2) — independent of the shell's restrained frame.
- **Error**: `ErrorState` inside the `GlassPanel`, with retry. Plain-language cause, no raw error code in the headline, no PII.

---

## 4. Role gating

- Marcações is visible to every role the shell nav exposes it to; the AppShell applies role filtering exactly as today and this screen never decides role visibility itself.
- The list never widens data scope. It reuses Agenda's existing query scope: where v1 scopes a Therapist to their own calendar, Marcações shows the same scoped set. View/schedule permissions match the permission matrix and the existing checks.

---

## 5. Data-dependency flags

None new. Marcações reuses the existing appointments fetch, the existing conflict logic, and the existing appointment view/edit behavior, identical to Agenda (SPEC-v2-agenda §6). All rendered data is real; the only placeholders are whatever Agenda already placeholders for the same fields.

---

## 6. i18n

- New `marcacoes.*` keys: title, subtitle, the five filter labels (date range, location, status, service, therapist) and their "Todos/Todas …" defaults, the row/column headers, and the empty/error copy. PT-PT first, EN-GB second.
- A dedicated `nav.bookings` key for the Marcações nav label (the carried W7 follow-up): the AppShell nav item adopts it in this wave.
- Service category and appointment status labels reuse the existing shared keys Agenda already uses; this wave does not duplicate them.
- i18n strings are additive (keep-both on rebase), per the parallel-loops rule.

---

## 7. Primitives and build constraints (V2-W7)

- Build only with the V2-W0 primitive inventory (SPEC-v2-foundation §9): `GlassPanel`, `GlassCard`, `GlassStatusChip`, `StatusBadge`, `EmptyState`, `ErrorState`, skeletons, consumed through the SidebarAppShell. No new primitive.
- No `packages/ui` change in the V2-W7 build wave. If the list needs something the inventory lacks, stop, log it to `docs/QUESTIONS.md`, and treat it as a foundation follow-up — never an inline primitive edit in a section wave.
- V2-W7 path allowlist: `apps/web/**` (the `/marcacoes` route only) plus `packages/i18n/**` plus `docs/design/**`, and explicitly NOT `packages/ui`.
