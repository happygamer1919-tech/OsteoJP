# SPEC-v2-fichas: Fichas Clínicas

Status: ready for implementation (design loop V2-W4)
Foundation: docs/design/SPEC-v2-foundation.md. All primitives from the section 9 inventory. No new primitive.
Copy: docs/brand-voice.md (PT first, EN second). No exclamation marks. "Paciente", never "utente". No dashes in displayed model titles.
Scope: presentation only. Reuses the existing clinical-records list fetch. No schema, API, RLS, auth, or permission changes. Preserves the two orthogonal status axes (`record_status`, `ai_review_state`) exactly as the existing spec defines them.

Route: the existing clinical fichas list route in apps/web, inside the SidebarAppShell (Fichas Clínicas active).

---

## 1. Layout (top to bottom)

1. Title and subtitle.
2. Primary action: "Nova Ficha".
3. Glass table container.

The HeritageFrame wraps the content area at `density="restrained"`, behind the table.

### 1.1 Title

- Title "Fichas Clínicas".
- Subtitle "Consulte e gerencie as fichas clínicas dos seus pacientes." at `v2-text-secondary`.

### 1.2 Primary action

- "Nova Ficha", filled Wellness Green button.

---

## 2. Table (GlassPanel + Table)

A glass table container, columns: Data, Paciente, Modelo, Estado.

- Data: appointment/record date, Europe/Lisbon display.
- Paciente: patient name.
- Modelo: the existing model title string, rendered as stored. Do NOT introduce dashes into the displayed title (the v1 W4-09 sweep replaced em dashes with colons in seed display strings; honor that).
- Estado: a glass `StatusChip`.

### 2.1 Estado chip and the two status axes

Estado is rendered as a glass `StatusChip`, preserving the two separate status axes:

- `record_status` lifecycle (`draft` to `locked` to `signed`): "Assinada" with a green dot, "Rascunho" with a grey dot, and the locked state per the existing mapping.
- `ai_review_state` (AI-ingested records only): the review-queue states are surfaced on the Revisão screen (SPEC-v2-review), not conflated into the record_status chip here. A record that arrived via AI and has not yet been accepted shows its review state distinctly; once accepted it follows the standard `record_status` lifecycle.

The chip never merges the two axes into one ambiguous label. Label text uses 700 or `v2-text-primary` per the accent AA rule; the dot may carry the base tone.

### 2.2 Row interaction

- Row click opens the ficha. There is NO separate "Abrir" link or column (carry the v1 decision forward).
- Single tab stop per row.

---

## 3. States

| Surface | Loading | Empty | Error |
|---|---|---|---|
| Table | row skeletons inside the glass container | EmptyState ("Ainda não há fichas clínicas." + "Nova Ficha" action where the role may create) | ErrorState inside the container |

---

## 4. Role gating

- View clinical records: Admin, Therapist (own patients only). Receptionist has no access to clinical records and does not see this screen's data (the nav item is hidden or the screen renders an access-denied state per existing checks).
- Edit clinical records: Therapist (own, until locked); Admin is read-only. "Nova Ficha" is shown only to roles that may create a record per existing permissions.
- The list never widens scope beyond the existing query.

---

## 5. Data-dependency flags

None new. Reuses the existing clinical-records list fetch and the existing status fields. No change to the state machines.
