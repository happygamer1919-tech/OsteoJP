# SPEC-v2-review: Revisão

Status: ready for implementation (design loop V2-W5)
Foundation: docs/design/SPEC-v2-foundation.md. All primitives from the section 9 inventory. No new primitive.
Copy: docs/brand-voice.md (PT first, EN second). No exclamation marks. "Paciente", never "utente".
Scope: presentation only. Reuses the existing review-queue fetch and the existing claim flow. No schema, API, RLS, auth, or permission changes. The `ai_review_state` values stay PLACEHOLDER pending the AI partner auth contract, exactly as the schema defines.

Route: the existing review queue route in apps/web, inside the SidebarAppShell (Revisão active).

---

## 1. Layout

1. Title and subtitle.
2. Either the empty state or the populated review table.

The HeritageFrame wraps the content area: `density="calm"` is acceptable on the empty state (it reads as a near-empty surface), `density="restrained"` on the populated table.

### 1.1 Title

- Title "Revisão".
- Subtitle "Fichas de IA e formulários de paciente a aguardar revisão." at `v2-text-secondary`.

---

## 2. Empty state

- A green check circle (Wellness Green tint, CheckCircle icon).
- Heading "Sem itens para rever".
- Description "Os novos registos do parceiro de IA e as submissões de pacientes aparecem aqui."

No action button: the empty queue is a good state, not a prompt to create anything.

---

## 3. Populated state (Table, glass restyle)

The existing review table, restyled to glass. Columns:

- Paciente (never "Utente").
- Origem (source: AI partner, patient submission).
- Item (what is awaiting review).
- Estado (a glass `StatusChip` carrying the `ai_review_state` placeholder values: pending_review, in_review, approved, rejected, surfaced with human-readable PT/EN labels).
- Atualizado (last-updated timestamp, Europe/Lisbon display).

The existing claim flow stays intact: claiming an item for review, and the reviewer accepting an AI payload (after which the resulting clinical_record follows the standard record_status lifecycle, never produced as locked or signed directly). The screen changes presentation only; the claim/accept/reject behavior and permissions are unchanged.

---

## 4. States

| Surface | Loading | Empty | Error |
|---|---|---|---|
| Queue | row skeletons | the section 2 empty state (green check) | ErrorState inside the container |

---

## 5. Role gating

- Review access follows the existing checks (reviewers per the current permission setup). Receptionist has no clinical access. The screen never widens scope.

---

## 6. Data-dependency flags

None new. Reuses the existing review-queue fetch and claim flow. The `ai_review_state` values remain placeholders pending the AI partner auth contract; this screen surfaces whatever values the schema currently defines and adds none.
