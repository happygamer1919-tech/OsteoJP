# Loop W5-01 - Login redesign + branding (Batch 1, migration-free, demo priority)

GATE: none. UI-only lane, migration-free. Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files). No auth logic change.

## Field 1. Scope and ground truth
The `/login` card is bare and the OsteoJP logo is small. Redesign the login surface per `docs/design/UI-STYLE.md` and make the logo **significantly larger and prominent** on the login card AND in the app shell header/sidebar.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory):
- **Login page:** `apps/web/app/login/page.tsx`. Current card is a bare `rounded-xl border border-border bg-surface p-8 shadow-sm` wrapper with email/password fields and centered headings. The logo is a `BrandLockup variant="lockup"` centered above the h1 (around line 59).
- **App shell:** `apps/web/components/app-shell.tsx` (server) + `apps/web/components/staff-shell.client.tsx` (client) + `packages/ui/src/components/SidebarAppShell.tsx` (UI). Logo shows in the fixed left sidebar (`BrandLockup variant="lockup" size="lg"`, ~line 127) and the mobile top bar (`size="sm"`, ~line 150).
- **Logo asset:** `packages/ui/src/brand/BrandLockup.tsx`, rendered as **inline SVG** from `packages/ui/src/brand/brand-svg.ts`. There is **no bitmap logo** in `apps/web/public/`; the logo is vector-only, so "larger" means a larger rendered `size`/scale, not a new asset.
- **Design language:** UI-STYLE.md - brand tokens teal `#45B9A7`, magenta `#8B1863`, grey `#98B2C2`; Inter; `GlassPanel`/`GlassCard`; `p-6` panels; token-only, global focus ring. Refinement of the shell, not a rebrand.
- **RECON FIRST (report BEFORE building):** confirm the login card markup + where `BrandLockup` sizes are set; confirm the `BrandLockup` size prop scale (what `size="lg"` vs a new larger step renders) and whether enlarging it needs a new `size` variant in `packages/ui` (if so, that is a `packages/ui` change - HALT and surface the blast radius per UI-STYLE.md, do not silently add a primitive variant).

**Scope:** restyle the `/login` card to UI-STYLE.md (glass panel, spacing scale, tokens, focus ring); enlarge and center the logo prominently on the login card; enlarge the logo in the shell sidebar/header. **No change to auth logic, form fields, redirects, or the Supabase session flow.** pt-PT via i18n keys (both `strings.pt.json` + `strings.en.json`), no emoji.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-01-login origin/main -b osteojp-w5-01-login`; assert `git rev-parse --show-toplevel` ends in `osteojp-w5-01-login`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building (paste paths):** the login card markup, the `BrandLockup` usages + size props in login and shell, and whether enlarging the logo needs a new `packages/ui` size variant.
3. **Login card restyle:** apply the UI-STYLE.md card anatomy (`GlassPanel`/glass card container, `p-6`+ spacing, token surfaces/borders/text, global focus ring on inputs + button). Keep every existing field, label, and the submit control wired to the **same** auth handler.
4. **Logo prominence:** enlarge and center the `BrandLockup` on the login card; enlarge it in the shell sidebar/header. If a larger size can be expressed with existing `size`/scale props, do it in-app; if it genuinely requires a new `packages/ui` variant, HALT (Field 6) and surface the ripple first.
5. **No auth logic touched:** diff proves `apps/web/lib/auth`, the login server action, and redirects are unchanged.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the login flow (login still authenticates and redirects; the e2e login helper still works).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Recon report pasted:** login card markup + BrandLockup sizes + the packages/ui-variant determination.
- **No-auth-change PROOF:** `git diff --name-only origin/main` shows no change under `apps/web/lib/auth/` and no change to the login server action / redirect logic. Paste it.
- **Login e2e green:** the existing login e2e (and the `e2e/.auth` setup) still authenticate and redirect. Paste the e2e summary.
- **i18n parity:** any new/changed strings exist in BOTH `strings.pt.json` and `strings.en.json` (a one-file key fails typecheck). Paste typecheck result.
- **Suite counts** pasted (baseline STATE 2026-07-07: web 816, ui 42) with green lint/typecheck/test/build.

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only origin/main`, no-auth-change diff, login e2e summary, before/after screenshot or preview URL of the login card + shell logo for Max's QA, suite counts, the PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w5-01-login` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`.
- **No auth logic change:** fields, validation, server action, session, redirects all unchanged - restyle only.
- **No new `packages/ui` primitive** (incl. a new `BrandLockup` size variant) without HALT + blast-radius (UI-STYLE.md).
- pt-PT via i18n keys (both files), no emoji, token-only (no raw hex), global focus ring, 4px grid.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
On any blocker, STOP and report to Ivan with (1) the exact mismatch, (2) options, (3) a recommended default; leave the branch GREEN, record resume state. For a product/scope decision, write it to `docs/design/QUESTIONS.md` with a recommended default and mark the loop blocked. Never guess. Halt if: enlarging the logo requires a new `packages/ui` size variant (ripple beyond login); any auth-logic change would be forced; the brand SVG cannot scale cleanly without a new asset.

## Field 7. Report back
Recon report, the restyle + logo-prominence implementation, migration-free proof, no-auth-change proof, login e2e summary, preview URL, suite counts, PR number. Close: open ONE PR against `main` per the standard template and HALT for owner merge. Do NOT self-merge. A refused or blocked merge is a HALT reported to Ivan.
