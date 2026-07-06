# Loop W3-08 - Agenda 6-day week (incl. Saturday) + 24h time sweep (migration-free)

GATE: none. UI lane, migration-free. Recon-first (the 24h sweep is app-wide). Runs in parallel with any one in-flight migration (touches no `packages/db` or workflow files).

## Field 1. Scope and ground truth
Two changes, both from the confirmed real clinic schedule:

Ground truth (locked ruling to embed — GREEN runs with zero memory):
- **Real clinic schedule** (DECISIONS 2026-07-05): **Mon–Fri 08:00–20:00, Sat 09:00–13:00**. The agenda **week view shows 6 days including Saturday**. All time display and pickers use **24h format** (`00:00`–`23:59`), **no AM/PM anywhere**.
- Display timezone is **Europe/Lisbon** (CLAUDE.md: dates UTC in DB, Europe/Lisbon for display).

(a) **Agenda week view = 6 days (Mon–Sat).** Recon the current week grid (likely 5 columns Mon–Fri or 7 Mon–Sun) and change it to render Monday through Saturday inclusive.

(b) **24h sweep, app-wide.** Every time display and every time picker must render 24h `HH:mm` with no AM/PM. This is a SWEEP — recon must enumerate EVERY surface that formats or picks a time and confirm each is 24h.

Recon before writing (report findings, paste the FULL list of paths):
- The agenda week-view grid component and how its day columns are generated (start-of-week, day count).
- EVERY time display + time picker across the app: agenda cards, Nova marcação time picker, Agendar lote per-date time pickers (W2-10), working-hours admin (W2-12), appointment preview, Marcações list, any date/time formatter. Grep for 12h format tokens (`a`, `A`, `aaa`, `hh`, `h:` with meridiem, `AM`/`PM`, Intl `hour12: true`, `hourCycle: 'h12'`) across `apps/web` and `packages/ui`.
- The established formatting helper(s) so the fix is centralized where possible, not scattered.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w3-08-agenda-6day-24h origin/main -b osteojp-w3-08-agenda-6day-24h`; assert `git rev-parse --show-toplevel` ends in the worktree name; assert `git status --porcelain` empty. HALT if either fails.
2. Recon, report BEFORE editing: the week-grid day-generation, and the COMPLETE list of time display/picker surfaces + any 12h format tokens found.
3. Agenda week view → 6 days (Mon–Sat inclusive). Verify appointments on Saturday render in the new column.
4. 24h sweep: convert every time display/picker to 24h `HH:mm` (no AM/PM, `hourCycle: 'h23'` / `hour12: false` / non-meridiem format tokens), centralizing through the shared formatter where one exists.
5. Tests: agenda renders 6 day columns including Saturday and places a Saturday appointment correctly; representative time-format tests assert 24h with no meridiem across the surfaces recon identified.
6. Full gates: lint, typecheck, test, build, and `test:e2e` for the agenda week view + a booking time picker.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- Recon list of ALL time display/picker surfaces pasted, each marked converted/confirmed-24h.
- No 12h format remains in display paths: paste a `git grep` for meridiem tokens (`hour12: true`, `hourCycle: 'h12'`, `'a'`/`'A'` meridiem tokens, literal `AM`/`PM`) returning zero hits in display/picker code. Paste it.
- Agenda week view shows 6 columns (Mon–Sat) and a Saturday appointment renders in the Saturday column: paste the test + e2e.
- Representative 24h-format tests pass across the surfaces. Lint/typecheck/test/build green (paste commands run).

## Field 4. Verification (paste evidence)
Recon report (week-grid + full time-surface list), migration-free `git diff --name-only`, `git grep` zero-hit for meridiem, agenda 6-day test + Saturday placement, 24h-format tests, e2e summary, gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change. (This is display + week-grid only; it does NOT change availability data — that is W3-09.)
- 24h everywhere, no AM/PM anywhere; Europe/Lisbon display tz preserved.
- The week view shows exactly 6 days (Mon–Sat); do not add Sunday.
- A0 worktree isolation: work only in `../osteojp-w3-08-agenda-6day-24h` off origin/main; never edit the primary clone.
- Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`. One migration in flight (this loop opens none). Never force-push. Never merge with `--admin`. Never bypass branch protection.
- pt-PT via i18n keys where copy is involved, no emoji.

## Field 6. Halt loud if
- A time surface cannot be converted to 24h without editing a shared `packages/ui` primitive whose change would ripple beyond time display (surface the blast radius).
- The week grid's day count is coupled to logic (e.g. availability windowing) that a 5→6 day change would break elsewhere — surface it.
- Recon finds a time surface whose format is driven by a locale/config that cannot be pinned to 24h without a broader i18n change — surface the tradeoff.
- HALT-LOUD PROTOCOL (all halts, all W3 loops): write a halt file to `~/osteojp-mailbox/inbox/` named `halt-<UTC-timestamp>-W3-08.md` with the mismatch, options, and a recommended default. Poll `~/osteojp-mailbox/outbox/` up to 30 minutes; apply and archive under `~/osteojp-mailbox/archive/` if answered; else classic stop with the branch green and resume state recorded. Never guess a product decision.

## Field 7. Report back
Recon report (week-grid + complete time-surface list), the 6-day change + 24h sweep, `git grep` zero-hit for meridiem, agenda + format tests, migration-free proof, e2e summary, gate results, PR number.
Close: open a PR per template. GREEN chained runner applies the merge gate (every required check SUCCESS, diff touches neither `db-tests.yml` nor `e2e.yml`, PR mergeable). A refused merge is a HALT.
