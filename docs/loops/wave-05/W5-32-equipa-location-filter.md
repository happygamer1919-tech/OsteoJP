# Loop W5-32 - Equipa location filter (Wave 05 Ficha Final 2)

GATE: **Wave 05 Ficha Final 2 (FF2).** Presentation-only filter on the Administracao / Equipa list, reusing the Agenda location select. **Migration-free, no schema change.** Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

In **Administracao / Equipa**, add the **same location select component used in Agenda** (Todas as localizacoes / OsteoJP (CB) / OsteoJP (LV)) **immediately right of the existing search bar**; it filters the team rows by **assigned location**; defaults to **Todas as localizacoes**; **search and filter compose**.

Ground truth (recon at authoring 2026-07-12, embed - executor runs with ZERO memory):
- **Equipa page:** `apps/web/app/admin/staff/page.tsx`. It already has a search bar: `SearchBox` from `@/app/patients/_components/search-box`, a URL `?q=` param, and a server-side filter `matchesSearch(query, u.fullName, ROLE_LABEL[u.roleSlug])` over the SAME read (W5-02 Equipa search: presentation-only name/role filter). Placeholder key `admin.staff.searchPlaceholder`, empty-state key `admin.staff.searchEmpty`.
- **Agenda location select (reuse the same component/pattern):** `apps/web/app/agenda/agenda-view.tsx` renders a native `<select>` bound to `filters.locationId`, first option `s["agenda.allLocations"]` (value ""), then `options.locations.map(...)`, and navigates via a `location` URL param. Reuse this component/pattern: first option Todas as localizacoes; then the tenant locations (OsteoJP (CB), OsteoJP (LV), etc. - driven by the same `options.locations` source, not hardcoded).
- **Compose with search:** add a `?location=` URL param alongside `?q=`; the server read filters by BOTH `matchesSearch` (name/role) AND the selected location. Empty/Todas -> no location constraint. Both filters compose (an AND).
- **Assigned location of a team member:** recon how a staff/user row carries its location assignment (e.g. a `location`/`locationId` field or a staff-location mapping); filter the rows on that. If a member is assigned to multiple locations or none, define the match semantics in recon (recommend: a member matches if the selected location is among its assigned locations; unassigned members show only under Todas). Presentation-only; no data change.
- **Placement:** the location select sits in the same horizontal row, immediately RIGHT of the search bar (the W5-02 search row).
- **No schema change, no migration.** The location data already exists (Agenda uses it); this loop reads it.

**Scope:** add the Agenda location select right of the Equipa search bar (`?location=` URL param), server-filter the team rows by assigned location, default Todas as localizacoes, composing with the existing `?q=` search. Migration-free, presentation-only. pt-PT i18n (both files); reuse `agenda.allLocations`.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w5-32-equipa-location-filter origin/main -b osteojp-w5-32-equipa-location-filter`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** the Equipa search bar (`SearchBox` + `?q=` + `matchesSearch`); the Agenda location select component + its `options.locations` source; how a staff row carries its assigned location + the multi/none match semantics. Paste findings.
3. **Location select:** render the Agenda location select immediately right of the search bar, first option Todas as localizacoes (`agenda.allLocations`), then `options.locations`; bind to a `?location=` URL param; default Todas.
4. **Server filter compose:** the server read filters team rows by `matchesSearch(q, ...)` AND the selected location; Todas/empty -> no location constraint; both compose (AND).
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (default shows all/Todas; selecting OsteoJP (CB) shows only CB-assigned members; typing a name AND selecting a location composes to the intersection; clearing either widens correctly). Use scoped locators + exact-name matching in the E2E.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free + no-schema-change PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Recon report pasted:** search bar; Agenda select source; staff location assignment + match semantics.
- **Reuse PROOF:** the location select is the SAME Agenda component/pattern (Todas as localizacoes first, then `options.locations`), not a hardcoded location list. Paste it.
- **Default PROOF:** the filter defaults to Todas as localizacoes (all team members shown). Paste it.
- **Filter PROOF:** selecting a location shows only members assigned to it (per the recon-defined semantics). Paste it.
- **Compose PROOF:** search `?q=` AND `?location=` compose to the intersection; clearing one widens to the other alone. Paste it.
- **Placement PROOF:** the select renders immediately right of the search bar in the same row. Paste it (DOM/snapshot).
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report, the migration-free diff, the reuse proof, the default proof, the filter proof, the compose proof, the placement proof, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`.
- **Presentation-only.** No schema change, no migration; read the existing location data.
- **Reuse the Agenda location select** (same component/pattern + `options.locations` source); do NOT hardcode the location list.
- **Search + filter compose** (AND); Todas as localizacoes is the default and imposes no location constraint.
- **Server-side filter** over the SAME read the search uses (W5-02 precedent); the URL params (`?q=`, `?location=`) drive it.
- pt-PT i18n (both files), reuse `agenda.allLocations`, no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. SYNTHETIC-DATA-ONLY for verify.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- Recon finds staff rows carry NO location assignment at all (so filtering by assigned location is impossible without a schema change) - HALT to `docs/design/QUESTIONS.md` with the recommended default; do NOT open a migration to add a location assignment in this presentation-only loop.
- The Agenda location select cannot be reused without extracting a shared primitive that ripples beyond these two surfaces - surface the blast radius before touching shared UI.

## Field 7. Report back
Recon report, the migration-free diff, the reuse proof, the default proof, the filter proof, the compose proof, the placement proof, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12):** GREEN self-merge permitted once ALL required checks are green AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green. The cross-browser E2E lane is non-required and is ignored, never waited on. Live-apply verification evidence (W5-27 seed, W5-30 migration 0035) must be pasted in the loop report before merge regardless (not applicable to this presentation-only loop, which has no live-DB step). Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
