# Loop PL-10 - Agenda name-line: smaller, non-bold, first + last only (owner 2026-07-30)

GATE: owner feedback, self-merge on green CI (non-migration, staff-facing UI).

## Field 1. Owner feedback (verbatim intent)

On the agenda, the patient name-line is too big, is bold (wastes space), and shows
the FULL name including every middle name. "If there is 'Abílio José de Carvalho
Fernandes' it will reflect all 4 names, not just the main ones - need only first and
last name shown." Three changes, agenda grid line only:

1. Font too big -> smaller.
2. Bold -> remove (save space).
3. Full name -> first + last name only.

## Field 2. Current state (code-grounded)

- The agenda is NOT cards: each appointment is one line = the patient full name in
  the therapist colour (W11-00 v3). Rendered by `AppointmentName` in
  `apps/web/app/agenda/agenda-grid.tsx`.
- The name-line `<button>` (was `text-sm font-semibold`) rendered
  `{appt.patientName}` unmodified - the full stored `patients.full_name` string
  (single column; no first/last split - `packages/db/src/schema.ts:496`).
- The full name is ALSO carried by the hover popup
  (`appointment-hover-card.tsx`), the sole detail carrier (W10-05 / W12-33).
- No existing "first + last full-word" helper; `initialsOf` (patients/page.tsx)
  already does the first/last token selection but returns initials.

## Field 3. Change (agenda grid line ONLY)

- New exported helper `shortPatientName(fullName)` in `agenda-grid.tsx`: splits on
  whitespace; `<= 2` words returned unchanged; `> 2` words -> `first + last`.
  "Abílio José de Carvalho Fernandes" -> "Abílio Fernandes".
- Name-line `<button>` classes: `text-sm -> text-xs`, `font-semibold ->
  font-normal`.
- Render `{shortPatientName(appt.patientName)}` on the line.
- HOVER popup UNCHANGED - still shows the full name (disambiguation lives there).
- Marcações row and the hover panel are OUT OF SCOPE (owner named the agenda only).

## Field 4. Definition of done

- `shortPatientName` unit tests: 4-word -> first+last; <=2-word unchanged;
  whitespace-robust; empty -> empty.
- Render tests: >2-word name renders shortened on the grid face while the FULL name
  is preserved in the hover markup; the line is `text-xs` + `font-normal` (not
  `text-sm`/`font-semibold`). (agenda-grid.test.tsx, 24 pass.)
- Existing W11-00 full-name assertion updated to the shortened expectation + a
  full-name-in-hover assertion.
- e2e de-risked: every agenda e2e fixture is "Maria Silva" (2 words, unchanged);
  the `toHaveCSS` assertions check `text-decoration-line`, not font. No e2e break.
- Gates: lint 0-err, typecheck clean, build ok. Owner visual gate on the Vercel
  preview / prod after deploy.

## Field 5. Restrictions

- Staff-facing agenda only; not patient-facing (no PDF/portal/patient output).
- Literal "first token + last token" per the owner's rule; smarter surname/particle
  handling (Júnior/Filho) is a future loop if ever wanted - not decided here.
