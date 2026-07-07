# Loop W4-20 - Consultation discoverability: Iniciar consulta quick-action tile (small standalone loop, migration-free)

GATE: none. Standalone post-Wave-04 fix (owner QA 2026-07-08). UI lane, migration-free, functionality-preserving. Small-batch rule (no CYAN; classic halt). This dispatch is the contract.

## Field 1. Scope and ground truth
The start-consultation screen (the W4-06/W4-07 AI-recording chain entry) has **NO navigation entry anywhere** — it was reachable only by direct URL. The first real fire succeeded from it (owner QA 2026-07-08), confirming the flow works; it just isn't discoverable.

Ground truth (recon-confirmed, GREEN runs with zero memory):
- **The start-consultation route is `/consultation`** (`apps/web/app/consultation/page.tsx` → `StartConsultation`). It is gated to **`clinical_records:author`** (therapist/owner); reception/admin are redirected to `/dashboard`, and the server actions re-enforce this.
- **The route ALREADY renders inside the app shell:** `consultation/page.tsx` wraps its content in `<AppShell>` (`@/components/app-shell` → `StaffShellClient`, the role-aware left-nav sidebar). So a user on `/consultation` can already navigate away via the left nav — **Section 2 is already satisfied; no wrapping change is needed.**
- **The Início (dashboard) quick-action tiles** live in `apps/web/app/dashboard/page.tsx` (`tiles` array → `QuickActionTile`), role-gated by capability. W4-18 added a sixth **Revisão Consulta** tile (`/clinical/review`, gated `clinical_records:review`).
- **Revisão Consulta also has a left-nav entry** (`staff-shell.client.tsx` → `/clinical/review`, `nav.review` "Revisão Consulta"), so removing its tile loses nothing — it stays reachable from the sidebar.

**Build (migration-free):** replace the Início **Revisão Consulta** tile with an **Iniciar consulta** tile → `/consultation`, matching the QuickActionTile anatomy per `docs/design/UI-STYLE.md`, pt-PT label **"Iniciar consulta"**, gated on `clinical_records:author` (the same capability `/consultation` enforces, so the tile never leads to a redirect). All UI copy pt-PT via i18n keys.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-20-consultation-discoverability origin/main -b osteojp-w4-20-consultation-discoverability`; assert toplevel ends in the branch name; assert `git status --porcelain` empty. HALT if either fails.
2. **Recon (paste):** the `/consultation` route + its shell wrapping; the dashboard `tiles` array + the W4-18 review tile; the Revisão Consulta left-nav entry; the dashboard Playwright specs that move.
3. **Swap the tile:** replace the Revisão Consulta tile with `{ label: dashboard.tile.startConsultation, icon: Stethoscope, href: "/consultation", accent: "lavender", capability: "clinical_records:author" }`; add the i18n key pt+en. Remove the now-unused `ClipboardCheck` import.
4. **Confirm shell:** verify `/consultation` renders in `<AppShell>` (already true) — no code change; state it in the report.
5. **Update the dashboard Playwright specs on-branch** for the swap (Iniciar consulta tile → `/consultation`; admin/reception do not see it). Never touch workflow files.
6. **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the dashboard tiles.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Início shows six tiles with `Iniciar consulta` in place of `Revisão Consulta`**, gated `clinical_records:author`; the tile links to `/consultation`. Paste the e2e assertion (tile visible + `href="/consultation"` for a therapist; absent for admin/reception).
- **`/consultation` renders in the app shell** (left nav present) so users can navigate away — stated (already true via `<AppShell>`).
- **Revisão Consulta not lost** — its left-nav entry is untouched.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`.

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only origin/main`, the dashboard e2e tile assertions (therapist sees Iniciar consulta → `/consultation`; admin absent), the shell-render statement, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation;** never edit the primary clone.
- **Migration-free:** no schema change; NO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`.
- **Functionality-preserving:** the tile only adds discoverability; `/consultation`'s server-side `clinical_records:author` gate is unchanged; Revisão Consulta stays reachable via the left nav.
- **Conform to `docs/design/UI-STYLE.md`** (QuickActionTile anatomy). **pt-PT via i18n keys**, no hardcoded strings, no emoji.
- **Redesign moves Playwright selectors:** update the dashboard specs on-branch. **Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`.**
- Never force-push, never `--admin`, never bypass branch protection.

## Field 6. Halt loud if (CLASSIC halt — small-batch, no CYAN)
On any blocker, STOP and report to Ivan with (1) the exact mismatch, (2) options, (3) a recommended default. Halt if: the `/consultation` route or the dashboard tiles are not where recon expects; `/consultation` does NOT render in the shell (would require a real wrapping change beyond the tile swap — surface it); or the tile swap would relax a server-side gate.

## Field 7. Report back
Recon report, the tile swap + shell confirmation, the per-role e2e assertions, migration-free proof, suite counts, and the PR number. Close: open ONE PR against `main`, four-leg merge gate, **dev-phase self-merge on green CI**, flip the BACKLOG row DONE on merge.
