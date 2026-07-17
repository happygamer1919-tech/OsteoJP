# Loop W9-02 - Agenda location filter (Wave 09 Correcoes CB)

> **STATE 2026-07-17: executed with two owner-ruled amendments. Docs delta rides this loop's PR; the close-out YELLOW reconciles.**
>
> **AMENDMENT 1 - policy ruling (owner, 2026-07-17), the loop's central open question.**
> W9-01 (f) found the fix is expressible without a migration but surfaced a blocking policy
> question (Q-W9-01-2): only **3 of 18** active therapists have ANY `availability_templates`
> row, so a strict location filter narrows a specific-location view to almost nobody. GREEN
> recommended showing unassigned therapists everywhere. **The owner ruled otherwise, and the
> ruling governs:**
>
> > Filter therapists by assigned location. Therapists with no location assignment appear
> > ONLY under "Todas as localizacoes", never inside a specific location view. A thin CB list
> > short-term is accepted; owner data entry populates it.
>
> Encoded verbatim in `apps/web/lib/scheduling/therapist-location-filter.ts` and pinned by
> unit tests + E2E so a later loop cannot quietly reverse it. **Corroboration found at
> execution (not known at authoring): W5-32 already shipped this EXACT policy on the Equipa
> list** - `apps/web/app/admin/staff/page.tsx:55-57` reads "Members with no availability ...
> have an empty set - they match only under 'Todas as localizacoes'". The ruling therefore
> makes the agenda CONSISTENT with a Wave 05 behaviour rather than introducing a new one; the
> agenda was the surface still missing the predicate.
>
> **AMENDMENT 2 - scope correction from W9-01 (f): there are no therapist columns.** This
> loop's Field 1/Field 3 require the filter to restrict "the rendered agenda columns" /
> "rendered therapists". **That half is not satisfiable as written and was not built.** The
> grid renders DAY columns (`agenda-grid.tsx:245`, `dates.map`), not therapist columns; there
> is no therapist column axis in this design, and building one would be a redesign far
> outside a migration-free bug-fix loop. The satisfiable reading, delivered here: the
> **dropdown** narrows to the location's assigned therapists, and the **rendered
> appointments** are already location-filtered by `listAppointments`
> (`data.ts:137-139`, untouched). Zero LV therapists are reachable or rendered under a CB
> selection, which is CB QA item 1's actual requirement.
>
> **Composition decision (in scope per Field 1 "the location filter must interact correctly
> with the therapist filter"):** narrowing the dropdown made a new stale state reachable - a
> therapist held over from another location would be a filter ACTIVE in the URL but absent
> from its own Select, silently narrowing the grid to a therapist the user cannot see
> selected. Changing location therefore CLEARS the therapist filter
> (`agenda-view.tsx`, location `onChange`). No-op for the therapist role (`navigate()` never
> sets the param under `lockTherapist`). Covered by E2E.
>
> **Deliberately NOT done (scope):** `marcacoes` (`page.tsx:97`) and `estatisticas/painel`
> (`page.tsx:40`) both hold a `locationId` and both call `getAgendaOptions(actor)` without
> it, so they retain the pre-W9-02 behaviour and still list every therapist. `getAgendaOptions`
> gained an OPTIONAL `locationId`, so both are a one-line change when the owner wants them.
> They were left alone because QA item 1 and this loop's scope are the agenda, and narrowing a
> KPI panel's therapist filter is a product decision, not a bug fix. Recorded as a follow-up
> candidate rather than self-authorized.
>
> **Semantics lock (from W9-01 (f)'s drift warning):** `listTherapistLocationAssignments`
> uses a WHERE clause IDENTICAL to `getTherapistLocationIds` (active availability row AND
> active location; NO `valid_from`/`valid_until` window check). If the agenda honoured the
> validity window while the W4-12 booking auto-fill did not, the two surfaces would disagree
> about what "assigned" means. Keep them in lock-step.
>
> **Live-data note (Q-W9-01-3, owner verifying):** `OsteoJP (LV)` is `is_active = false` in
> the cloud, so the agenda location dropdown currently offers only CB. The E2E uses seeded
> fixtures and does not depend on that state.

GATE: **Wave 09 Correcoes CB, migration-free, BUG FIX.** Selecting a location in the agenda must restrict both the therapist dropdown and the rendered therapists to that location. **Consumes W9-01 finding (f).** Runs AFTER W9-01 merged and `origin/main` fast-forwarded. Starts from **fresh `origin/main`**; never stacked. **GREEN self-merge** (migration-free).

## Field 1. Scope and ground truth

Fix item 1 of the CB QA (`docs/qa/2026-07-16-castelo-branco-qa.md`): the agenda location filter shows Linda-a-Velha (LV) therapists when OsteoJP Castelo Branco (CB) is selected. After the fix, choosing a location restricts the therapist dropdown AND the rendered agenda columns to therapists assigned to that location; choosing CB shows zero LV therapists.

Ground truth (recon at authoring 2026-07-16, embed - executor runs with ZERO memory; W9-01 finding (f) is the authoritative root cause, this is the starting map):
- **Agenda surface `apps/web/app/agenda/`.** The toolbar filters `Todos os terapeutas` + `Todas as localizacoes` shipped in W4-17 (agenda header redesign, #499). The six-day Mon-Sat + 24h grid (W3-08) and the live appointment count for the visible range (W4-17) are UNCHANGED by this loop.
- **Therapist-to-location is derived from `availability_templates (user_id, location_id)`** (both NOT NULL). There is no dedicated `user_locations` table (STATE 2026-06-30). W4-12 added `getTherapistLocationIds` + `pickAutoFillLocation` for BOOKING location auto-fill; the same derivation ("a therapist is at location L if an active `availability_templates` row ties them to L") is the correct predicate for the agenda filter. A therapist with hours only at LV must NOT appear when CB is selected.
- **The leak (item 1)** is that selecting CB does not exclude LV therapists from the dropdown and/or the rendered columns. W9-01 (f) states the exact query/predicate at fault; the fix scopes the therapist list to the selected location's therapist set.
- **Standing:** the location filter must interact correctly with the therapist filter (pick a location, the therapist dropdown narrows to that location's therapists; `Todas as localizacoes` restores all). Secondary participants (W4-19) render under the primary therapist column only - unchanged. Blocked-time rendering is W9-04 (do not build it here).

**Scope:** the agenda location filter restricts the therapist dropdown + the rendered therapists to the selected location, derived from `availability_templates` location assignment; `Todas as localizacoes` shows all. Migration-free, display/query layer. Zero change to the grid, the day/week toggle, the appointment count, or the booking flow.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W9-01's merge; `git worktree add ../osteojp-w9-02-agenda-location-filter origin/main -b osteojp-w9-02-agenda-location-filter`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Consume W9-01 (f):** read `docs/recon/W9-01-findings.md` section (f); confirm the faulting predicate; paste the citation.
3. **Fix the filter:** scope the therapist dropdown AND the rendered therapist set to the selected location using the `availability_templates`-derived assignment (reuse `getTherapistLocationIds` or the equivalent existing derivation; do not invent a new location model). `Todas as localizacoes` restores the full set.
4. **Tests:** a unit/component test that a CB selection yields zero LV therapists and vice versa; a test that `Todas as localizacoes` restores all; the therapist filter composes with the location filter. **E2E:** select CB in the agenda, assert zero LV therapists render (dropdown + columns), on disposable fixtures.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`. JSON.parse both i18n files. Confirm `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Filter PROOF:** selecting CB shows zero LV therapists in the dropdown AND the rendered columns; selecting LV shows zero CB therapists; `Todas as localizacoes` shows all. Paste the unit + E2E assertions.
- **No-regression PROOF:** the grid (6-day + 24h), the appointment count, and the day/week toggle are unchanged (cite the untouched files / passing existing tests).
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The W9-01 (f) citation, the migration-free diff, the filter unit + E2E assertions, the no-regression note, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W9-01). **Migration-free:** if a schema change surfaces, HALT (do not add a migration here).
- **Reuse the existing `availability_templates`-derived location assignment**; do not create a `user_locations` table or a new location model.
- **Display/query layer only.** No change to the grid, day/week toggle, appointment count, booking, or secondary-participant rendering. Blocked time is W9-04, not here.
- pt-PT i18n (both files, JSON.parse both); no emoji; UI-STYLE.md + 55/25/20 equity. DB access only through `packages/db`. Audit not applicable (read/filter only). **Never force-push / `--admin`.** Plain hyphens only. **SYNTHETIC-DATA-ONLY for verify.**
- **Standing test-data rule (Wave 09):** never run destructive QA against **Maria Joao Silva** (`triboimax635+maria@gmail.com`); disposable test patients only; reference therapist **Tiago Reis**.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W9-01's merge.
- Scoping therapists to a location cleanly requires a schema change (e.g. `availability_templates` cannot express the assignment for a real case) - HALT (do not add a migration here; convert to a follow-up).
- W9-01 (f) contradicts this loop's starting map in a way that changes scope - HALT with the finding.

## Field 7. Report back
The W9-01 (f) citation, the migration-free diff, the filter + no-regression tests, the E2E, suite counts, PR number.

## Merge policy (embed, Wave 09 Correcoes CB)
- **W9-02 is GREEN self-merge (migration-free).** GREEN self-merge once ALL required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API NOT the banner. If a migration surfaces, HALT and convert to an OWNER-MERGE follow-up.
- **Runs after W9-01 merged**, fresh `origin/main`, never stacked. Workflow files NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/data/reality mismatch.
