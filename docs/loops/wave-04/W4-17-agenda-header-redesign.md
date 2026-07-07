# Loop W4-17 - Agenda header: unified toolbar (segmented Dia/Semana, date nav, filters) + range chip with live appointment count (redesign, recon-first, migration-free)

GATE: depends on **W4-13 merged** (consumes `docs/design/UI-STYLE.md` — this redesign conforms to it). UI lane, migration-free, functionality-preserving (adds a live count). Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Restructure the **Agenda** header into one coherent toolbar conforming to `docs/design/UI-STYLE.md` (W4-13), and replace the loose week-range text with a structured range chip carrying one piece of live context.

Ground truth (locked mechanisms to embed — GREEN runs with ZERO memory; do not assume anything not written here):
- **W3-08 (#475) agenda structure — UNTOUCHED:** the week view is **6 days, Mon–Sat** (`WEEK_DAYS` = 6, propagated to grid + fetch range), and time is **24h app-wide** (`formatTimeOfDay` + pt-PT `Intl`, no meridiem). **This loop does NOT change the 6-day week or the 24h grid** — only the header chrome above it.
- **Existing header controls (ALL must keep working):** the **Dia / Semana** view toggle; the **date picker**; **Hoje** (today); **prev / next** navigation; the **Todos os terapeutas** (all-therapists) filter; the **Todas as localizações** (all-locations) filter. The **week-range text** (e.g. `6 a 11 de julho de 2026`) currently floats loose next to the date picker.
- **Range dates + counts come from the EXISTING agenda reads** — the visible-range appointments are already fetched for the grid; the live count reuses that data (no new query if avoidable; recon confirms). Europe/Lisbon display tz (CLAUDE.md).
- **Filters are functionally unchanged** — only their placement moves into the toolbar row; the filtering logic and server scope are untouched.

**Owner findings (2026-07-06):** the **Dia/Semana toggle is visually weak**, and the **week-range text floats loose** next to the date picker.

**Build:**
- **(a) One coherent toolbar** per UI-STYLE.md: a **prominent segmented Dia/Semana control**, the **date picker**, **Hoje**, and **prev/next** grouped together.
- **(b) Replace the floating week-range text** with a **structured element** — a **date-range chip or subtitle integrated into the toolbar** — and **add one piece of useful context to it. Recommended default: the appointment count for the visible range, LIVE** (updates with navigation + filters).
- **(c) Align the `Todos os terapeutas` and `Todas as localizações` filters into the same toolbar row.**

The **six-day Mon–Sat week view (W3-08) is untouched.** All UI copy is **pt-PT via i18n keys** (no hardcoded strings, no emoji). **Migration-free** (any proven schema need is a HALT). All build/verify work is **synthetic-data-only**; verify on the **E2E seed tenant**.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-17-agenda-header-redesign origin/main -b osteojp-w4-17-agenda-header-redesign`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-17-agenda-header-redesign`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE editing (paste paths):** the Agenda route + header component; each control (Dia/Semana toggle, date picker, Hoje, prev/next, the two filters) + its handler; where the week-range string is built; the visible-range appointments read that feeds the grid (the source for the live count); confirm the W3-08 6-day/24h grid so the redesign leaves it intact; the Agenda Playwright specs that will move.
3. **(a) Toolbar:** build the unified toolbar — segmented Dia/Semana, date picker, Hoje, prev/next grouped — per UI-STYLE.md. Each control wires to its EXISTING handler.
4. **(b) Range chip + live count:** replace the floating range text with a structured chip/subtitle showing the range AND the live appointment count for the visible range (reuse the grid's fetched data; recompute on navigation + filter change).
5. **(c) Filters into the toolbar row:** move `Todos os terapeutas` + `Todas as localizações` into the toolbar; filtering logic unchanged.
6. **Regression check:** confirm both **Dia** and **Semana** modes render; prev/next/Hoje/date-picker navigate correctly; both filters still filter; the 6-day Mon–Sat week (W3-08) is intact; the count matches the visible range under each filter.
7. **Update the Agenda Playwright specs on-branch** (**never touch `db-tests.yml` or `e2e.yml`**). **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for: switch Dia↔Semana, navigate prev/next + Hoje, apply each filter, and assert the range chip's live count.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** header component + each control's handler + the week-range builder + the visible-range read (count source) + confirmation the W3-08 grid is untouched + the specs that move.
- **New header renders in BOTH Dia and Semana modes:** paste screenshots/DOM assertions of each replacing the loose-text QA state.
- **Filters + navigation regress ZERO:** Dia/Semana toggle, date picker, Hoje, prev/next, both filters all work. Paste the navigation + filter tests.
- **Range chip shows the correct LIVE count** for the visible range, updating with navigation + filters. Paste the count test (correct under at least one therapist filter and one location filter).
- **W3-08 six-day Mon–Sat + 24h grid untouched:** state + assert the week still renders 6 columns Mon–Sat with 24h labels.
- **Conforms to `docs/design/UI-STYLE.md`** (W4-13): note which toolbar/chip/badge/token patterns were applied.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only origin/main`, Dia + Semana header screenshots, the navigation + filter regression tests, the live-count test (under filters), the W3-08-grid-intact assertion, the UI-STYLE conformance note, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-17-agenda-header-redesign` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change. Any proven schema need is a **HALT**. One migration may be in flight system-wide; this loop opens none.
- **Functionality-preserving:** every control keeps its behavior + server scope; filters' logic unchanged (only placement moves). The **W3-08 6-day Mon–Sat week + 24h grid is UNTOUCHED**. The live count reuses the grid's data — do not add a heavy new query if the visible-range data is already fetched.
- **Redesign WILL move Playwright selectors:** update the affected specs **on-branch**. **NEVER touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`.**
- **LIVE-DATA CAUTION:** verify on the **E2E seed tenant** with synthetic appointments. Never modify real therapist accounts, their `availability_templates`, or `therapist_services` on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`.
- **Conform to `docs/design/UI-STYLE.md`** (W4-13); refinement, not rebrand. Europe/Lisbon display tz + 24h preserved.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- **pt-PT via i18n keys**, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record the resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- The live appointment count would require a **new heavy query** the visible-range read does not already provide — surface it; recommend deriving from existing data or dropping the count to a cheaper metric before adding a query.
- Reorganizing the header into a toolbar cannot be done without touching the W3-08 grid/fetch-range code (risking the 6-day week) — STOP; the grid is out of scope.
- A control's handler cannot be rewired into the toolbar without a behavior change — surface it; keep the handler and adapt only the container.
- The redesign would require editing a `packages/ui` primitive whose ripple extends beyond Agenda — surface the blast radius.

## Field 7. Report back
Recon report, the unified toolbar + range chip with live count + relocated filters, the Dia/Semana screenshots, the navigation/filter regression + live-count tests, the W3-08-grid-intact assertion, the UI-STYLE conformance note, migration-free proof, e2e summary, suite counts, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge (this batch has no runner self-merge authority; classic stop-and-report). A refused or blocked merge is a HALT reported to Ivan.
