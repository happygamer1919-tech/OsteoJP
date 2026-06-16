# Design loop — open questions and follow-ups

Append-only. Each entry names the wave that raised it, the issue, and a
recommended default. Backend/functional follow-ups raised by a design wave are
recorded here so the visual work can ship without inventing data models.

---

## V2-W2 Agenda (PR #245)

### Q-V2W2-1 — Blocked-time band needs a data model (backend functional follow-up)

SPEC-v2-agenda §2.1 specifies a muted, non-interactive "blocked time" band on the
week/day grid. There is **no blocked-time data model** in scheduling today (only
appointments and time-off conflicts), and data models are out of design-wave
scope permanently. The band is therefore **left unrendered** in V2-W2.

- **Status:** blocked on backend. The band cannot render until a blocked-time
  data model + query exist (a non-design, functional ticket).
- **Recommended default:** ship the agenda without the band; add a backend ticket
  for a `blocked_time` (or equivalent) model + an agenda query that returns
  blocked spans, then a small presentation follow-up renders the muted band.
- **Owner:** Ivan / backend stream. Confirmed in the PR #245 resolution.

### Q-V2W2-2 — Missing v2 glass primitives (foundation follow-up)

V2-W2 reuses existing primitives as stopgaps because the v2 glass equivalents did
not ship in V2-W0, and section waves must not touch `packages/ui`:

- No **Wellness Green Button variant** — the "Nova Marcação" CTA is styled
  in-route on v2 tokens (green-700 fill + inverse text, 4.7:1 AA).
- No **glass DatePicker**, **glass SegmentedControl**, or **glass Select** — the
  v1 primitives are reused in the toolbar.

- **Status:** non-blocking stopgaps in place.
- **Recommended default:** add these as `packages/ui` foundation follow-ups
  (green Button variant + the three glass form primitives), then swap the agenda
  toolbar over in a later wave. Do not add them inside a section wave.

### Q-V2W2-3 — Service catalogue → colour-category mapping (non-blocking)

Appointment cards are tinted by matching the service name against the five
SPEC §2.1 categories (Osteopatia family by prefix), with a neutral fallback +
"Outros serviços" legend entry for anything else.

- **Status:** non-blocking; works for the five canonical names.
- **Recommended default:** confirm the live service catalogue names map cleanly
  to the five categories, or provide the canonical service→category mapping.
