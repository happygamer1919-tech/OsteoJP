# Wireframes — v1

Low-fi wireframes for the OsteoJP platform's 6 critical screens. Source for hi-fi design (Phase 3) and the contract for what each screen contains.

> Phase 0/1 task: `[MAX]` Wireframes for the 6 critical screens (Excalidraw or Figma, low-fi).
> Paired task: `[YOU]` Wireframe sign-off for 6 critical screens.

---

## Status

| Screen | File | Status |
|---|---|---|
| 1. Dashboard | `01-dashboard.excalidraw` / `.png` | Signed off (PR #11) |
| 2. Agenda | `02-agenda.excalidraw` / `.png` | Signed off (PR #11) |
| 3. Patient profile | `03-patient-profile.excalidraw` / `.png` | Drafted, pending lead sign-off |
| 4. Clinical record editor | `04-clinical-record-editor.excalidraw` / `.png` | Drafted, pending lead sign-off |
| 5. Appointment modal | `05-appointment-modal.excalidraw` / `.png` | Drafted, pending lead sign-off |
| 6. Invoicing view | `06-invoicing.excalidraw` / `.png` | Drafted, pending lead sign-off |

Screens 1–2 went through the gate PR (#11). Screens 3–6 follow the same low-fi register and are submitted in this PR for sign-off.

---

## How to review

- **PNGs** are for quick visual review. Open them directly on GitHub.
- **`.excalidraw` files** are the editable source. Open at https://excalidraw.com via **File → Open**.
- All labels are **Portuguese (PT)** for staff-facing UI per the brief. EN comes later via i18n.
- Low-fi means: boxes, labels, arrows, no colors, no real components. Visual design happens in Phase 3 against `brand-tokens.md`.

---

## Screens

### 01 — Dashboard

**Purpose:** first screen after login. Answers *"what's happening today and what needs my attention?"*. Not a marketing dashboard.

**Structure:**
- Header: logo, location switcher, user menu
- Three columns: Próximas Consultas Hoje, Ações Rápidas, Estatísticas de Hoje
- Bottom strip: Atividade Recente

**Open questions for the lead:**
- Stat set by role — therapists likely should not see `Receita do dia`. Confirm role-aware logic.
- Default location for users assigned to multiple locations — own primary location, or a "Todas" option?
- Activity log retention — last 24h, last 7 days, or paginated full history?

### 02 — Agenda

**Purpose:** scheduling view. Day / week toggle, conflict detection, room and therapist filters.

**Structure:**
- Header (same pattern as dashboard)
- Toolbar: view toggle (Dia / Semana), date navigation, Terapeutas filter, Salas filter, primary `+ Nova Marcação` action
- Main grid: 5 day columns × time slots
- Conflict cell: two appointment boxes visibly overlapping in the same slot, with `CONFLITO — Sala 1 duplo-marcada` label

**Open questions for the lead:**
- Operating days — Mon-Fri only, or include Sat? Drafted as 5 days; add Sat if applicable.
- Default view — Dia or Semana? Drafted with Semana active.
- Default therapist filter for therapist role — own calendar only, or all visible by default?
- Slot granularity — 30 min drafted; clinic may want 15 min for some services.
- What happens when a conflict exists — soft-block (warn + allow override) or hard-block (cannot save)? Drafted as hard-block.

### 03 — Patient profile

**Purpose:** single patient hub. Answers *"who is this person, what's their history, what do I do next?"*. Landing screen when opening a patient.

**Structure:**
- Header (same pattern as dashboard / agenda)
- `← Voltar` back link
- Patient header card: name, age · sex · NIF, phone · email, `Editar Ficha` action, primary actions `+ Nova Marcação` and `+ Novo Episódio`
- Tab row: `Resumo` (active) · `Episódios` · `Marcações` · `Documentos` · `Faturação`
- Resumo tab content: `Alertas / Red Flags`, `Próxima Marcação`, `Episódios Recentes` list, `Estado de Pagamento` summary
- Flow arrows out: `+ Nova Marcação` → ecrã 5, `+ Novo Episódio` → ecrã 4, `[ver →]` on an episode → ecrã 4

**Open questions for the lead:**
- Terapeuta vê o separador Faturação, ou só admin/recepção? (role-gating)
- NIF sempre visível, ou mascarado até "Editar Ficha"? (PII on screen)
- Alertas / Red Flags — do último episódio, ou campo persistente ao nível do utente?

### 04 — Clinical record editor

**Purpose:** form-driven episode entry with body chart. Maps directly onto the osteopathy / physiotherapy form templates in `docs/draft-form-templates/`.

**Structure:**
- Header (same pattern)
- Patient context strip: name · age
- Title `Novo Episódio · Osteopatia` + `Gravar` top-right
- Top-row fields: Data, Peso, Altura, Marcação associada
- `Alertas (Red Flags)` free text · `Códigos CID` association
- `Problemas de Saúde` checkbox grid (shown with a few options + `+ Outros`)
- Required textareas: `Motivos da Consulta *`, `Condições Alívio/Agrav.`, `Antecedentes/Cirurgia/Med.`
- `Anamnese por Sistemas` — 6 system fields (Neurológico, Cardiovascular, Respiratório, Gastrointestinal, Urológico/Gineco., Endócrino)
- `Bodychart` — 4 silhouettes (ant · lat E · lat D · post) with marker legend
- Treatment textareas: `Objectivos`, `Plano`, `Observações`
- `Notas Pessoais (privadas)` — visually distinct block, labelled "Não partilhado com outros utilizadores"
- `Gravar Episódio` bottom-right

**Open questions for the lead:**
- Editor serve Osteopatia e Fisioterapia com campos diferentes — alterna conforme o tipo de episódio?
- Bodychart: guarda coordenadas + vista, ou imagem anotada? (same question as in the form-template JSONs)
- Notas Pessoais — confirmar RLS / coluna restrita ao autor; não deve passar pelo pipeline de extração AI.
- Auto-guardar rascunho, ou só ao clicar Gravar?

### 05 — Appointment modal

**Purpose:** create or edit a single appointment. Overlay on the Agenda (ecrã 2), not a full page.

**Structure:**
- Dialog box with title `Nova Marcação` and close `[X]` (title becomes `Editar Marcação` in edit mode)
- Utente: search-select existing utente, with `+ Novo utente` path
- Serviço · Terapeuta · Sala selects
- Data, Hora, Duração
- Estado: Pendente / Confirmada / Cancelada radios
- Notas free text
- Conflict warning (conditional): `⚠ Conflito: Sala 1 ocupada 17:00–17:45` — ties back to the agenda's CONFLITO logic
- `Cancelar` · `Guardar` actions
- Flow: `Guardar` → marcação aparece na Agenda (ecrã 2)

**Open questions for the lead:**
- Duração: fixa por serviço, ou editável por marcação?
- Marcação recorrente (série de sessões) — suportar agora ou v2?
- Ao detetar conflito: bloquear Guardar, ou permitir com aviso? (ties to the conflict policy open question on ecrã 2)
- Estado "Cancelada" — precisa de motivo de cancelamento?

### 06 — Invoicing view

**Purpose:** list invoices, see status, issue new ones. Connects to InvoiceXpress (issuance) and IfThenPay / Stripe (payment) — those integrations are not wireframed here.

**Structure:**
- Header (same pattern)
- Title `Faturação` + primary action `+ Nova Fatura`
- Filter row: `Estado` select, `Período` select, search input
- Table: Nº · Utente · Data · Valor · Estado · Ações — example rows show all three status states (Paga / Pendente / Vencida)
- Totals strip: `Pago · Pendente · Vencido` summary
- Bottom note: `emissão via InvoiceXpress · pagamento via IfThenPay/Stripe` — flags the integration boundary

**Open questions for the lead:**
- Fatura gerada a partir de quê — episódio, marcação, ou avulsa?
- Quem pode emitir / anular faturas — só admin / recepção?
- Anular fatura: precisa de nota de crédito? (PT fiscal requirement)
- Mostrar estado de pagamento IfThenPay / Stripe em tempo real nesta lista?

---

## Out of scope for v1 wireframes

These will not be drafted as low-fi wireframes — they are hi-fi or interaction concerns for Phase 3:

- Exact spacing, type sizes, color treatments
- Hover, focus, and loading states
- Empty states beyond a single label
- Animation and transition behavior
- Responsive breakpoints (mobile/tablet layouts)
- Real icons (placeholders only)

---

## Next steps

1. Lead reviews this PR — sign off or request changes on screens 3–6.
2. Once signed off, all six wireframes are the locked contract for Phase 3 hi-fi component implementation.
3. The user-facing strings present here become inputs to the i18n extraction task (`packages/i18n/strings.pt.json` / `strings.en.json`).