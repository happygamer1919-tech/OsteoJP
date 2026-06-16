# SPEC-v2-admin: Administração

Status: ready for implementation (design loop V2-W6)
Foundation: docs/design/SPEC-v2-foundation.md. All primitives from the section 9 inventory. No new primitive.
Copy: docs/brand-voice.md (PT first, EN second). No exclamation marks. "Definições", not "configurações".
Scope: presentation only. Reuses the existing admin content and the existing admin/owner gating. No schema, API, RLS, auth, or permission changes.

Route: the existing admin hub route in apps/web, inside the SidebarAppShell (Administração active).

---

## 1. Layout

1. Title and subtitle.
2. Tab row.
3. Active tab content.

The HeritageFrame wraps the content area at `density="restrained"`.

### 1.1 Title

- Title "Administração".
- Subtitle "Gestão da clínica, equipa, serviços e locais." at `v2-text-secondary`.

### 1.2 Tabs

Tab row: Resumo, Definições da Clínica, Equipa, Serviços, Locais. The active tab has a Wellness Green underline. Tabs remain the only navigation inside this hub (carry the v1 W4-06 decision: no duplicated link boxes).

---

## 2. Resumo tab (four descriptive GlassCards, 2x2)

Four descriptive glass cards in a 2x2 grid. Each card: a soft tinted icon circle, a title, a one-line description, and a chevron. Clicking a card switches to the matching tab.

| Card | Icon | Accent | Description |
|---|---|---|---|
| Definições da Clínica | building | Wellness Green | "Dados da clínica, preferências, lembretes e faturação." |
| Equipa | users | Portuguese Blue | "Utilizadores, funções e acessos da equipa." |
| Serviços | briefcase | Soft Lavender | "Serviços, durações e preços." |
| Locais | pin | Warm Gold | "Locais da clínica e respetivos contactos." |

Each card is a single tab stop (interactive `GlassCard`), with the hover lift. The chevron is decorative.

---

## 3. Other tabs

Definições da Clínica, Equipa, Serviços, and Locais reuse the existing tab content, restyled to glass surfaces and v2 tokens. Presentation only: no field, validation, or save behavior changes.

ASSUMPTION: the four non-Resumo tabs already exist with working content. This wave restyles them; it does not add settings, fields, or save logic. If a tab is currently a stub, render it as an honest empty state and flag to Ivan.

---

## 4. States

| Surface | Loading | Empty | Error |
|---|---|---|---|
| Resumo cards | card skeletons | n/a (the four cards are static navigation) | inline |
| Other tabs | per existing content | per existing content | per existing content, restyled to ErrorState |

---

## 5. Role gating

- Admin and owner only (the whole hub). Therapist and Receptionist do not see Administração in the nav and cannot reach the route, per the existing checks. The screen never relaxes this client-side; server enforcement is unchanged.

---

## 6. Data-dependency flags

None new. Reuses existing admin content and gating.
