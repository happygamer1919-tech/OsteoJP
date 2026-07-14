# Loop W6-05 - Estatisticas (owner-only KPIs) (Wave 06 Melhorias)

GATE: **Wave 06 Melhorias.** New "Estatisticas" nav section visible and accessible ONLY to the **Proprietario (owner)** role, enforced route-level AND query-level (not just nav hiding). MVP revenue + volume KPIs over existing Faturacao + marcacoes data. **Migration-free expected** (aggregate queries only). Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Add an **Estatisticas** section (nav + route) that only the owner can see and reach. It shows revenue and volume KPIs computed from existing invoicing (Faturacao) and appointment (marcacoes) data, with filters and breakdowns and at least one polished chart. No new data capture this wave.

Ground truth (recon at authoring 2026-07-14, embed - executor runs with ZERO memory):
- **The owner role:** `packages/auth/permissions.ts` defines `ROLES = ["owner", "admin", "therapist", "reception"]`; `owner` is the Proprietario and holds ALL capabilities (`PERMISSIONS.owner = ALL_CAPABILITIES`). `can(role, capability)` is the gate helper; `parseRole` validates the JWT `user_role` claim (fail-closed). There is **no statistics capability today** - the executor may add an owner-only capability (e.g. `statistics:read`, granted to `owner` only) in `packages/auth/permissions.ts` (application code, allowed), OR gate directly on `role === "owner"`; either way enforcement is server-side, not nav-only.
- **Route enforcement:** admin routes gate via the request context (`apps/web/lib/auth/context.ts` -> `requireRequestContext()` / `runScoped`, `RequestContext` carries the actor role). The Estatisticas route guard rejects any non-owner (redirect/403) BEFORE rendering. Recon the exact admin-route guard precedent (`apps/web/app/admin/**`) and reuse it, tightened to owner-only.
- **Query/data enforcement (defense in depth):** the KPI data function(s) assert the actor is owner before running any aggregate; a non-owner actor gets a hard refusal, never data. Underlying tables (invoices, appointments/analytics_events) are already tenant-isolated by RLS (CLAUDE.md rules 1-2); RLS is tenant-scoped, so the OWNER-only restriction is enforced at the route + server-query layer (the briefing's "RLS/query-level" beyond nav). If the executor concludes owner-only truly needs a role-scoped RLS policy (a migration), that is a HALT (Field 6) - do not add a migration in this loop.
- **KPI data sources (existing, read-only):**
  - **Revenue:** invoicing lives at `apps/web/app/invoicing/` (`invoicing-view.tsx`, `page.tsx`); money is integer cents with a currency column (CLAUDE.md), VAT gross=final (CIVA art. 9 exemption, DECISIONS 2026-07-02). Recon the invoice read + the amount/therapist/location/service/date columns.
  - **Volume + KPIs:** `analytics_events` (migration 0025, greenfield append-only KPI feed) promotes KPI dimensions to real indexed columns (`therapist_user_id`, `patient_id`, `service_id`, `location_id`, `actor_user_id`, `amount_cents_gross`, `currency`, `occurred_at`, `event_type`) per DECISIONS 2026-07-01 - this is the intended KPI source. Appointments (`appointments`) provide counts/utilization. Recon which source best serves each KPI (prefer `analytics_events` where it already carries the dimension).
- **MVP scope (verbatim, do not expand):** revenue and volume KPIs; **filters** by date range, therapist, location, service; **breakdowns** of revenue per therapist, per location, per service, per period; appointment counts and time utilization; **at least one polished chart area** (owner wants visual quality). May enrich with sensible clinic-KPI references but **nothing requiring new data capture this wave**.
- **Charting:** recon the existing chart/deps in the stack before adding anything; prefer an existing dependency. If a new charting vendor/library is required, that is a new dependency -> owner-confirmable (CLAUDE.md); log to QUESTIONS with a recommended default rather than adding it silently.
- **Migration-free expected:** aggregate SELECTs over existing tables; no new table, no new column.

**Scope:** an owner-only Estatisticas nav + route (route-level + query-level enforcement, not nav-only); MVP revenue + volume KPIs from invoicing + marcacoes/analytics_events; filters (date range, therapist, location, service); breakdowns (revenue per therapist/location/service/period; appointment counts + time utilization); at least one polished chart. Migration-free (aggregate queries). pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w6-05-estatisticas origin/main -b osteojp-w6-05-estatisticas`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** the owner role + `can()` gate; the admin-route guard precedent (to tighten to owner-only); `analytics_events` columns + the invoicing read for revenue; the appointments source for counts/utilization; existing charting deps. Decide capability-vs-role-check and record it. Paste findings.
3. **Enforcement:** owner-only route guard (reject non-owner before render) + owner assertion in every KPI data function (defense in depth). Nav item visible only to owner.
4. **KPIs:** revenue + volume aggregates with the four filters; breakdowns per therapist/location/service/period; appointment counts + time utilization; at least one polished chart. Money as integer cents, pt-PT formatting, Europe/Lisbon dates.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation + a gate test that admin/therapist/reception get 403 at the route AND a hard refusal from the KPI data function), `pnpm build`, `pnpm test:e2e` (owner sees Estatisticas and the KPIs/chart; a non-owner cannot see the nav item and is refused at the route even by direct URL; filters + breakdowns compute over synthetic data). JSON.parse both i18n files in the gate.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`, and ZERO schema/seed edits. Paste it.
- **Recon report pasted:** owner gate + route precedent; KPI sources (analytics_events + invoicing + appointments); charting dep decision.
- **Owner-only route PROOF:** a non-owner hitting the Estatisticas URL directly is refused (redirect/403), not just missing the nav item. Paste it.
- **Owner-only query PROOF:** the KPI data function refuses a non-owner actor (hard refusal, no data). Paste the test.
- **Nav-visibility PROOF:** the Estatisticas nav item shows for owner only. Paste it.
- **KPI PROOF:** revenue + volume with the four filters; breakdowns per therapist/location/service/period; appointment counts + time utilization; over synthetic data with correct pt-PT money (cents) + dates. Paste representative outputs.
- **Chart PROOF:** at least one polished chart renders from the KPI data. Paste it.
- **No-new-vendor PROOF (or QUESTIONS entry):** either charting reused an existing dep, or a new dep was logged to QUESTIONS as owner-confirmable and NOT silently added. State which.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report, the migration-free diff, the owner-only route + query proofs, the nav-visibility proof, the KPI outputs, the chart proof, the charting-dep disposition, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`.
- **Owner-only, enforced route-level AND query-level** (server-side), never nav-hiding alone. The owner role slug is `owner`.
- **MVP scope only** (the verbatim list above). No new data capture this wave; may reference sensible clinic KPIs but build nothing that needs new capture.
- **Migration-free** (aggregate SELECTs over existing tables). If owner-only appears to need a role-scoped RLS policy or a new column/table, HALT (do not add a migration here).
- **No new vendor without owner sign-off** (CLAUDE.md): if charting needs a new library, log to `docs/design/QUESTIONS.md` with a recommended default; do not add it silently.
- **Money is integer cents + currency column;** pt-PT formatting; dates Europe/Lisbon for display, UTC in DB. DB access only through `packages/db`; read-only aggregates.
- pt-PT i18n (both files, keep-both on rebase, JSON.parse both in the gate); no emoji; UI-STYLE.md; AA. **Never force-push / `--admin`.** Plain hyphens only. SYNTHETIC-DATA-ONLY for verify.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- Owner-only enforcement genuinely requires a role-scoped RLS policy or any schema change (a migration) - HALT with the finding; this loop is migration-free.
- A KPI in the MVP list cannot be computed from existing data without new capture - HALT with the finding and a recommended default (ship the computable KPIs, log the gap); do NOT add data capture this wave.
- Charting requires a NEW third-party dependency/vendor - log to QUESTIONS (owner-confirmable) with a recommended default; do not add it silently.

## Field 7. Report back
Recon report, the migration-free diff, the owner-only route + query proofs, the nav-visibility proof, the KPI outputs, the chart proof, the charting-dep disposition, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12, standing for Wave 06):** GREEN self-merge permitted once ALL required checks are green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API, never the banner. The cross-browser lane no longer exists. This loop is migration-free -> GREEN self-merge; if owner-only forced a migration it HALTED instead. Workflow files are never touched. Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
