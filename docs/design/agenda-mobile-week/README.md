# AGENDA-MOBILE-WEEK screenshots (390x844)

Two captures of a phone, each taken at a 390x844 CSS viewport with a device scale
factor of 1, so each PNG is exactly 390x844 pixels.

WHERE THEY COME FROM. A throwaway local Supabase stack seeded by
`apps/web/e2e/seed/seed-e2e.mjs`, plus a synthetic week for the e2e therapist and
a shared machine (NESA). Every name is invented (patient names end in "Teste" or
"Sintético"), and nothing in it comes from real data. The session is the e2e
therapist's, and the week is Monday 21 to Sunday 27 September 2026.

THE CLOCK. Both shots use the real clock. They were taken at 08:32 Lisbon time on
Thursday 24 September, inside the grid's 08:00 to 21:00 window, so no clock was
fixed. The Next.js development indicator is hidden in both captures; it is not
part of the page.

- `agenda-mobile-week-semana-390x844.png`: Semana, the compressed week grid.
  - The header shows the menu, the logo, the bell, "O meu perfil" and "Terminar
    sessão" (Q-B6-11). The toolbar has Dia and Semana, the date, Hoje and the
    arrows on one line, then Bloquear, Atualizar (its refresh icon beside the time,
    Q-B6-10) and Nova marcação. Nothing scrolls sideways.
  - The grid has seven columns, Seg 21 to Dom 27. Dom shows because the synthetic
    week has a Sunday booking. Qui 24 is marked as today, and the red now line
    crosses Thursday just after 08:30. At 08:32 the page does not need to scroll
    to reach it.
  - The first screen runs from 08:00 to about 15:45. Blocks are coloured by
    service. Each one shows its whole start time, the patient's first name and
    its status glyph; a half-lane block puts the name on a line of its own.
  - Concurrent rows split the column into two lanes. The twin pair on Wednesday
    at 10:30 (the same patient on the therapist and on the machine) is drawn side
    by side. At the foot of the screen, Friday at 15:00 draws two blocks and a
    small dark "+1" chip on their glyph line. Friday's later "+2" and the service
    legend are further down the page.
- `agenda-mobile-week-dia-390x844.png`: Dia for Friday 25, the unchanged AGMOB-01
  list with the same toolbar. Each row shows the start time, the duration, the
  status glyph, the patient, and the practitioner and service. Machine rows
  (NESA (B6)) are listed with the therapist's.
