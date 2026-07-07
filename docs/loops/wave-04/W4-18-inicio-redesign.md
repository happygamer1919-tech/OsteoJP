# Loop W4-18 - Início: sixth quick action (Revisão Consulta) + full-width Resumo semanal + Próximas marcações card (redesign, recon-first, migration-free)

GATE: depends on **W4-13 merged** (consumes `docs/design/UI-STYLE.md` — this redesign conforms to it). UI lane, migration-free, functionality-preserving (adds one live card + one tile). Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Fill the dead space on the **Início** (dashboard) page and conform it to `docs/design/UI-STYLE.md` (W4-13): add a sixth quick-action tile, make **Resumo semanal** full-width, and add a **Próximas marcações** card.

Ground truth (locked mechanisms to embed — GREEN runs with ZERO memory; do not assume anything not written here):
- **The Início page is the dashboard** (`apps/web/app/dashboard/page.tsx` per STATE 2026-07-06) — it hosts the **quick-action tiles** (one of which is **Administração**), the **Resumo semanal** card, and the **Notas Rápidas** card (which persists to `quick_notes`, W2-11/STATE — **untouched by this loop**).
- **Revisão Consulta page exists** — the sixth tile links to the EXISTING Revisão Consulta surface (SPEC-v2-review; the consultation-review page). **This loop does NOT build that page — only a tile linking to it.**
- **`Próximas marcações` reads EXISTING data** — the next upcoming `appointments` for today (time, patient, therapist). Reuse an existing agenda/appointments read; **no new schema, no heavy new query if the data is already available** (recon confirms the cheapest existing read). Europe/Lisbon tz, 24h (CLAUDE.md).
- **Permission matrix (CLAUDE.md):** the dashboard is role-scoped server-side (Therapist sees own). The new card + tile do NOT relax any server-side scope; Próximas marcações respects the same scope as the agenda.

**Owner findings (2026-07-06):** **dead space to the right of the Administração quick action**, and **Resumo semanal leaves a large empty zone to its right**.

**Build:**
- **(a) A sixth quick-action tile to the right of Administração: `Revisão Consulta`** (owner default), **matching the existing tile anatomy** (per UI-STYLE.md), **linking to the existing Revisão Consulta page**.
- **(b) Extend `Resumo semanal` to use the full available width.**
- **(c) Fill the lower-right zone with one new card: `Próximas marcações`** (owner default) — the **next upcoming appointments for today** with **time, patient, therapist**, reading existing data, **migration-free**.

All UI copy is **pt-PT via i18n keys** (no hardcoded strings, no emoji). **Migration-free** (any proven schema need is a HALT). All build/verify work is **synthetic-data-only**; verify on the **E2E seed tenant**.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-18-inicio-redesign origin/main -b osteojp-w4-18-inicio-redesign`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-18-inicio-redesign`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE editing (paste paths):** the Início/dashboard page + the quick-actions grid (confirm Administração's tile anatomy + how many tiles today); the Revisão Consulta route the tile links to; the Resumo semanal card + its width container; the cheapest existing read for "today's upcoming appointments" (time/patient/therapist) that respects role scope; the dashboard Playwright specs that will move.
3. **(a) Sixth tile:** add the `Revisão Consulta` tile to the right of Administração, matching tile anatomy (UI-STYLE.md), linking to the existing page. No new page.
4. **(b) Full-width Resumo semanal:** widen the card to span the available width.
5. **(c) Próximas marcações card:** render the next upcoming appointments for today (time, patient, therapist) from the existing read, respecting role scope, per UI-STYLE.md.
6. **Regression check:** confirm the existing tiles (incl. Administração) + Notas Rápidas + Resumo semanal still work; the new card reads live and respects scope.
7. **Update the dashboard Playwright specs on-branch** (**never touch `db-tests.yml` or `e2e.yml`**). **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for: six tiles render + the Revisão Consulta tile navigates; Resumo semanal full width; Próximas marcações shows live data.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** dashboard page + quick-actions grid + Revisão Consulta route + Resumo semanal container + the today's-appointments read (respecting role scope) + the specs that move.
- **Six quick actions render**, the sixth being `Revisão Consulta` to the right of Administração and navigating to the existing page. Paste a screenshot/DOM assertion + the navigation test.
- **Resumo semanal spans the full width.** Paste a screenshot/DOM assertion replacing the empty-zone QA state.
- **Próximas marcações shows LIVE data** (time, patient, therapist) for today's upcoming appointments, verified against E2E seed tenant fixtures and respecting role scope. Paste the live-data test (PII-safe: assert structure/count, not a real name).
- **Notas Rápidas + existing tiles untouched:** state + assert no regression.
- **Conforms to `docs/design/UI-STYLE.md`** (W4-13): note which tile/card/token patterns were applied.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only origin/main`, the six-tile screenshot + Revisão Consulta navigation test, the full-width Resumo semanal screenshot, the Próximas marcações live-data test (PII-safe), the Notas-Rápidas-untouched assertion, the UI-STYLE conformance note, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-18-inicio-redesign` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change. Any proven schema need is a **HALT**. One migration may be in flight system-wide; this loop opens none.
- **Functionality-preserving:** the sixth tile only links to the EXISTING Revisão Consulta page (do not build that page); Próximas marcações reads EXISTING data respecting role scope; Notas Rápidas (`quick_notes`) + existing tiles untouched. No heavy new query if the today's-appointments data is already available.
- **Redesign WILL move Playwright selectors:** update the affected specs **on-branch**. **NEVER touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`.**
- **LIVE-DATA CAUTION:** verify on **synthetic fixtures on the E2E seed tenant**; the Próximas marcações test asserts structure/count, never a real patient name (CLAUDE.md rule 7). Never modify real therapist accounts, their `availability_templates`, or `therapist_services` on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`.
- **Conform to `docs/design/UI-STYLE.md`** (W4-13); refinement, not rebrand. Europe/Lisbon tz + 24h preserved.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- **pt-PT via i18n keys**, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record the resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- There is **no existing Revisão Consulta page** to link the sixth tile to (the owner default assumes it exists) — surface it; recommend a default (link to the nearest existing surface, or hold the tile) rather than building a new page in this loop.
- `Próximas marcações` would require a **new heavy query or a schema change** to read today's upcoming appointments respecting role scope — surface it; recommend the cheapest existing read or a reduced field set.
- Widening Resumo semanal or adding the tile/card requires editing a `packages/ui` primitive whose ripple extends beyond Início — surface the blast radius.

## Field 7. Report back
Recon report, the sixth `Revisão Consulta` tile + full-width Resumo semanal + Próximas marcações card, the six-tile + navigation + full-width + live-data tests, the Notas-Rápidas-untouched assertion, the UI-STYLE conformance note, migration-free proof, e2e summary, suite counts, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge (this batch has no runner self-merge authority; classic stop-and-report). A refused or blocked merge is a HALT reported to Ivan.
