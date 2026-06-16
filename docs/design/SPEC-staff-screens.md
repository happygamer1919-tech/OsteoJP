# SPEC-staff-screens — Wave 2 staff platform screen specifications

> Superseded by SPEC-v2-foundation.md (OsteoJP v2) for the staff app. Kept for history.

Status: ready for implementation
Consumed by: the design loop, Wave 2 (bound to apps/web)
Sources of truth, in priority order:
1. docs/brand-tokens.md (all values, including the AA corrections in 1.8/1.9)
2. docs/design/SPEC-foundation.md (components, global rules, motion, a11y)
3. docs/brand-voice.md (all strings, PT first, EN second, via packages/i18n keys)
4. docs/design/ui-inventory.md
5. This file (screen composition, layout, hierarchy, states)

## 0. Hard scope rules

1. Presentation only. Screens consume the data the app already fetches through existing queries and endpoints. No schema changes, no API changes, no new endpoints, no permission changes. If a layout in this spec wants data the app does not currently have, render the layout without that element and log it in QUESTIONS.md.
2. Role behavior comes from packages/auth/permissions.ts exactly as today. Screens filter what they render through the existing checks; they never invent role logic.
3. Every screen ships its loading (skeleton mirroring real layout), empty, and error states in the same PR, using Skeleton, EmptyState, ErrorState from packages/ui.
4. Every visible string is an i18n key with pt-PT and en-GB values per brand-voice.md. No literals in JSX.
5. Heritage motifs are allowed on staff empty states and loading states (internal surface). EmptyState heritage prop on at most one empty state per screen.

## 1. Shared screen patterns

**Page header**: h1 page title left, primary action Button right (the only primary button above the fold), optional ghost Filtros button beside it. Margin below `space-8`.

**Page container**: provided by AppShell (max-width 1280, px space-6, py space-8). Screens never add their own outer container.

**Filters row**: ghost-styled controls in a horizontal row gap `space-3`: Select for location (hidden when the user has one location), Select or Combobox for therapist, date controls where relevant. Collapses to a Drawer behind a single Filtros button under 768px.

**Date controls** (dashboard and agenda): date pill (secondary Button showing the formatted date, opens DatePicker), Hoje ghost button, ChevronLeft and ChevronRight icon buttons. Pattern borrowed from the app.doc audit.

**Money**: always right-aligned, body-sm, format per pt-PT locale (1 234,56 €).

**Person rows**: patient name in body-sm weight 500 `text-primary`, secondary line (NIF or phone) in small `text-secondary`.

## 2. W2-01 composite components (packages/ui, NEW files only)

These are the only Wave 2 additions to packages/ui. Both waves consume them, so this task is the shared hard gate.

**Combobox**: searchable single-select. Input skin with Search leading icon; typing filters an options popover (`surface`, border, radius lg, shadow lg, max-height 320px scroll). Option rows: 40px, body-sm, hover `bg`, selected Check trailing icon. Supports async options (loading row = 3 skeleton lines), empty row ("no results" string via prop), and a pinned action row at the bottom (e.g. create new patient) rendered when the actionLabel prop is set. Full combobox keyboard semantics (arrows, Enter, Escape, aria-activedescendant). Generic: options in, selection out; no domain logic.

**DatePicker**: popover month calendar off an Input-skinned trigger. Month header (caption weight 500) with chevron month nav, weekday row in caption `text-muted`, day cells 36px radius full, today outlined with 1px `border-strong`, selected filled `accent-2-700` text-inverse, disabled days `text-muted` no pointer. Min and max date props. Week starts Monday (pt-PT). Keyboard arrows move days.

**TimeField**: time input on a 15-minute step. Two linked selects (hour, minute) sharing one Input-skin frame, or a single masked input if simpler; either way value in and out is "HH:mm". Min, max, step props.

**SlotPicker**: grid of selectable time chips for a given day: chips px space-3 py space-2 radius full, available = secondary button skin, selected = `accent-2-700` filled text-inverse, unavailable not rendered (never show disabled slots as noise). Wraps responsively, gap space-2. Takes slots as data; zero availability logic inside.

## 3. Screen: Dashboard (W2-02)

Purpose: answer "what does today look like" in five seconds.

**Layout (desktop)**, top to bottom:
1. Page header: title = today greeting-free label per voice doc ("Resumo do dia"), date controls right-aligned in place of the primary action.
2. KPI grid: KpiCard components, 4-up at xl, 2-up at md, 1-up below. Use exactly the metrics the current dashboard data layer exposes; map each to label, value, comparison line. Do not compute new metrics.
3. Today's appointments section: h2 "Marcações" with ghost Filtros and primary "Adicionar" right-aligned. Table columns: Hora (left, 72px), Paciente (person row), Serviço, Terapeuta (hidden for therapist role since it is always them), Estado (StatusChip, right). Row click navigates to the appointment in Agenda. Cancelled rows: `text-muted` with line-through on the time cell only.

**Role behavior**: therapist sees only their own appointments and their own KPI scope if the existing data layer already scopes it; reception and admin see the location-wide view; owner additionally keeps whatever cross-location data already exists. Never widen data exposure beyond current behavior.

**States**: loading = KPI skeletons + SkeletonTable 5 rows. Empty appointments = EmptyState (Calendar icon, "Sem marcações para esta data", guidance line, primary Adicionar action, heritage allowed here). Error = ErrorState with retry.

**Mobile**: KPIs stack 1-up, table swaps to TableCardRow stack (time + name on line one, service + chip on line two).

## 4. Screen: Agenda (W2-03)

Purpose: the operational center. Day grid first, week view second.

**Toolbar** (sticky under the app bar, `surface` bg, bottom border): date controls; view SegmentedControl (Dia, Semana); Filtros ghost (therapist, location); primary "Adicionar" with a dropdown of two actions (Nova marcação, Bloquear horário).

**Day grid**:
- Time gutter left, 64px wide: 30-minute rows, hour labels in caption `text-muted` aligned to the line.
- One column per visible therapist (per current data), column header: 24px avatar circle + name caption weight 500, sticky.
- Grid lines: 1px `border` per 30 minutes, hour lines `border-strong`.
- Row height 48px per 30 minutes.
- Current time indicator: 2px `error` line across all columns with a small time chip on the gutter. Only on today.
- Appointment block: absolute positioned card, radius default, 1px border, `surface` bg with a 3px left edge bar in the status color (chip tone mapping from SPEC-foundation 4.5), padding space-2, content: time range caption, patient name body-sm weight 500, service small `text-secondary` (truncate). Min height one slot; blocks shorter than 45 minutes drop the service line. Blocked-time blocks: `surface-muted` bg, diagonal hatch via repeating-linear-gradient of `border`, label "Bloqueado".
- Overlaps: side by side equal widths within the column, 2px gap, max 3 across then "+n" overflow chip opening a popover list.
- Empty slot click: slot highlights `accent-2-50`, small popover with two ghost actions (Nova marcação, Bloquear horário). Choosing the first opens the Appointment Drawer prefilled with that column's therapist, the date, and the slot time.
- Appointment click: opens the Appointment Drawer in view mode.

**Week view**: 7 day columns Monday first, same grid mechanics, therapist filter collapses columns to one therapist at a time when more than one is visible (Select in toolbar). Day column header: weekday caption + day number, today's header in `accent-2-700`.

**Role behavior**: therapist defaults to their own column only; reception and admin see all therapists at the selected location. Same as current behavior.

**States**: loading = grid chrome renders immediately, appointment layer shows 4 skeleton blocks per visible column. Empty day = grid still renders (slots are the affordance) with a slim neutral Banner "Sem marcações para esta data". Error = ErrorState replacing the grid body, retry refetches.

**Mobile (under 768px)**: day view only (week switcher hidden), single therapist at a time with a therapist Select in the toolbar, gutter 48px, horizontal swipe not required.

## 5. Component: Appointment Drawer (W2-04)

Lives in apps/web, composed from packages/ui Drawer. One drawer, three modes; same fields, same data, same endpoints as the current appointment modal.

**Create mode** (from slot click or Adicionar):
1. SegmentedControl: Procurar paciente | Novo paciente.
2. Procurar: Combobox searching name, NIF, phone (existing search endpoint), with the pinned action row "Criar novo paciente" switching to the second segment.
3. Novo paciente: inline Field set exactly matching the fields the current quick-create uses (name required, the rest optional with the optional suffix).
4. Serviço Select (required), Terapeuta Select (required, prefilled from context), Data via DatePicker + Hora via TimeField (prefilled from slot), duration if currently editable.
5. Recurrence: Checkbox "Marcação recorrente" revealing the existing recurrence options when checked.
6. Notas Textarea optional.
7. Notify patient Checkbox, default checked, label per voice doc.
8. Conflict handling: when the existing conflict check trips, render a warning Banner inline above the footer naming the clash; primary stays enabled only if the backend currently allows override, otherwise disabled.
9. Footer: ghost Cancelar, primary Gravar (loading state during submit). Dirty close triggers the discard Dialog.

**View mode** (click on an existing appointment): read-only summary list (label and value rows), StatusChip top-right, footer actions per current permissions: Editar (secondary, switches to edit mode), status actions the app already supports rendered as secondary buttons, destructive cancel action triggers the confirm Dialog. Reception and therapist see exactly the actions they have today.

**Edit mode**: create form prefilled. Success on any submit: drawer closes, success Toast, agenda refetches.

## 6. Screen: Patient profile (W2-05)

**Header card** (Card, full width): 48px initials avatar (`surface-muted` bg, `text-secondary`), name h2, secondary line small `text-secondary` (age dot NIF dot phone, whichever exist), StatusChips for any flags the data already carries, primary "Nova marcação" right (opens Appointment Drawer with patient prefilled).

**Tabs** below the header, filtered by the existing permission checks: Resumo, Consultas, Registos clínicos (hidden from roles that cannot read clinical records today), Documentos, Faturação (per current permission).

- **Resumo**: two-column at lg, stacked below. View-then-edit Cards (app.doc pattern): Dados pessoais, Contactos, Dados clínicos básicos if the data exists. Each card header has a ghost Editar button opening a Drawer with the matching Field set. Right column: next appointment mini card + last visit line.
- **Consultas**: Table of appointment history (Data, Hora, Serviço, Terapeuta, Estado chip), newest first, row click opens Appointment Drawer view mode. Pagination as the data layer already provides.
- **Registos clínicos**: list of records as interactive Cards: date, episode or form name, record_status rendered as StatusChip (draft=neutral, locked=info, signed=success), ai_review_state as a SECOND chip only when not approved (pending_review=warning, in_review=info, rejected=error). The two axes never merge into one chip. Click navigates to the record editor.
- **Documentos**: Table (Nome with FileText icon, Data, Tipo, action icon button download). 
- **Faturação**: Table consistent with the Invoicing screen columns, scoped to the patient.

**States** per tab: SkeletonTable loading, EmptyState per tab with tab-appropriate copy and action (heritage allowed on the Registos clínicos empty state only), ErrorState with retry.

**Mobile**: header card stacks, tabs scroll horizontally, tables swap to TableCardRow.

## 7. Screen: Clinical record editor (W2-06)

The most sensitive screen. Calm, document-like, zero decoration. No heritage anywhere on this screen including its empty and loading states.

**Layout (desktop)**: two columns.
- Left rail, 240px, sticky: section anchor nav generated from the form template sections; current section `text-primary` with a 2px `accent-2-700` left bar, others `text-secondary`. Under 1024px the rail becomes a horizontal scrolling Tabs row above the form.
- Main column, max-width 720px: the form engine output restyled with packages/ui Field components. Section title h3 with `space-8` above. Fields stack with `space-6` gaps. ai_extractable narrative fields that arrived prefilled by AI show a small `text-muted` caption line "Preenchido automaticamente, reveja antes de assinar" under the label; coded and safety fields never show it. The bodychart keeps its existing manual component inside a Card, container restyle only, no behavior changes.

**Status bar** (sticky footer, `surface` bg, top border, py space-3 px space-6): left = record_status StatusChip + autosave text in small `text-muted` ("Guardado às HH:mm" from the existing autosave); right = the actions the app already exposes for the current role and status (e.g. Gravar secondary, Assinar primary opening a confirm Dialog). Signed and locked records: every input renders disabled, the bar shows a Lock icon + status chip and no mutating actions, exactly mirroring the DB-level immutability.

**Review state**: when ai_review_state is pending_review or in_review, ONE warning Banner at the top of the main column with the state and the existing review action if the role has it. Never more than one banner.

**States**: loading = rail skeleton + SkeletonText sections. Error = ErrorState full column. There is no empty state; a record always has a template.

## 8. Screen: Invoicing view (W2-07)

Greenfield UI per ui-inventory; backend integrations are Phase 4, so this screen renders existing invoice data and disables what the backend cannot do yet.

**Layout**: page header (title "Faturação", primary action "Nova fatura" ONLY if a create path exists in the app today, otherwise no primary action). Filters row: date range via two DatePickers, Estado Select, location Select. Optional KPI strip (2 KpiCards: total emitido, total pendente) only if those aggregates already exist in the data layer.

**Table**: Nº (caption mono-spaced feel via tabular-nums), Data, Paciente (person row, links to profile), Valor (right, money format), Estado (StatusChip: paga=success, pendente=warning, anulada=neutral), trailing icon actions per current permissions (view, download when a document exists).

**Detail Drawer** on row click: header with number + status chip, line items list (description, qty, value), totals block right-aligned (subtotal, IVA, total, weight 600 on total), patient and fiscal data block (NIF), footer actions strictly per existing permissions and existing endpoints; any action whose integration is not live renders disabled with a `text-muted` helper line "Disponível após ativação da faturação".

**Role behavior**: visible only to roles that can see invoicing today; mutating actions admin and owner only, per permissions.ts.

**States**: SkeletonTable; EmptyState (Receipt icon, "Sem faturas no período selecionado", guidance to adjust filters); ErrorState with retry.

## 9. W2-08 polish and debt task

1. Replace the hardcoded ring-accent-2-500 in apps/web/components/app-shell.tsx (or delete the file if the packages/ui AppShell fully superseded it; verify usage first).
2. Sweep apps/web for remaining hex literals and off-scale spacing introduced before Wave 1; migrate to tokens. Grep proof in the PR.
3. Verify every Wave 2 screen against the app.doc audit anti-goals: max one banner per screen, no blank-then-pop lists, transitions within 150-250ms.
4. Confirm pt-PT and en-GB render correctly on all six screens (diacritics, money, dates).

## 10. Out of scope for Wave 2

The portal (Wave 3), any reminder or notification UI, form template authoring UI, data migration screens, and any change to data fetching beyond moving existing calls between components. Do not build ahead.

---

## 11. Secondary staff screens (Wave 4 addition)

Consumed by the design loop, Wave 4 (bound to `apps/web`). These five screens
shipped before the design system and still carry pre-Wave-1 markup; Wave 4
restyles them onto packages/ui with zero data, endpoint, or permission changes.
Section 0 hard scope rules apply unchanged: presentation only, role behavior from
`packages/auth/permissions.ts` exactly as today, every screen ships loading /
empty / error states in the same PR, every string is an i18n key, heritage only
where §0.5 and SPEC-foundation §7.6 allow.

Shared patterns from §1 (page header, AppShell container, filters row, person
rows, money) apply to every screen below. None of these screens adds its own
outer container; AppShell owns width and padding (max-width 1280, px `space-6`,
py `space-8`), identical to `/dashboard`.

### 11.1 Screen: /patients list (W4-03)

Purpose: find a patient fast, create a new one.

**Layout (desktop)**, full-width aligned with the app shell exactly like
`/dashboard`:
1. Page header (§1): h1 "Pacientes", primary action Button right labeled
   **"Novo Paciente"** filled teal (`accent-2-700`, the §1 single primary above
   the fold), Plus leading icon. This renames the legacy "Adicionar utente" /
   "Novo utente" label (see brand-voice utente rule).
2. Search field: full-width Input with Search leading icon, placeholder
   "Pesquisar por nome, NIF ou telefone", debounced against the existing search
   query. AA-compliant: `border-strong` border, `text-muted` placeholder (not
   lighter), the global `focus-ring`, label associated via Field even when the
   visible label is visually hidden (`aria-label` is not enough for the reviewer
   — use a Field with an sr-only label or a visible "Pesquisar" label).
3. Results: Table (§SPEC-foundation 4.7). Columns: Paciente (person row — name
   body-sm weight 500, NIF or phone secondary line), Telefone, Última consulta
   (date, `text-secondary`), trailing ChevronRight icon (20px, `text-muted`) as
   the row-navigation affordance. Rows are interactive: hover bg `bg`, whole row
   is one keyboard-reachable link to the patient profile, the ChevronRight is the
   visible affordance (not an extra tab stop).

**Role behavior**: therapist sees their own patients only, reception and admin
see the location-wide list, exactly as the existing query scopes it. The "Novo
Paciente" action shows only for roles that can create patients today; never widen
exposure.

**States**:
- Loading: SkeletonTable, 8 rows matching the three column widths.
- Empty (no patients at all): **EmptyState** component (Users icon, "Sem
  pacientes registados", guidance "Crie o primeiro paciente para começar.",
  primary "Novo Paciente" action). Heritage allowed on this one empty state per
  §0.5 (the upgraded motif band, SPEC-foundation §7.7).
- Empty (search returns nothing): EmptyState (Search icon, "Sem resultados para
  esta pesquisa", guidance "Ajuste os termos de pesquisa.", no heritage, no
  create action — the query is the thing to change). Zero-results uses the
  EmptyState component, never a plain text line.
- Error: ErrorState with retry.

**Mobile**: search full-width, Table swaps to TableCardRow (name + phone line
one, last-visit + chevron line two).

### 11.2 Screen: /clinical fichas list (W4-04)

Purpose: the cross-patient list of clinical records (fichas).

**Layout (desktop)**:
1. Page header: h1 "Fichas clínicas", primary action **"Nova Ficha"** as a filled
   teal Button (`accent-2-700`, Plus leading icon). Optional ghost Filtros button
   beside it.
2. Filters row (§1): Estado Select, Terapeuta Select/Combobox, date range where
   the data layer provides it. Hidden controls collapse behind a single Filtros
   button under 768px.
3. Table. Columns: Data (left), Paciente (person row, links to the patient
   profile), Tipo/Episódio (form or episode name), Terapeuta (hidden for
   therapist role since it is always them), **Estado** rendered with **StatusChip
   on the two separate status axes** exactly as §6 Registos clínicos: a
   `record_status` chip (draft=neutral, locked=info, signed=success) and, only
   when `ai_review_state` is not approved, a SECOND chip (pending_review=warning,
   in_review=info, rejected=error). The two axes never merge into one chip. Row
   click navigates to the clinical record editor.

**Role behavior**: visible only to roles that can read clinical records today
(therapist on own patients, admin per permissions); reception never sees this
screen. "Nova Ficha" shows only where record creation is permitted today.

**States**:
- Loading: SkeletonTable 8 rows.
- Empty: EmptyState (FileText icon, "Sem fichas clínicas", guidance line, primary
  "Nova Ficha"). Heritage allowed here (one empty state per screen).
- Error: ErrorState with retry.

**Mobile**: TableCardRow (date + patient line one, type + Estado chip(s) line
two).

### 11.3 Screen: /review queue (W4-05)

Purpose: the staff review queue for AI drafts and patient submissions
(`ai_review_state`). Restyle only; the claim → edit → finalize behavior and its
permissions are unchanged.

**Layout**: page header h1 "Revisão", no primary create action (items arrive from
ingestion, not created here); optional Estado Select filter. Table or interactive
Card list of pending items: Paciente (person row), Origem (AI / submissão do
paciente), Recebido (date), `ai_review_state` StatusChip
(pending_review=warning, in_review=info), trailing ChevronRight to open the
review editor. Row gating: only the `clinical_records:review` capability sees the
claim/finalize actions, exactly as today.

**States**:
- Loading: SkeletonTable.
- **Empty queue: EmptyState component**, not the current plain text. Check icon,
  "Sem itens para rever", guidance "Os novos registos do parceiro de IA e as
  submissões de pacientes aparecem aqui." No create action. Heritage optional
  (single empty state) but a calm empty queue reads better without it — leave
  heritage off here by default.
- Error: ErrorState with retry.

### 11.4 Screen: /admin hub (W4-06)

Purpose: the administration landing screen. Today it duplicates navigation as a
grid of link boxes that repeat the tab bar; Wave 4 removes that duplication.

**Layout**:
1. Page header: h1 "Administração". No primary action at the hub level (each area
   owns its own actions on its own screen).
2. **Tabs are the only navigation** across admin areas (Utilizadores, Definições
   da clínica, Faturação, etc., per the existing admin routes and permissions).
   **Remove the duplicated link boxes** — the grid of cards that merely re-link to
   the same tabs is deleted, not restyled.
3. Hub body: a **descriptive settings-rows pattern** — one Card per admin area,
   each row: area title (`text-primary`, xl weight 600 or lg per density), a
   one-line description (`body-sm` `text-secondary`) of what the area manages, and
   a trailing ChevronRight (20px, `text-muted`). Each Card is the interactive Card
   variant (whole card is one keyboard-reachable link to that area, single tab
   stop, hover bg `bg`, global focus ring). This replaces the duplicated boxes
   with informative rows that say what each destination does, while Tabs remain
   the primary navigation chrome.

A HeritageDivider section divider is permitted between hub groups (settings-class
screen, SPEC-foundation §4.12 allowed host) — at most one, decorative.

**Role behavior**: the whole screen is admin/owner only per permissions.ts.
Owner-only areas (the owner-tier role management) render only for the owner;
non-owner admins do not see them, unchanged from today.

**States**: the hub is static config navigation — render the rows directly. Any
area whose data is still loading shows its skeleton on that area's own screen, not
the hub. Error on the hub itself (rare) = ErrorState with retry.

### 11.5 Screen: staff /login (W4-02)

Purpose: staff authentication. The one staff screen that gets the full heritage
treatment.

**Layout**: centered single-column auth card on the `bg` page color, framed by
**HeritageCorners `corners-plus-edges`** (SPEC-foundation §7, auth-only variant).
The card sits inside the protected inner region; the frame never touches the card
or its focus rings.

1. **BrandLockup** `lockup` variant at the top of the card (the brand signature;
   pairs with the heritage frame for the one memorable auth surface).
2. Credential Field set: Email Input, Password Input, both AA-compliant with
   associated labels, inline validation (`role="alert"` error text per Field
   spec), "Iniciar sessão" primary Button (filled teal `accent-2-700`,
   loading state on submit). Voice: "Iniciar sessão", never "fazer login"
   (brand-voice §3.5); no "por favor" padding (§2.8).
3. Secondary paths as the app already supports them (magic-link / password reset),
   rendered as ghost or link styling, strings per brand-voice.
4. Language switcher (pt-PT / en-GB) consistent with the portal login pattern.

**States**:
- Default, submitting (primary Button loading, inputs disabled).
- Invalid credentials: inline error via Field error text + a single error Banner
  at most (never two banners), plain-language ("Não foi possível iniciar sessão.
  Verifique o email e a palavra-passe."), never raw auth codes or PII.
- Expired/invalid token (magic-link path): ErrorState-style message with the
  re-request action, per the existing auth flow.

**Role behavior**: pre-auth screen, no role context; never leaks whether an email
exists (generic failure copy).

### 11.6 Out of scope for these screens

No change to auth logic, queries, endpoints, the permission matrix, migrations,
RLS, or ingestion. Restyle and state-completeness only. The clinical record
editor (§7) and its no-heritage rule are unchanged. Heritage appears only on
`/login` (full frame) and at most one empty state per list screen (motif band);
never on `/clinical`'s table, `/review`'s populated queue, the agenda grid, or any
data surface.
