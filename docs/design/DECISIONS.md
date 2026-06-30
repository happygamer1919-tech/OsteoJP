
## 2026-06-30 - Wave 01 locked calls
- Wave 01 work split on the migration fault line: schema/lifecycle = Ivan, pure UI/nav/content = Max, mixed = schema-first (Ivan) then UI (Max).
- Dependencies are one-directional and front-loaded: data lands green on main, then UI consumes. Max never blocks Ivan.
- Migrations ordered cheap-to-expensive, unblocking the most Max items first: patient migration first, lifecycle/batch last.
- "Fichas Clinicas" becomes a tab inside the patient profile, removed as a top-level nav section.
- Patient address reduced to city + region; full street address dropped (pending confirm no fiscal/declaration dependency).
- Per-visit appointment notes gate appointment completion; designed together with the Fichas relocation so note and ficha are not disconnected.
- Confirmation state and appointment lifecycle status are separate axes, never collapsed.
- Availability logic is shared between the new-appointment panel, the batch engine, and multi-therapist conflict reporting; built once.
- KPI event schema defined and deployed now, before the dashboard; capture gross, apply VAT at report time.
- Wave docs live at docs/design/wave-01/; DECISIONS.md and QUESTIONS.md at docs/design/ root, append-only.
