# Loop W6-01b - BUG: service dropdowns must be data-driven, not hardcoded (Wave 06 Melhorias)

GATE: **Wave 06 Melhorias, BUG loop.** The Marcacoes service filter shows a **hardcoded** list that does not match the tenant's real services. Fix: every service dropdown platform-wide is data-driven from the tenant `services` table. **Migration-free, no schema change.** Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

The Marcacoes service filter currently offers a hardcoded set (Massagem Relaxamento, Drenagem Linfatica, Massagem Desportiva, Outros servicos) that does NOT match the tenant services shown in **Administracao > Servicos** (1a Avaliacao, Fisioterapia, Massagem Terapeutica, NESA, Osteopatia, Pilates Terapeutico). Make ALL service dropdown options data-driven from the tenant services table, and sweep every service dropdown platform-wide.

Ground truth (recon at authoring 2026-07-14, embed - executor runs with ZERO memory):
- **The hardcoded source:** service categories are a fixed 5-entry accent/label map, NOT the services table:
  - `apps/web/app/marcacoes/marcacoes-view.tsx` - `SERVICE_ORDER` / `SERVICE_TINT` / `SERVICE_LABEL` (`ServiceAccent = green|lavender|gold|blue|burgundy`) mapping to i18n keys `agenda.serviceMassagemTerapeutica`, `agenda.serviceMassagemRelaxamento`, `agenda.serviceDrenagemLinfatica`, `agenda.serviceMassagemDesportiva`, `agenda.serviceOsteopatia`, plus `agenda.serviceOther` ("Outros servicos"); `serviceAccent(name)` matches a service NAME (accent/case-insensitive) to a colour category.
  - `apps/web/app/agenda/agenda-grid.tsx` - the same `SERVICE_TINT` / `SERVICE_LABEL` accent set + the `agenda.serviceOther` legend entry (already flagged to Ivan in a prior PR ASSUMPTION block).
  - i18n keys live at `packages/i18n/src/strings.pt.json` / `strings.en.json` lines ~943-947.
- **The tenant services read (the correct source):** `apps/web/lib/admin/services.ts` -> `listServices(actor: RequestContext): Promise<ServiceView[]>` (each row has `id`, name, `isActive`, ...). Precedent consumers: `apps/web/app/admin/services/page.tsx` (full list) and `apps/web/app/admin/staff/page.tsx:43` (`(await listServices(actor)).filter((svc) => svc.isActive)` for active-only). Scheduling reads services via `apps/web/lib/scheduling/data.ts` (`.from(services)`), and appointment creation uses `apps/web/app/agenda/appointment-drawer.tsx` (service select in the create/edit form).
- **The colour-category concern (do NOT lose it):** the accent tinting (SPEC-v2-marcacoes 2.1 / SPEC-v2-agenda 2.1) is a presentation nicety keyed off service NAME. Making options data-driven must NOT drop the tint behaviour; recon defines how a data-driven service maps to an accent (recommend: keep `serviceAccent(name)` as the name->tint mapping for the KNOWN colour-coded names, and render any other service with the neutral "Outros servicos" tint - the tint set stays a fixed palette, but the dropdown OPTIONS come from the DB). The tint palette is presentation only; the OPTION LIST is the bug.
- **Owner ruling on which services appear where:**
  - **Filter dropdowns** (Marcacoes filter, Agenda filters, Faturacao/Invoicing filters) INCLUDE **inactive** services, because historic marcacoes reference them (e.g. NESA). Use the full `listServices(actor)` (no `isActive` filter) for filters.
  - **Appointment CREATION dropdowns** (the new-appointment / appointment-drawer service select, batch creation) show **active** services only (`.filter((svc) => svc.isActive)`, the `admin/staff` precedent).
- **Surfaces to sweep (recon confirms the full set):** Marcacoes service filter (`marcacoes-view.tsx`), Agenda filters (`agenda-view.tsx` / `agenda-grid.tsx`), Faturacao/Invoicing filters (`apps/web/app/invoicing/invoicing-view.tsx`), appointment creation forms (`apps/web/app/agenda/appointment-drawer.tsx`, plus any batch-create surface). Recon must grep for EVERY service `<select>` / option list and list them before editing.
- **No schema change, no migration.** The services data already exists; this loop reads it.

**Scope:** replace every hardcoded service dropdown option list with a data-driven list from `listServices(actor)`; filters include inactive, creation shows active-only; preserve the accent-tint presentation; sweep all service dropdowns (Marcacoes, Agenda, Faturacao, appointment creation). Regression test asserts options come from the DB, not a static array. Migration-free, presentation/data-source only. pt-PT i18n (both files); service NAMES come from the DB, not i18n (the `agenda.service*` label keys become tint-lookup only, not the option source).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w6-01b-service-filters origin/main -b osteojp-w6-01b-service-filters`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** grep and list EVERY service dropdown/option list across staff surfaces (filter vs creation); confirm `listServices(actor)` shape + the active-only filter precedent; confirm how the accent tint maps off name and how to preserve it with DB-sourced options. Paste findings including the full surface inventory.
3. **Data source swap:** each dropdown builds its options from `listServices(actor)` - filters use the full list (inactive included), creation forms use `.filter((svc) => svc.isActive)`. Keep the accent tint via the existing name->accent mapping (unknown names -> neutral). Do not hardcode any service name in an option list.
4. **Sweep all surfaces** enumerated in recon; none may keep a static option array.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. the new regression test), `pnpm build`, `pnpm test:e2e` (the Marcacoes filter lists the tenant's real services incl. inactive like NESA; a creation form lists active services only; filtering by a DB service narrows correctly; tint still renders). JSON.parse both i18n files in the gate.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free + no-schema-change PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`, and ZERO schema/seed edits. Paste it.
- **Surface inventory pasted:** every service dropdown found, tagged filter vs creation, each shown converted to `listServices`.
- **Data-driven PROOF:** a regression test asserts the dropdown options are the `listServices(actor)` rows (DB-sourced), NOT a static array; adding/deactivating a service changes the options (filters keep inactive, creation drops it). Paste the test.
- **Filter-vs-creation PROOF:** filters include an inactive service (e.g. NESA); creation forms exclude it. Paste it.
- **Tint-preserved PROOF:** the accent tinting still renders for colour-coded services and neutral for others. Paste it (DOM/snapshot).
- **No-hardcoded-list PROOF:** grep shows no remaining static service-name option array in any swept surface. Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon surface inventory, the migration-free diff, the data-driven regression test, the filter-vs-creation proof, the tint-preserved proof, the no-hardcoded-list grep, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`.
- **Presentation / data-source only.** No schema change, no migration, no seed edit; read the existing `services` data via `listServices`.
- **Filters include inactive services; creation dropdowns show active only** (owner ruling). Do NOT drop inactive services from filters (historic marcacoes reference them).
- **Preserve the accent-tint presentation;** the tint palette stays fixed, only the OPTION LIST becomes data-driven. Do not hardcode any service name in an option list.
- **Server-side reads** through `listServices(actor)` (RequestContext); DB access only through `packages/db`.
- pt-PT i18n (both files, keep-both on rebase, JSON.parse both in the gate); service names come from the DB not i18n; no emoji; UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. SYNTHETIC-DATA-ONLY for verify.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- A service dropdown cannot be made data-driven without a schema change or a migration (e.g. no query path exposes services to that surface) - HALT with findings; this loop is migration-free.
- Making options data-driven would break the accent-tint contract in a way that needs a design ruling (e.g. more services than the fixed palette and the owner wants unique tints per service) - log to `docs/design/QUESTIONS.md` with a recommended default (neutral tint for non-colour-coded services) and proceed on the default only if unblocked; otherwise surface.
- The filter-vs-creation active/inactive split conflicts with an existing consumer's assumption (a surface that must NOT show inactive) - surface the blast radius before changing shared reads.

## Field 7. Report back
Recon surface inventory, the migration-free diff, the data-driven regression test, the filter-vs-creation proof, the tint-preserved proof, the no-hardcoded-list grep, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12, standing for Wave 06):** GREEN self-merge permitted once ALL required checks are green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API, never the banner. The cross-browser lane no longer exists. This loop is migration-free -> GREEN self-merge. Workflow files are never touched. Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
