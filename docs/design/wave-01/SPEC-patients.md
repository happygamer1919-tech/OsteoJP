# SPEC: Patients (Wave 01)

Status: scoped, not built. Owner: Ivan (schema), Max (surface). Reference clinic: https://osteojp.pt/

## Additive patient columns (batch into one migration)
- Patient identification number: human-readable, shown next to NIF on the profile preview. Distinct from internal UUID. Format pending JP (see QUESTIONS.md): sequential vs prefixed, per-tenant scoped. ID-generation strategy decided before migration.
- Profession: free-text field. Clinically relevant (sedentary work, job-driven strain).
- Address reduction: drop street address; keep city and region only. Confirm no downstream consumer (invoicing, declarations) needs full street address before dropping. If fiscal documents need full address, this becomes a fiscal question, not a simple column change.
- Patient-level notes: a notes space on the patient (distinct from per-visit appointment notes in SPEC-appointments).

## Fichas relocation (data side)
What it does: "Fichas Clinicas" stops being a top-level nav section and becomes a tab inside the patient profile, alongside "marcacoes". Records already exist; this is routing + a profile tab (Max), but the tab must point at the right relation, so it lands after the gated-completion design (SPEC-appointments) is settled.
Done: per-patient fichas queryable and rendered in the profile tab; no top-level Fichas section.

## Schedule-again (clone path, data side)
What it does: from the patient's appointment list, clone an existing appointment with identical details (therapist, service, location, duration) and ask only for new date/time.
Done: clone endpoint produces an identical appointment differing only in date/time; Max wires the action.

## Surface (Max, lands after migration green)
- Patient ID next to NIF on profile preview.
- Profession field in profile.
- City/region instead of full address.
- Patient notes space.
- Fichas tab inside profile.
- Schedule-again action on appointment list.
