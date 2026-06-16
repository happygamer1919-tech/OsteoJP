# SPEC-v2-dashboard: Dashboard (Início)

Status: ready for implementation (design loop V2-W1)
Foundation: docs/design/SPEC-v2-foundation.md. All primitives come from the section 9 inventory. No new primitive.
Copy: docs/brand-voice.md (PT first, EN second, via packages/i18n keys). No exclamation marks.
Scope: presentation only. Consumes data the app already fetches. No schema, API, RLS, auth, or permission changes.

Route: the existing staff dashboard route in apps/web, rendered inside the SidebarAppShell (Início active).

---

## 1. Layout (top to bottom)

1. Greeting block.
2. Date navigation (top-right, aligned with the greeting row).
3. Four KPI cards row.
4. Acessos rápidos: a grid of five quick-action tiles.
5. Two panels side by side: Próximas marcações and Resumo semanal.
6. Notas rápidas card.

The HeritageFrame wraps the content area at `density="restrained"` (OsteoJP theme only).

### 1.1 Greeting block

- Greeting: "Bom dia, Ana" at `v2-greeting` (42px, weight 600), no exclamation. The time-of-day phrase (Bom dia / Boa tarde / Boa noite) follows the existing greeting logic; the name is the signed-in staff first name.
- Subheading: "Aqui está o resumo do dia na clínica." at body weight, `v2-text-secondary`.

### 1.2 Date navigation (top-right)

A glass control cluster: previous button, glass date picker, "Hoje" button, next button. Drives the dashboard's date context using the existing date state. ASSUMPTION: the v1 dashboard is single-day "today" focused; the date navigation here scopes the KPI "hoje" and "Próximas marcações" panel to the selected day. If the v1 dashboard has no date selector at all, ship the cluster wired to the same "today" fetch and flag the date-scoping behavior to Ivan.

---

## 2. KPI cards row (four, GlassKpiCard)

Each is a `GlassKpiCard`, 180px tall, `v2-radius-kpi`, with a tinted icon circle, value, and caption.

| # | Title | Icon | Accent | Value | Caption |
|---|---|---|---|---|---|
| 1 | Pacientes ativos | Users | Wellness Green | active patient count | "+N esta semana" |
| 2 | Marcações hoje | Calendar | Portuguese Blue | today's appointment count | "Próxima: HH:MM" |
| 3 | Novas fichas | Clipboard | Soft Lavender | new clinical records count | "Esta semana" |
| 4 | Receita (mês) | revenue chart icon | Warm Gold | currency value (integer cents formatted, Europe/Lisbon, EUR) | "+N% vs mês anterior" |

- Cards 1, 2, 3 render against existing queries (patients, appointments, clinical records).
- Card 4 (Receita) and the "+N% vs mês anterior" delta are DATA-DEPENDENT. There is no revenue aggregation in V1. Render the card with an honest placeholder ("Sem dados" / "No data") and the gold icon until the aggregation ships. The aggregation is a separate V1.1 functional ticket (see QUESTIONS.md), NOT design-loop work, and must not add migrations, RLS, or auth.

States: each KpiCard shows its built-in loading skeleton while its query is pending. If a query errors, the card shows a compact inline error tone (not a red flood), with the rest of the row intact.

---

## 3. Acessos rápidos (five QuickActionTile)

A grid of five 160x160 `QuickActionTile`s, large icon, hover lift translateY(-4px). Relatórios is removed (it is not a v1 nav item).

1. Nova Marcação
2. Novo Paciente
3. Ficha Clínica
4. Ver Agenda
5. Administração

Each tile routes to the existing destination (new-appointment flow, new-patient flow, new clinical record, agenda, admin). Role gating: a tile is hidden when the signed-in role lacks the destination permission (for example, Administração is admin/owner only; Ficha Clínica follows clinical-record permissions). The grid reflows to the visible tiles; it never renders a disabled-looking gap.

ASSUMPTION: the five destinations map one-to-one to existing routes/actions. If "Ficha Clínica" has no standalone create entry point outside a patient context, route it to the patient-picker-then-new-record path and flag to Ivan.

---

## 4. Two panels (GlassPanel, side by side)

### 4.1 Próximas marcações

A `GlassPanel`. Rows of: time, patient name, service, status badge (`StatusBadge`: green Confirmada, orange Pendente). Footer link "Ver agenda completa" with a chevron, routing to Agenda.

- Data: the existing upcoming-appointments fetch for the selected day.
- Empty state: "Sem marcações para hoje." (EN "No appointments today.") with the "Nova Marcação" action, per brand-voice empty-state pattern.
- Loading: row skeletons.
- Error: ErrorState inside the panel body, panel chrome intact.

### 4.2 Resumo semanal

A `GlassPanel` containing a `ResumoChart` (line chart, blue-to-green gradient, minimal grid, no dark colors).

- DATA-DEPENDENT: weekly appointment counts. If the weekly-count series is not currently fetched, render the chart's empty placeholder ("Sem dados suficientes" / "Not enough data") and flag the weekly-counts query as a V1.1 functional ticket (QUESTIONS.md). No new data model.
- Loading: chart skeleton.

The two panels sit side by side on desktop and stack on narrow viewports.

---

## 5. Notas rápidas

A small `GlassCard` below the two panels.

- DATA-DEPENDENT: notes persistence does not exist in V1 and is likely V1.1. Render the card as read-only with an honest empty state ("Sem notas." / "No notes.") OR, if a notes store already exists, bind to it. Do NOT add a notes table, migration, or endpoint in a design wave. The persistence is a separate V1.1 functional ticket (QUESTIONS.md).
- ASSUMPTION: notes are per-staff-member, not per-tenant-shared. Flag to Ivan; the design renders a single notes surface either way.

---

## 6. Role gating

- Dashboard is visible to all staff roles (Admin, Therapist, Receptionist).
- KPI cards and tiles that expose data or actions a role cannot access are hidden for that role, using the existing permission checks. Therapist sees own-scoped counts where the underlying query is already own-scoped; the dashboard never widens a query's scope.

---

## 7. States summary

| Surface | Loading | Empty | Error |
|---|---|---|---|
| KPI cards | skeleton per card | "Sem dados" placeholder (Receita) | inline compact error tone |
| Próximas marcações | row skeletons | "Sem marcações para hoje." + action | ErrorState in panel |
| Resumo semanal | chart skeleton | "Sem dados suficientes" placeholder | ErrorState in panel |
| Notas rápidas | skeleton | "Sem notas." | inline |

---

## 8. Data-dependency flags (carry to QUESTIONS.md as V1.1 functional tickets)

- Receita (mês) KPI: revenue aggregation.
- Resumo semanal: weekly appointment counts.
- Notas rápidas: notes persistence.

None of these are design-loop work. None add migrations, RLS, or auth. The dashboard ships with honest placeholders until each lands.
