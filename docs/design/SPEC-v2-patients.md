# SPEC-v2-patients: Pacientes

Status: ready for implementation (design loop V2-W3)
Foundation: docs/design/SPEC-v2-foundation.md. All primitives from the section 9 inventory. No new primitive.
Copy: docs/brand-voice.md (PT first, EN second). No exclamation marks. Always "paciente", never "utente".
Scope: presentation only. Reuses the existing patients fetch and search. No schema, API, RLS, auth, or permission changes.

Route: the existing patients route in apps/web, inside the SidebarAppShell (Pacientes active).

---

## 1. Layout (top to bottom)

1. Title and subtitle.
2. Primary action: "Novo Paciente".
3. Full-width search bar.
4. Patient list inside a glass container.

The HeritageFrame wraps the content area at `density="restrained"`, behind the list.

### 1.1 Title

- Title "Pacientes".
- Subtitle "Consulte e gerencie os seus pacientes." at `v2-text-secondary`.

### 1.2 Primary action

- "Novo Paciente", filled Wellness Green button. Never "Novo utente" (binding brand-voice rule).

### 1.3 Search bar

- Full-width search bar with a magnifier icon, inline and debounced, NO separate search button. Binds to the existing search query/state.
- Placeholder follows brand-voice ("Pesquisar pacientes" / "Search patients").

---

## 2. Patient list (GlassPanel + Table)

A glass container (`GlassPanel`) wrapping the existing patients table, restyled.

- Column headers: "Paciente" and "Telemóvel".
- Each row:
  - An initial-avatar chip (initials in a tinted circle, Wellness Green tint for patient icons per the palette role).
  - Name.
  - NIF in small text (`v2-text-secondary`), under or beside the name.
  - Phone in the Telemóvel column.
  - A chevron on the right.
- The whole row is clickable and routes to the patient profile. Single tab stop per row; the chevron is decorative (the row is the control).

ASSUMPTION: NIF and phone are already on the existing patient list query. If NIF is not fetched on the list, omit it from the row and flag to Ivan (do not add a query field in a design wave).

---

## 3. States

| Surface | Loading | Empty | Error |
|---|---|---|---|
| List | row skeletons inside the glass container | two distinct EmptyStates: zero-patients ("Ainda não há pacientes." + "Novo Paciente" action) and zero-results ("Sem resultados para a pesquisa.") | ErrorState inside the container |

The zero-results empty state never offers "Novo Paciente" as the resolution; it invites refining the search. The zero-patients empty state offers the create action.

Pagination or infinite scroll for the full list, reusing the existing paging behavior. ASSUMPTION: v1 already paginates; this restyles the existing control. If v1 loads all patients at once, keep that and flag a performance follow-up to Ivan (not a design ticket).

---

## 4. Role gating

- View any patient: Admin, Receptionist. Therapist sees own patients only, per the permission matrix and the existing query scope. The list never widens scope.
- "Novo Paciente": shown to roles allowed to create patients per existing checks.

---

## 5. Data-dependency flags

None new. Reuses the existing patients fetch and search. The only conditional element is NIF on the row, which depends on the existing list query exposing it (see section 2 assumption).
