# Loop W8-01b - Administracao > Servicos: per-location prices + pack definitions UI (Wave 08 Dados e KPI)

GATE: **Wave 08 Dados e KPI, migration-free.** Extends the Administracao > Servicos admin surface to manage per-location prices and pack definitions on the model shipped by W8-01a. **Runs AFTER W8-01a (`0037`) is merged and `origin/main` fast-forwarded.** Starts from **fresh `origin/main`**; never stacked. **GREEN self-merge** (migration-free).

## Field 1. Scope and ground truth

Let an admin manage, in Administracao > Servicos: (1) per-location prices for each service, and (2) pack definitions (base service, session count, pack price), with active/inactive following the existing service semantics.

Ground truth (recon at authoring 2026-07-15, embed - executor runs with ZERO memory):
- **The admin services surface is `apps/web/app/admin/services/`:** `page.tsx` (list + inline add form + per-service edit/archive/delete + a per-location price override disclosure that ALREADY EXISTS) and `actions.ts` (`createServiceAction`, `updateServiceAction`, `setServiceActiveAction`, `deleteServiceAction`, `setServiceLocationPricesAction`). The route is `/admin/services`; the nav label is "Servicos" (there is no separate pt-route alias). Reuse this surface; do not create a parallel one.
- **Per-location price editing already exists** here (the `setServiceLocationPricesAction` -> `setServiceLocationPrices` path, `apps/web/lib/admin/services.ts:273-344`). This loop reworks/extends it to the W8-01a catalog model (offered-only-where-priced) and adds pack management; it does not build price editing from zero.
- **Pack model (from W8-01a):** the pack-definition table + its service-layer CRUD land in W8-01a. This loop is the ADMIN UI for pack definitions (create/edit a pack: pick a base service, set session count, set pack price, set location, active/inactive). Per-patient pack instances are NOT managed here (that is booking/agenda/profile, W8-01c).
- **Active/inactive semantics (existing, preserve exactly):** `setServiceActive` soft-archives (never hard-delete); `listServices()` returns ALL rows (no isActive filter); the reference-guarded delete (`getReferencedServiceIds` + `deleteService`) only removes unreferenced rows. **W6-01b rule (standing):** service FILTER dropdowns include INACTIVE services (historic marcacoes reference them, e.g. NESA); service CREATION dropdowns show ACTIVE only. Apply the identical split to packs: a pack filter includes inactive packs; a "book/select a pack" creation dropdown shows active packs only.
- **i18n:** pt-PT + en for new labels (session count, pack price, base service, offered-at-location). JSON.parse both files in the gate. No emoji; UI-STYLE.md; the 55/25/20 palette equity and `admin-ui.ts` input classes.

**Scope:** in Administracao > Servicos - (1) per-location price management aligned to the W8-01a offered-only-where-priced model (a price row at a location = offered there); (2) pack-definition CRUD (base service + session count + pack price + location + active/inactive); (3) active/inactive per the existing service semantics + the W6-01b filter-includes-inactive / creation-active-only split, applied to packs too. Migration-free (all schema is from W8-01a). No per-patient pack instances here.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W8-01a's `0037`; `git worktree add ../osteojp-w8-01b-admin-servicos-ui origin/main -b osteojp-w8-01b-admin-servicos-ui`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **RECON:** confirm the `admin/services` page + actions, the existing per-location price disclosure, and the W8-01a pack service-layer API. Paste findings.
3. **Per-location prices:** rework the price editor to the offered-only-where-priced model (adding/removing a location price adds/removes the offering at that location); reuse `setServiceLocationPrices`.
4. **Pack definitions UI:** create/edit/archive a pack (base service dropdown = active services; session count integer > 0; pack price in cents; location; active/inactive). Reference-guarded delete for packs with no patient instances; archive otherwise.
5. **Filter/creation split:** pack filters include inactive; pack creation/selection dropdowns show active only (W6-01b parity). Preserve the service filter behaviour unchanged.
6. **Tests:** component/regression tests that price edits map to offered locations, pack CRUD persists (base service + sessions + price), inactive packs appear in filters but not in creation dropdowns, and money is cents. E2E: an admin adds a per-location price and a pack definition and both render.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`. JSON.parse both i18n files. Confirm `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Per-location price PROOF:** adding/removing a location price adds/removes the offering there (offered-only-where-priced), on the W8-01a model. Paste the test + a before/after screenshot description.
- **Pack CRUD PROOF:** create/edit/archive a pack (base service + session count + pack price + location + active) persists and renders; money is cents. Paste it.
- **Filter split PROOF:** pack filters include inactive packs; creation/selection dropdowns show active only (W6-01b parity). Paste the test.
- **Reference-guard PROOF:** a pack with patient instances cannot be hard-deleted (archived instead). Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The recon report, the migration-free diff, the per-location price + pack CRUD tests, the filter-split test, the reference-guard test, the E2E, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W8-01a's `0037`). **Migration-free:** all schema is from W8-01a; if a schema change surfaces, HALT (do not add a migration here).
- **Reuse the existing `/admin/services` surface**; do not create a parallel route.
- **Preserve the existing service active/inactive semantics + the W6-01b split** (filters include inactive, creation active-only); apply the same to packs.
- **Money is integer cents on the column, never float.** No per-patient pack instances here.
- DB access only through `packages/db`. Audit mutations (rule 6). pt-PT i18n (both files, JSON.parse both); no emoji; UI-STYLE.md + 55/25/20 equity. **Never force-push / `--admin`.** Plain hyphens only. **SYNTHETIC-DATA-ONLY for verify.**
- **Standing test-data rule (Wave 08):** never run destructive QA against patient **Maria Joao Silva** (`triboimax635+maria@gmail.com`); use **disposable test patients only**; the reference therapist for tests is **Tiago Reis**.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W8-01a's `0037` (this loop runs after it).
- Managing per-location prices or packs cleanly needs a schema change not delivered by W8-01a - HALT (do not add a migration here; convert to a W8-01a follow-up).
- The offered-only-where-priced UI model conflicts with the shipped W8-01a schema - HALT with the finding.

## Field 7. Report back
The recon report, the migration-free diff, the price + pack CRUD + filter-split + reference-guard tests, the E2E, suite counts, PR number.

## Merge policy (embed, Wave 08 Dados e KPI)
- **W8-01b is GREEN self-merge (migration-free).** GREEN self-merge once ALL required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API NOT the banner. If a migration surfaces, HALT and convert to an OWNER-MERGE follow-up (one migration in flight; do not add a migration in this loop).
- **Runs after W8-01a merged**, fresh `origin/main`, never stacked. Workflow files NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/data/reality mismatch.
