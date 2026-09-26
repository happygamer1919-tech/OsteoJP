# AGENDA-MOBILE-WEEK screenshots (390x844)

Two captures of a phone, each taken at a 390x844 CSS viewport with a device scale
factor of 1, so each PNG is exactly 390x844 pixels.

WHERE THEY COME FROM. A local Supabase lane stack (`scripts/lane-stack.mjs`),
reset and then seeded by `apps/web/e2e/seed/seed-e2e.mjs`, plus a synthetic week
for the e2e therapist and a shared machine (NESA). Every name is invented
(patient names end in "Teste" or "Sintético"), and nothing in it comes from real
data. The session is the e2e therapist's, and the week is Monday 21 to Sunday 27
September 2026.

THE CLOCK. Both shots are set at 11:22 Lisbon time on Thursday 24 September,
inside the grid's 08:00 to 21:00 window. They were retaken that evening, after
the window had closed, so two clocks were set back to that morning: the local
development server's clock ran from 11:21, and the browser's clock was fixed at
the server's time as each page was opened, 11:22 both times. The now line and
the today mark read the browser's clock. The toolbar's time reads the server's,
so it shows 11:22 in Semana and 11:23 in Dia, the page opened second. The
database kept the real clock. The Next.js development indicator is hidden in
both captures; it is not part of the page.

THE SCROLL. On a phone the shell header, the toolbar and the day header stay
pinned at the top while the rows scroll under them, so one frame holds about
eight hours of the grid. Each page was scrolled before its capture:
- Semana first made its own one-time scroll to the now line. The capture script
  then moved it so that 10:00 sits right under the pinned day header, 25 pixels
  from where the page's own scroll had put it.
- Dia was scrolled so that Friday's first 15:00 row sits right under its pinned
  day header.

- `agenda-mobile-week-semana-390x844.png`: Semana, the compressed week grid.
  - Pinned at the top: the header (the menu, the logo, the bell, the initials
    avatar, which is the /perfil link, then "O meu perfil" and "Terminar
    sessão", each on two lines, Q-B6-11) and the toolbar (Dia and Semana; then
    the date, Hoje and the arrows on one line; then Bloquear, Atualizar with its
    refresh icon beside the time, Q-B6-10, and Nova marcação, the three with 8px
    of side padding). Nothing scrolls sideways.
  - The day header has seven columns, Seg 21 to Dom 27. Dom shows because the
    synthetic week has a Sunday booking, drawn at 10:00. Qui 24 is marked as
    today, and the red now line crosses Thursday just after 11:20.
  - The frame runs from 10:00 to about 18:05. Blocks are coloured by service.
    Each one shows its whole start time, the patient's first name and its status
    glyph; a half-lane block puts the name on a line of its own, and its start
    time sits flush on the block's coloured stripe.
  - Concurrent rows split the column into two lanes. The twin pair on Wednesday
    at 10:30 (the same patient on the therapist and on the machine) is drawn side
    by side, the therapist's row on the left: the machine is at the therapist's
    clinic, so this page knows it is a machine.
  - Friday at 15:00 draws two blocks and a small dark "+1" chip on their glyph
    line, and Friday at 16:00 draws two blocks and a "+2" chip the same way
    (Q-B6-1). A chip opens Dia for Friday.
  - Above the frame are the rows before 10:00. Below it are the rows after about
    18:00 and the service legend (Q-B6-3).
- `agenda-mobile-week-dia-390x844.png`: Dia for Friday 25, the unchanged AGMOB-01
  list, under the same pinned header and toolbar and its own pinned day header.
  The frame shows Friday's rows from 15:00 to 18:00, so every row that Semana's
  two chips stand for is listed here, the no-show struck through. Each row shows
  the start time, the duration, the status glyph, the patient, and the
  practitioner and service. Machine rows (NESA (B6)) are listed with the
  therapist's.
