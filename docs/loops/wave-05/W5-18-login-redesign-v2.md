# Loop W5-18 - Login redesign v2: split-screen brand + form (Wave 05 Hotfix)

GATE: **Wave 05 Hotfix, Batch H (UI-lane, migration-free, parallel-safe).** Depends on **UI-STYLE.md** (design authority) and this loop's login-surface direction, which EXTENDS UI-STYLE.md for `/login`. No dependency on the other hotfix loops. The shipped W5-01 login (#519) is below standard; this rebuilds its visual layer only. Zero auth-logic change.

## Field 1. Scope and ground truth

Rebuild the **visual layer** of the `/login` page to a split-screen brand + form layout, and verify the app-shell logo is large and crisp. **Zero changes to auth logic, handlers, route, or field names.**

Ground truth (recon 2026-07-09, embed - executor runs with ZERO memory):
- **Login page:** `apps/web/app/login/page.tsx` - client component (`"use client"`, `useActionState`). Current layout: `<main className="relative min-h-dvh bg-bg">` with a `HeritageCorners` frame, a centered flex wrapper, and a single `glass-card w-full max-w-sm rounded-v2 p-8 shadow-v2-float` card. Logo at the card top is `<BrandLockup variant="lockup" size="xl" />` (96px, the current max step). Heading reads `s["login.title"]` ("Iniciar sessao"). This is a SINGLE centered card today - NOT split-screen.
- **Form fields (names are FROZEN):** email `<Input name="email" type="email">` (label `login.emailLabel`, placeholder `login.emailPlaceholder`, client-side regex validation per SPEC-staff-screens 11.5); password `<Input name="password" type="password|text">` (label `login.passwordLabel`) with a show/hide toggle button (Eye / EyeOff from lucide-react, aria-label `login.showPassword` / `login.hidePassword`, `aria-pressed` reflects state). Submit: `<Button type="submit" variant="primary" loading={pending} className="mt-2 w-full">` reading `login.submit` ("Iniciar sessao").
- **Auth handler (DO NOT TOUCH):** server action `login(_prev, formData)` in `apps/web/app/login/actions.ts` -> `supabase.auth.signInWithPassword({ email, password })` -> redirect `/dashboard`; plain-language error `login.error` that never leaks whether the email exists. Route path `/login`.
- **Playwright login helper (preserve or on-branch-update):** `apps/web/e2e/auth.setup.ts` fills `input[name="email"]` and `input[name="password"]`, clicks `getByRole("button", { name: /Iniciar sessao/i })`, then `waitForURL(/\/dashboard/)`. These selectors MUST keep working (do not rename the fields or the submit text). Storage state in `apps/web/e2e/.auth/{admin,therapist,reception}.json`.
- **Brand lockup:** `packages/ui/src/brand/BrandLockup.tsx`, inline SVG (no bitmap), size map `sm 24 / md 32 / lg 48 / xl 96` px (W5-01 added the `xl:96` step). Variants: `mark`, `lockup` (mark + wordmark), `full` (mark + wordmark + tagline) from `packages/ui/src/brand/brand-svg.ts`. Colors baked in: teal `#45B9A7`, magenta `#8B1863`, grey `#98B2C2`.
- **App-shell logo:** `packages/ui/src/components/SidebarAppShell.tsx` - desktop sidebar `<BrandLockup variant="lockup" size={brandSize} />` (default `lg` 48px, W5-01 made `brandSize` overridable, default unchanged); mobile top-bar + drawer fixed at `size="sm"` (24px). W5-01 claimed the app-shell logo was enlarged; **recon whether that regressed** and correct if so.
- **i18n:** all copy via `@osteojp/i18n` keys in BOTH `strings.pt.json` and `strings.en.json`. Any new key (e.g. a tagline) added to both.

**Design direction (EXTENDS UI-STYLE.md for the `/login` surface):**
- **Desktop split-screen.** Left panel = a **brand atmosphere panel**: a soft sage-to-off-white gradient OR a subtle abstract SVG pattern derived from the logo's spine-and-hands motif, the large OsteoJP logo centered, and ONE tagline line **"Gestao clinica, simplificada."** in muted text. Right panel = the form on a clean white surface.
- **Mobile.** The brand panel collapses to a compact header (logo above the card); the form card sits below.
- **Form.** "Iniciar sessao" heading; Email and Palavra-passe with **visible labels**; inputs **min 44px height**; clear focus rings; the existing show-password toggle preserved; primary button **full-width** in brand sage green with **hover, pressed, and loading-spinner** states.
- **Type + a11y.** Typography per UI-STYLE.md tokens, base 16px, nothing below 12px, contrast **>= 4.5:1** including the tagline. Subtle entrance transition **150-300ms** respecting `prefers-reduced-motion`. **No emoji, SVG icons only.**

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-18-login-redesign-v2 origin/main -b osteojp-w5-18-login-redesign-v2`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** the current login markup + BrandLockup sizes + the app-shell logo size (confirm whether the W5-01 enlargement is still in place or regressed).
3. **Split-screen shell:** rebuild `page.tsx` as a two-column layout (brand panel left, form right) that collapses to a stacked compact-header layout on mobile. Brand panel: gradient or logo-motif SVG pattern, large centered logo, tagline "Gestao clinica, simplificada." (new i18n key in both string files).
4. **Form surface:** clean white card; visible Email + Palavra-passe labels; 44px-min inputs; focus rings; preserved show-password toggle; full-width sage primary button with hover / pressed / loading states.
5. **App-shell logo:** verify the logo is large and crisp in the shell; correct it (larger `brandSize`, and crisp SVG) if the W5-01 enlargement regressed. Do NOT add a new BrandLockup size step unless required (that would ripple `packages/ui` - HALT and surface it, Field 6).
6. **a11y + motion:** base 16px, min 12px, contrast >= 4.5:1 incl. tagline; entrance transition 150-300ms gated on `prefers-reduced-motion`; SVG icons only, no emoji.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (login setup still authenticates all three roles and redirects to `/dashboard`).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **No-auth-change PROOF:** `actions.ts` unchanged (or diff shows no logic change); the login server action, redirect, and field `name` attributes (`email`, `password`) are untouched. Paste the `git diff --stat` + a grep confirming `name="email"` / `name="password"` still present.
- **Recon report pasted:** current login markup, BrandLockup size map, app-shell logo size verdict (in-place / regressed).
- **Split-screen proven:** a screenshot or e2e/snapshot showing the desktop two-panel layout and the mobile stacked layout; the tagline "Gestao clinica, simplificada." present and contrast-passing.
- **Login e2e green:** `auth.setup.ts` still logs in via `input[name="email"]` / `input[name="password"]` / `/Iniciar sessao/i` and reaches `/dashboard`. Paste the passing run.
- **a11y proven:** inputs >= 44px, base 16px, min 12px, contrast >= 4.5:1 (state the check used); `prefers-reduced-motion` respected.
- **i18n parity:** any new key (tagline) present in BOTH `strings.pt.json` and `strings.en.json`.
- **Suite counts** (baseline web 816, ui 42) with green lint/typecheck/test/build.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, no-auth-change proof (stat + name-attr grep), desktop + mobile screenshots/snapshots, the passing login e2e, the a11y/contrast check, i18n parity, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **UI-STYLE.md authoritative**; this loop extends it for `/login` only.
- **Migration-free.** No schema, no workflow, no new vendor.
- **VISUAL LAYER ONLY.** Do NOT change `actions.ts`, the auth flow, the route `/login`, the redirect target, or the field `name` attributes. Preserve the show-password toggle behavior.
- **Preserve or on-branch-update the Playwright login helpers.** If a selector must change, update `auth.setup.ts` in the SAME branch and prove it green - never leave the auth setup red.
- **No new BrandLockup size step** unless strictly required; if required, HALT and surface the `packages/ui` ripple (Field 6).
- pt-PT i18n (both files), no emoji, SVG icons only. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, or dirty tree).
- Achieving the enlarged / crisp app-shell logo requires a NEW `packages/ui` BrandLockup size variant or a source-SVG change (surface the blast radius across every BrandLockup consumer).
- The redesign cannot preserve the frozen field `name` attributes or the `/Iniciar sessao/i` submit text without breaking `auth.setup.ts` in a way that can't be updated on-branch.
- Any need to touch `actions.ts` / the auth flow to land the visual layer.

## Field 7. Report back
Recon report, the split-screen implementation summary, the app-shell logo verdict + fix, migration-free + no-auth-change proofs, the passing login e2e, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
