# Loop W4-15 - Serviços admin: per-service delete (no password, reference-guarded) + tab restyle (redesign + functional change, recon-first, migration-free)

GATE: depends on **W4-13 merged** (consumes `docs/design/UI-STYLE.md` — this redesign conforms to it). Admin UI + server, migration-free. **Includes a functional change** (per-service delete). Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Add a **per-service delete** to the **Serviços** admin tab and **restyle the tab** to conform to `docs/design/UI-STYLE.md` (W4-13).

Ground truth (locked mechanisms to embed — GREEN runs with ZERO memory; do not assume anything not written here):
- **`services` table** (`packages/db/src/schema.ts`): `(id, tenant_id, location_id null, name, description, duration_min, price_cents null, currency, is_active, …)`. **Archive already exists as `is_active = false`.** No unique-on-name, no check constraints.
- **Reference-guard precedent = W3-07 locations (#474), applied here as an OWNER RULING (2026-07-06):** a location deletes **only when it has zero appointments**; otherwise it is **archive-only** with a **disabled delete control + explanatory pt-PT tooltip**, and FKs are handled non-destructively. **Services follow the same shape:** a service with **zero references hard-deletes**; a **referenced** service is **archive-only (disabled delete + tooltip)**.
- **Delete requires NO password** (owner ruling 2026-07-06; DECISIONS 2026-07-06 "Service delete"). This is distinct from the password-gated appointment (W3-06) and therapist (W4-01) deletes — services are not clinical/staff principals.
- **Known service reference points (RECON MUST confirm the ACTUAL set before build):** `appointments.service_id` (nullable FK), `therapist_services.service_id` (0023 mapping), and **`service_location_prices.service_id`** (per-location price overrides, 0007). **Recon determines the real reference set;** if MORE reference points exist than these, **include them in the guard and note it in the report.** A service is "zero-reference" only when it has NONE of the confirmed references.
- **Admin-only, server-enforced** (services management is admin). The delete + guard are server-enforced; the disabled control is a UX affordance, never the security boundary.
- **`Preços por local`** = the `service_location_prices` per-location price disclosure on the service row; the restyle cleans up its presentation, not its data.

**Build:**
- **(a) Per-service delete, NO password, reference-guarded:** services with **zero references** (across the recon-confirmed set) **hard-delete** (child-safe, `RETURNING` evidence); **referenced** services are **archive-only** — the delete button is **disabled** with an explanatory **pt-PT tooltip** (e.g. "Não é possível eliminar: este serviço tem marcações ou associações. Pode arquivá-lo."). Archive = `is_active = false` (existing mechanism).
- **(b) Restyle the Serviços tab per UI-STYLE.md:** a **proper table** (per W4-13 table anatomy), **Estado badges** (active/archived), a **cleaner `Preços por local` disclosure**, and the **add-service form aligned to the new layout**. Presentational only for existing fields; no data-model change.

All UI copy is **pt-PT via i18n keys** (no hardcoded strings, no emoji). **Migration-free** (any proven schema need is a HALT). All build/verify work is **synthetic-data-only**; verify on the **E2E seed tenant**.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-15-servicos-delete-and-redesign origin/main -b osteojp-w4-15-servicos-delete-and-redesign`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-15-servicos-delete-and-redesign`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building (paste paths):** the Serviços tab route + component; the existing service create/edit/archive server actions; the **W3-07 location delete guard** to mirror; **the ACTUAL service reference set** (grep schema + code for every FK/read that references `services.id` — confirm `appointments`, `therapist_services`, `service_location_prices`, and any others) — **paste the confirmed set**; the `Preços por local` (`service_location_prices`) read/render; the Serviços Playwright specs that will move.
3. **(a) Delete + guard (server-enforced, no password):** implement the reference check across the confirmed set; zero-reference → hard-delete with `RETURNING`; referenced → refuse hard-delete, expose archive (`is_active=false`) + a disabled delete control + pt-PT tooltip. Handle any FK non-destructively (W3-07 pattern).
4. **(b) Restyle per UI-STYLE.md:** table with Estado badges, cleaner `Preços por local` disclosure, aligned add-service form. No field/data-model change.
5. **Tests:**
   - a **zero-reference** service deletes cleanly (`RETURNING` proof on the E2E seed tenant);
   - a **referenced** service (has an appointment / mapping / price override) shows **archive-only** — hard-delete refused server-side, control disabled, tooltip present;
   - archive (`is_active=false`) hides the service from selection dropdowns (existing W2-02 behavior preserved), and does not delete rows;
   - the restyle renders (table + Estado badges + Preços por local) with no data change.
6. **Update the Serviços Playwright specs on-branch** (**never touch `db-tests.yml` or `e2e.yml`**). **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the delete (zero-ref success + referenced refusal) and the restyled tab.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted incl. the CONFIRMED service reference set** (every relation that references `services.id`) — if more than `appointments`/`therapist_services`, they are in the guard and noted.
- **Zero-reference service deletes cleanly:** paste the `RETURNING` evidence on the E2E seed tenant (ids only, no PII).
- **Referenced service is archive-only:** hard-delete **refused server-side**, delete control **disabled** with a **pt-PT tooltip**. Paste the refusal test + the disabled-control assertion.
- **Restyle matches `docs/design/UI-STYLE.md`** (W4-13): table + Estado badges + cleaner Preços por local + aligned add-service form. Paste a screenshot/DOM assertion.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report (with the confirmed reference set), migration-free `git diff --name-only origin/main`, the zero-reference `RETURNING` delete evidence, the referenced-service archive-only refusal test + disabled-control/tooltip assertion, the restyled-tab screenshot, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-15-servicos-delete-and-redesign` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change. Any proven schema need is a **HALT**. One migration may be in flight system-wide; this loop opens none.
- **Delete is NO-PASSWORD but REFERENCE-GUARDED** (owner ruling 2026-07-06) — zero-reference hard-delete only; referenced = archive-only (disabled + tooltip). Guard is **server-enforced**; the disabled control is not the security boundary.
- **Recon confirms the reference set before build** — do not assume only the two named relations; include every relation that references `services.id`.
- **Restyle is presentational** — no service field/data-model change; `Preços por local` data (`service_location_prices`) unchanged.
- **Redesign WILL move Playwright selectors:** update the affected specs **on-branch**. **NEVER touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`.**
- **LIVE-DATA CAUTION:** verify delete/archive against **synthetic services on the E2E seed tenant**; never delete or archive a service the real clinic relies on. Real therapist accounts, their `availability_templates`, and `therapist_services` on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` are never modified — a service delete must not cascade into a real `therapist_services` mapping (that is exactly the reference guard's job).
- **Conform to `docs/design/UI-STYLE.md`** (W4-13); refinement, not rebrand.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- **pt-PT via i18n keys**, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record the resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- Recon finds a service reference relation whose FK is **`ON DELETE CASCADE`** (a zero-reference delete could still cascade unexpectedly) or a reference the guard cannot cheaply check — surface it before enabling delete; recommend widening the guard or archive-only for that class.
- A "zero-reference" hard-delete cannot be done without violating an FK or needing a schema change — STOP; the guard should make it safe, so a failure means the reference set was mis-scoped.
- The restyle would require editing a `packages/ui` primitive whose ripple extends beyond the Serviços tab — surface the blast radius.
- The delete cannot be made NO-PASSWORD without touching the shared password-gate code in a way that weakens the appointment/therapist gates — STOP; keep those gates intact.

## Field 7. Report back
Recon report (with the confirmed reference set), the delete + reference guard + tab restyle, the zero-reference `RETURNING` proof, the referenced-archive-only refusal test, the restyled-tab screenshot, migration-free proof, e2e summary, suite counts, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge (this batch has no runner self-merge authority; classic stop-and-report). A refused or blocked merge is a HALT reported to Ivan.
