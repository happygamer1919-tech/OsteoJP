# Loop W10-04 - Isolation enforcement (Wave 10 Dados Reais e Isolamento)

GATE: **Wave 10 Dados Reais e Isolamento, IMPLEMENTATION, CONDITIONAL merge, SECURITY-SENSITIVE.** Implements the owner-APPROVED W10-03 isolation matrix: server-side scoping on every surface, capability checks, therapist-role selector removal, and mandatory NEGATIVE E2E isolation tests. **Consumes the approved `docs/design/SPEC-isolation.md` matrix.** Runs AFTER W10-03 is merged AND the owner has approved the matrix, and `origin/main` fast-forwarded. Starts from **fresh `origin/main`**; never stacked.

**Conditional merge (resolved by the approved matrix):**
- **If the matrix needs NO schema** (scoping is expressible with the existing model - e.g. derive "their patients" from `appointments.practitioner_id`, gate the location selector, add per-surface query scoping): this loop is **migration-free, GREEN self-merge**.
- **If the matrix requires SCHEMA** (a new role/capability column, an explicit patient-assignment column, or per-therapist RLS rows/policies): this loop is **migration-gated -> OWNER-MERGE**, with a single migration (both migration dirs + snapshot), RLS/isolation coverage in the same PR, and manual `drizzle-kit` apply verified LIVE before DONE. One migration in flight; head is `0037`, so the next number is `0038` (fetch + list both dirs to confirm).

## Field 1. Scope and ground truth

Implement EXACTLY the owner-approved isolation matrix from `docs/design/SPEC-isolation.md`: a therapist sees only themselves, their own patients, and their own location, with no location or therapist switching; owner and admin keep cross-visibility; reception per the approved matrix. Enforcement is SERVER-SIDE FIRST; the UI change follows the server truth. Negative E2E tests proving a therapist cannot read another therapist's patients or another location's agenda are MANDATORY.

Ground truth (recon at authoring 2026-07-20, embed - the approved matrix is AUTHORITATIVE; this is the starting map of what exists to change, executor runs with ZERO memory; all file:line refs verified read-only at authoring):

- **The approved matrix (from W10-03) governs.** If any instruction here conflicts with the owner-approved matrix, the matrix wins; do not widen beyond it.
- **Capability grid is data (`packages/auth/permissions.ts:89-154`);** enforce with `assertCan(ctx.role, cap)` (`guard.ts:27`). The isolation layer is a DATA-SCOPE layer on top of the grid, not a new capability set (unless the matrix explicitly adds a capability).
- **Therapist self-scope exists ONLY for appointments today:** `lockTherapist` forces `practitionerId = actor.userId` on the agenda (`apps/web/app/agenda/page.tsx:58`) and marcacoes (`apps/web/app/marcacoes/page.tsx:94`) into `listAppointments` (`apps/web/lib/scheduling/data.ts:144-164`). **Patients list, patient detail, and clinical records are NOT therapist-scoped** (`apps/web/lib/patients/queries.ts:100-152` tenant-only; clinical_records RLS grants therapist read tenant-wide with the standing TODO `0001_rls.sql:175-176`). This loop extends scoping to those surfaces per the matrix.
- **"Their patients" derivation:** no assignment column exists (`schema.ts:431-490`). Per the approved matrix, derive "their patients" as the matrix defines it (default candidate: patients with an appointment where `practitioner_id = actor.userId`, index `appointments_practitioner_start_idx` `schema.ts:609`; secondary `practitioner_2_id` if the matrix counts co-treatment). If the matrix instead mandates an explicit assignment column, that is the migration-gated path.
- **Location scoping** reuses the `availability_templates` derivation (`getTherapistLocationIds`/`listTherapistLocationAssignments`, `apps/web/lib/scheduling/therapist-locations.ts`) - do not invent a `therapist_locations` table unless the matrix mandates one (migration-gated).
- **Selectors (`apps/web/app/agenda/agenda-view.tsx`):** the therapist selector (`:194`) is already gated by `{!lockTherapist}`; the location selector (`:210-231`) is NOT gated. This loop gates the location selector for the therapist role too, so the therapist loses BOTH selectors entirely. Same `lockTherapist` prop in marcacoes (`marcacoes-view.tsx:415`).
- **RLS posture (`0001_rls.sql`):** fail-closed, tenant-keyed on `jwt_tenant_id()`; per-therapist RLS is net-new (only `quick_notes_own_row` uses `auth.uid()`, `0018:44-48`). **Server-side query scoping is the primary enforcement; RLS is defense-in-depth (CLAUDE.md rule 2, "server-side check in every API route + RLS as defense-in-depth"). Never RELAX or widen an existing RLS policy** - the isolation layer only narrows. `tenant_id` stays JWT-only.
- **Standing (post W10-02):** ALL E2E + verification runs on **local `127.0.0.1` Supabase with SYNTHETIC data** - the cloud is real-data-only after W10-02, and creating synthetic records on the cloud is a violation. Disposable test therapists + patients only; never Maria Joao Silva (retired).

**Scope:** server-side scoping on every surface the matrix marks `own-only`/`location` for the therapist role (agenda, marcacoes, patients list, patient detail, fichas, plus any other the matrix lists), the capability checks the matrix requires, the therapist-role removal of the location + therapist selectors, and NEGATIVE E2E isolation tests (a therapist account cannot read another therapist's patients or another location's agenda). Migration disposition is set by the approved matrix (see the conditional header).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W10-03's merge AND the owner has approved the matrix; `git worktree add ../osteojp-w10-04-isolation-enforcement origin/main -b osteojp-w10-04-isolation-enforcement`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Consume the approved matrix:** read `docs/design/SPEC-isolation.md`; restate the per-surface therapist scope, the reception/admin rulings, the "their patients" definition, and whether schema is required. **Set this loop's merge path (migration-free self-merge vs migration-gated owner-merge) BEFORE writing code.** Paste the citation.
3. **[Migration-gated branch only] Migration `0038`:** if the matrix mandates schema (assignment column, role/capability column, or per-therapist RLS), author ONE migration (both `packages/db/migrations/` + `supabase/migrations/` at `0038` + snapshot) with RLS/isolation coverage in the same PR; manual `drizzle-kit` apply verified LIVE before DONE. If no schema, SKIP (zero migration).
4. **Server-side scoping:** apply the therapist scope to each surface the matrix names - patients list + detail (`queries.ts`), fichas/clinical, agenda + marcacoes (extend the existing `lockTherapist` path), deriving "their patients" and "their location" as the matrix defines. Every scoping is a NARROWING predicate added server-side; the capability check (`assertCan`) stays.
5. **UI selector removal:** gate the location selector for the therapist role (`agenda-view.tsx:210-231`), so the therapist role loses BOTH selectors; mirror in marcacoes if it carries a location selector.
6. **Tests (NEGATIVE tests mandatory):** unit/component for the scoped queries; and E2E on local Supabase with synthetic data proving: (a) therapist A CANNOT read therapist B's patients; (b) therapist A CANNOT read another location's agenda; (c) the therapist role sees NEITHER selector; (d) owner/admin STILL see cross-visibility (positive control). Negative tests are a required deliverable, not optional.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation on the migration-gated branch), `pnpm build`, `pnpm test:e2e`. JSON.parse both i18n files. Confirm `git diff --name-only origin/main`: ZERO workflow files always; ZERO migration on the migration-free branch, or exactly the `0038` pair + snapshot on the migration-gated branch.

## Field 3. Definition of done (machine-verifiable)
- **Merge-path PROOF:** the approved-matrix disposition is stated and this loop's path (migration-free self-merge OR migration-gated owner-merge) is set accordingly. Paste the citation.
- **Server-side scope PROOF:** each surface the matrix marks own-only/location for the therapist role is scoped server-side (not just client-hidden). Paste the scoped-query tests.
- **Negative-isolation PROOF (mandatory):** E2E proving therapist A cannot read therapist B's patients AND cannot read another location's agenda, on local synthetic data. Paste the negative assertions. A positive control (owner/admin still cross-visible) passes too.
- **Selector-removal PROOF:** the therapist role renders NEITHER the location nor the therapist selector. Paste the test citing `agenda-view.tsx:194` + `:210-231`.
- **No-widening PROOF:** no existing RLS policy was relaxed; tenant_id stays JWT-only; the diff only NARROWS visibility. Paste the RLS diff (or "no RLS change" on the migration-free branch).
- **[migration-gated only] Migration PROOF:** `0038` in BOTH dirs + snapshot with RLS/isolation coverage; live-apply evidence pasted BEFORE the owner merges. NO `.github/workflows/` file in the diff.
- **[migration-free only] Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The approved-matrix citation, the merge-path decision, the server-side scope tests, the mandatory negative-isolation E2E, the selector-removal test, the no-widening proof, (migration-gated) the `0038` diff + isolation test + live-apply evidence, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W10-03, matrix approved). **Migration disposition is the approved matrix's** - never author a migration on the migration-free branch; at most ONE migration `0038` on the gated branch (live-apply verified before DONE).
- **SECURITY-SENSITIVE - the isolation only NARROWS.** Never relax, widen, or remove an existing RLS policy or capability grant; `tenant_id` stays JWT-only; server-side scoping is primary, RLS is defense-in-depth. **Any instinct to relax RLS or widen a policy ESCALATES to the owner instead of being written** (Field 6), never self-authorized.
- **Implement ONLY the approved matrix** - do not add scope, roles, or capabilities the matrix does not contain; do not self-decide the open questions W10-03 filed.
- **Negative tests are mandatory** - a therapist cannot read another therapist's patients or another location's agenda must be PROVEN, not assumed.
- Every new domain column/table ships `tenant_id` + RLS + an isolation test in this PR (migration-gated branch). DB access only through `packages/db`. Audit permission-sensitive changes (rule 6). PII never logged (rule 7).
- pt-PT i18n (both `packages/i18n/src/strings.pt.json` + `strings.en.json`, JSON.parse both); no emoji; plain hyphens only; no em/en dashes. UI-STYLE.md + 55/25/20 equity + AA. **Never force-push / `--admin`.**
- **Standing test-data rule (post W10-02):** ALL verify + E2E on local `127.0.0.1` Supabase with synthetic data ONLY; the cloud is real-data-only; disposable test therapists/patients; never Maria Joao Silva (retired). NO cloud QA data.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W10-03's merge, OR the owner has NOT approved the matrix.
- The approved matrix is ambiguous on a surface's therapist scope, the "their patients" definition, or the reception/admin rulings - HALT for the owner ruling; do not guess.
- Enforcing the matrix cleanly would require RELAXING or widening an RLS policy or a capability grant - HALT-LOUD and escalate; the isolation only narrows, never widens.
- A SECOND migration would be needed - HALT (this loop is at most one migration).
- The migration-gated branch cannot apply `0038` live (DB access blocked / credentials only the owner holds) - HALT with the exact blocker; the owner applies + merges.

## Field 7. Report back
The approved-matrix citation, the merge-path decision, the server-side scope tests, the mandatory negative-isolation E2E, the selector-removal test, the no-widening proof, (migration-gated) the `0038` diff + isolation + live-apply evidence, suite counts, PR number.

## Merge policy (embed, Wave 10 Dados Reais e Isolamento)
- **W10-04 is CONDITIONAL, resolved by the approved matrix:** no schema -> **migration-free GREEN self-merge**; schema required -> **migration-gated OWNER-MERGE with live-apply evidence**. In BOTH cases all required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) must be green (read from the checks API NOT the banner), and the mandatory negative-isolation E2E must pass. On the migration-gated path the `0038` live-apply evidence is pasted BEFORE the owner merges; GREEN never self-merges a migration.
- **Runs after W10-03 merged AND the matrix approved**, fresh `origin/main`, never stacked. Security-sensitive: any instinct to relax RLS or widen a policy escalates instead of being self-authorized. One migration in flight (only on the gated branch). Workflow files NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/reality mismatch.
