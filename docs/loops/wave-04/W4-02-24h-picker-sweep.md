# Loop W4-02 - 24h time-INPUT sweep: convert the custom time-picker widget(s), remove AM/PM columns (migration-free, recon-first)

GATE: none. UI lane, migration-free. Recon-first (app-wide time-INPUT sweep). Runs in parallel with any one in-flight migration (touches no `packages/db`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Complete the 24h conversion for time-**input** widgets. W3-08 converted display formatting; owner QA on 2026-07-06 found an input widget it missed.

Ground truth (locked ruling to embed — GREEN runs with ZERO memory):
- **24h everywhere, no AM/PM anywhere** (DECISIONS 2026-07-05 "Real clinic schedule + 24h time format everywhere"): all time display AND all time pickers use 24h `HH:mm` (`00:00`–`23:59`); NO AM/PM anywhere in the product. Display timezone is **Europe/Lisbon** (CLAUDE.md: dates UTC in DB, Europe/Lisbon for display).
- **W3-08 (#475) shipped the 24h DISPLAY sweep + the 6-day agenda** and owner QA CONFIRMS both are correct. W3-08 centralized display through `formatTimeOfDay` + pt-PT `Intl` and reported native pickers as 24h. Its DoD grep looked for meridiem **format tokens** (`hour12: true`, `hourCycle: 'h12'`, `'a'`/`'A'` meridiem tokens, literal `AM`/`PM` in format strings).
- **THE MISS (QA 2026-07-06):** the **custom time-picker widget in Nova marcação** still renders **12h columns with AM/PM** — QA screenshot shows an **`09` / `00` / `AM–PM`** three-column scroll picker. This is a CUSTOM column-picker that builds its own hour column (1–12) and a separate AM/PM column from **literal arrays / component state**, NOT via a date-format token — which is exactly why the W3-08 token-grep did not catch it. **Same failure class as the W3-01 estado regression: a SECOND component path** that the first sweep's search pattern could not see.
- Because it is a second path, the recon here must search for **time-INPUT construction**, not just format tokens: literal hour ranges (`1..12`), meridiem strings/arrays (`'AM'`, `'PM'`, `['AM','PM']`, `meridiem`, `ampm`, `period`), `hour12`/`hourCycle: 'h12'` used inside a PICKER, and any component that assembles hours/minutes/period columns by hand.

Scope: **RECON-FIRST — find EVERY time-INPUT component in the app**, then convert ALL of them to a 24h `00:00`–`23:59` input and **remove the AM/PM columns entirely**. Known/likely surfaces to check (confirm and extend in recon):
- the **Hora picker in Nova marcação** (the confirmed offender);
- **Agendar lote** per-date time pickers (W2-10 #462);
- **working-hours editing** in the Horários admin (W2-12 #464 — start/end time inputs);
- appointment reschedule / edit time inputs;
- any sibling reuse of the same custom picker component anywhere else (grep for its import sites).

If a surface uses the **native** browser time input, confirm it already renders 24h under pt-PT/`h23` and needs no change (record it as confirmed). The target is the CUSTOM widget(s) rendering literal 12h + AM/PM columns. **Migration-free** — this is input UI only; it does NOT change stored values (DB stays UTC; the input still yields the same `HH:mm`/timestamp, just entered in 24h).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-02-24h-picker-sweep origin/main -b osteojp-w4-02-24h-picker-sweep`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-02-24h-picker-sweep`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE editing — paste the FULL list of time-INPUT surfaces.** Two search passes, both pasted:
   - **format-token pass** (the W3-08 pattern, to confirm no display regressed): `git grep -nE "hour12|hourCycle|'a'|\"a\"|AM|PM|meridiem"` across `apps/web` and `packages/ui`.
   - **input-construction pass** (the pattern W3-08 could NOT see): grep for the custom picker's column construction — literal hour ranges (`1..12`, `Array.from({length: 12`), meridiem arrays/state (`AM`, `PM`, `ampm`, `meridiem`, `period`), and the picker component's own name + its import sites. Identify the ONE (or few) custom picker component(s) and every place it is mounted.
   - State, per surface: native-24h (confirmed, no change) vs custom-12h (must convert).
3. **Convert every custom 12h picker to 24h:** hours column `00`–`23`, minutes as today, **AM/PM column removed entirely**. Value semantics unchanged (same resulting `HH:mm`). Centralize so a shared custom picker is fixed ONCE and all mount sites inherit it; if there are genuinely separate widgets, convert each and note why they are separate.
4. **Sweep the mount sites** identified in recon (Nova marcação, Agendar lote, working-hours, reschedule, any siblings) and confirm each now shows 24h with no AM/PM.
5. **Tests:**
   - a unit/component test asserting the picker exposes 24h hours (`00`–`23`) and renders NO meridiem/AM-PM element;
   - a value round-trip test: selecting e.g. `14:30` yields the same stored value the old 12h `02:30 PM` would have (no data-semantic change);
   - representative coverage across the recon-identified mount sites.
6. **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for a booking time picker (Nova marcação) plus one other mount site (e.g. working-hours or Agendar lote).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon list of ALL time-INPUT surfaces pasted**, each marked native-24h-confirmed or custom-12h-converted, with the mount sites of the custom picker.
- **Zero AM/PM anywhere, input widgets included:** paste BOTH grep passes returning zero AM/PM-rendering hits after the change —
  - `git grep -nE "AM|PM|meridiem|ampm|hourCycle: ?'h12'|hour12: ?true"` returns zero hits in display AND picker code (annotate any surviving hit that is an unrelated false positive, e.g. an identifier like "PARAM", and show it is not a meridiem path);
  - the input-construction pass shows no remaining `1..12` hour column feeding a meridiem column.
- **Screenshot-verifiable picker state:** paste a screenshot (or an equivalent DOM/test assertion) of the Nova marcação Hora picker showing a 24h column (`00`–`23`) and NO AM/PM column — replacing the QA `09 / 00 / AM-PM` screenshot.
- **Value round-trip test** proving no stored-value change. **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated at Wave 03 close (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report (both grep passes + full time-input surface list with native-vs-custom marks), migration-free `git diff --name-only origin/main`, post-change zero-AM/PM grep evidence (both passes), the picker component test (24h hours, no meridiem element), the value round-trip test, a screenshot of the converted Nova marcação picker, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-02-24h-picker-sweep` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change. Input UI only — do NOT change stored values or the DB (values stay UTC; the input still yields the same `HH:mm`).
- **24h everywhere, no AM/PM anywhere**; the sweep must cover input widgets, not only display. Europe/Lisbon display tz preserved. Do NOT regress any W3-08 display path.
- **Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`.** One migration may be in flight elsewhere; this loop opens none.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- pt-PT via i18n keys where copy is involved, no hardcoded strings, no emoji.
- If a `packages/ui` primitive is the custom picker, fixing it there IS in scope (it is a time-input primitive); but surface any change whose ripple extends BEYOND time input (Field 6).

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record the resume state in the report. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- Recon finds the custom picker is a THIRD-PARTY dependency whose 12h/AM-PM layout cannot be forced to 24h via props/config without forking or replacing the dependency — surface the options (config, wrapper, swap to native `<input type="time">`, replace the lib) and a recommended default.
- Converting the picker requires editing a shared `packages/ui` primitive whose change would ripple BEYOND time input (e.g. a generic column-scroller used for non-time pickers) — surface the blast radius.
- A time-input surface's format is driven by a locale/config that cannot be pinned to 24h without a broader i18n change — surface the tradeoff.
- The value semantics cannot be preserved across the 12h→24h conversion for some surface (a round-trip would change stored data) — STOP; this loop must not change stored values.

## Field 7. Report back
Recon report (both grep passes + complete time-input surface list), the picker conversion + mount-site sweep, post-change zero-AM/PM grep evidence, the picker + round-trip tests, the converted-picker screenshot, migration-free proof, e2e summary, suite counts, and the PR number.
Close: **open a PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge (this batch has no runner self-merge authority; classic stop-and-report). A refused or blocked merge is a HALT reported to Ivan.
