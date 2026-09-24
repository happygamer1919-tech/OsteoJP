# AGENDA-MOBILE-WEEK screenshots (390x844, device scale 3)

Taken from a throwaway local Supabase stack seeded by `apps/web/e2e/seed/seed-e2e.mjs`
plus an invented therapist week (patient names ending in "Teste" or "Sintético"; no
real data). Logged in as the e2e therapist, week of Mon 21 Sep 2026.

THE WEEK. Every count below belongs to this invented week. Rows per day, Monday to
Friday: 10, 16, 13, 19 and 20 (the Dia shot reads the Friday's 20), plus one on
Sunday. The Friday's busiest moment is 16:00, with four concurrent rows.

Blocks are 30, 45 and 60 minutes long. Seventeen 30-minute blocks sit in half lanes,
which is the tightest face the grid draws (Q-B6-1 in docs/DECISIONS.md): the whole
start time (about 7.4px), then the status glyph and one to three letters of the name,
one on most of them. The week also has shared-machine rows, moments of three and
four concurrent rows (each shows its left lane plus a "+N" chip, so three at once
read one block and "+2"; Q-B6-1 logs this as a departure from the card), one twin pair
(Wednesday 10:00, the same patient on the therapist and on the machine), one Sunday
booking, a cancelled row (Tuesday 12:00), no-show rows and a blocked band (Monday
18:00 to 20:00). The Sunday booking makes the grid seven columns wide, the narrowest
its lanes get at 390.

- `agenda-mobile-week-semana-390x844.png`: Semana on a phone, the compressed week grid,
  real clock. It was taken in the early morning Lisbon time, outside the 08:00 to 21:00
  window, so there is no now line and no scroll. In the toolbar, Atualizar shows its
  refresh icon beside the time (Q-B6-10).
- `agenda-mobile-week-semana-390-fullpage.png`: the same page, full height, so the whole
  week, the axis down to its 21:00 end label, and the colour legend (Q-B6-3) can be read
  in one image.
- `agenda-mobile-week-dia-390x844.png`: Dia for the Friday, the unchanged AGMOB-01 list.
- `agenda-mobile-week-semana-390x844-clock-fri-1610.png`: the same Semana with the
  browser clock fixed at Friday 16:10 Lisbon, only to show the now line and the one-time
  scroll to it. The fixed clock also makes the server and browser disagree about today,
  which the desktop grid reports in development as a hydration warning; with a real clock
  there is none.

The Next.js development indicator is hidden in all four captures; it is not part of the
page.
