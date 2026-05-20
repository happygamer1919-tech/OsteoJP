# Wireframes — v1

Low-fi wireframes for the OsteoJP platform's 6 critical screens. Source for hi-fi design (Phase 3) and the contract for what each screen contains.

> Phase 0/1 task: `[MAX]` Wireframes for the 6 critical screens (Excalidraw or Figma, low-fi).
> Paired task: `[YOU]` Wireframe sign-off for 6 critical screens.

---

## Status

| Screen | File | Status |
|---|---|---|
| 1. Dashboard | `01-dashboard.excalidraw` / `.png` | Drafted, pending lead sign-off |
| 2. Agenda | `02-agenda.excalidraw` / `.png` | Drafted, pending lead sign-off |
| 3. Patient profile | — | Not started |
| 4. Clinical record editor | — | Not started |
| 5. Appointment modal | — | Not started |
| 6. Invoicing view | — | Not started |

Per the lead's brief: 2 screens for sign-off before drafting the remaining 4. This PR is that gate.

---

## How to review

- **PNGs** are for quick visual review. Open them directly on GitHub.
- **`.excalidraw` files** are the editable source. Open at https://excalidraw.com via **File → Open**.
- All labels are **Portuguese (PT)** for staff-facing UI per the brief. EN comes later via i18n.
- Low-fi means: boxes, labels, arrows, no colors, no real components. Visual design happens in Phase 3 against `brand-tokens.md`.

---

## Screens drafted in this PR

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

1. Lead reviews this PR — sign off or request changes on the 2 drafted screens.
2. Once direction is locked, draft the remaining 4: Patient profile, Clinical record editor, Appointment modal, Invoicing view — shipped as a second PR.
3. Phase 3 picks these up as the spec for hi-fi component implementation.