# Loop W7-02 - Self-service profile page reachability (Wave 07 Correcoes QA)

GATE: **Wave 07 Correcoes QA, RECON-FIRST.** On the deployed app the owner cannot find any profile page. Recon determines whether W6-02 (#573) actually shipped the page and at what route BEFORE any build. If it shipped but has no entry point, the bug is **reachability** (add a visible menu entry). If it does not exist, **build it** per the original W6-02 spec. **Migration-free expected.** Runs SECOND in Wave 07. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Make the self-service profile reachable for every role. The owner reports no profile page is findable on the deployed app. Recon first, then either wire the entry point or build the page.

Ground truth (recon at authoring 2026-07-14, embed - executor runs with ZERO memory):
- **The page appears to EXIST already:** W6-02 (#573) shipped a self-service profile route at **`apps/web/app/perfil/`** (recon at authoring found the directory present on `origin/main`). Supporting i18n is present: `nav.profile` = "Perfil", `profile.title` = "Perfil", `profile.subtitle` = "Faca a gestao da sua conta.", `profile.nameLabel`, `profile.emailLabel`, `profile.emailReadonlyHint`, `profile.save`, `profile.passwordError`, etc. (`packages/i18n/src/strings.pt.json` ~727-742). **The most likely defect is REACHABILITY: the route exists but has no visible entry point in the UI**, so the owner never reaches `/perfil`.
- **What W6-02 shipped (per Q-W6-02-2 / Q-W6-02-3, embed):** the profile edits **own name** + **change own password**, with **email read-only** (it is the Supabase auth login identity + the `(tenant_id, email)` unique key). There is NO editable "contact"/phone field because the `users` table has no phone column (a migration Q-W6-02-2 deferred). Own-account-only is enforced server-side from the actor's request context. **Do NOT add a phone column or an email-change flow in this loop** (both are open QUESTIONS, migration/auth-flow follow-ups) - this loop is about REACHABILITY, not new fields.
- **Where the entry point belongs:** the top-right user-menu area of the staff shell, beside the name/role and the "Terminar sessao" (sign-out) control. The shell lives in `packages/ui/src/components/` (`AppShell.tsx` / `SidebarAppShell.tsx`) with the sign-out string `common.signOut` = "Terminar sessao". Recon the exact component that renders the name/role + Terminar sessao, and add a visible entry labelled **"O meu perfil"** that links to `/perfil`. Reuse the existing menu/link primitives; do not invent a new shell pattern. If a `nav.profile` = "Perfil" string is more appropriate than a new "O meu perfil" key, recon and reuse; the owner-facing label the owner expects is **"O meu perfil"** (add the pt-PT + en key if absent).
- **If recon finds the page does NOT exist** (contrary to the authoring finding, e.g. it was reverted): **build it per the original W6-02 spec** - a self-service profile route for **every role, own account only** (server-scoped to the actor), editing own name and changing own password, email read-only, reusing the existing password-strength precheck (`apps/web/app/auth/update-password/password.ts`) and Supabase auth for the change; audited (rule 6). Migration-free; if a needed column is absent, HALT rather than add a migration.
- **Migration-free expected:** adding a menu link (or, in the build case, reusing existing `users` fields + Supabase-auth password change) needs no schema change.

**Scope:** recon whether `/perfil` exists and is reachable. If it exists but is unreachable, add a visible **"O meu perfil"** entry in the top-right user-menu area (beside the name/role and Terminar sessao) linking to it, for every role. If it does not exist, build it per the original W6-02 spec (all roles, own account only, edit own name + change own password, email read-only, audited). E2E asserts every role reaches its own profile, edits it, and cannot reach another account's. Migration-free. pt-PT i18n (both files) for any new copy.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w7-02-profile-reachability origin/main -b osteojp-w7-02-profile-reachability`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **RECON, report BEFORE building:** confirm whether the profile route exists (`apps/web/app/perfil/`) and at what path; enumerate what it currently edits (name + password, email read-only) and how it self-scopes to the actor; locate the shell component that renders the name/role + "Terminar sessao"; determine whether there is ANY existing link to `/perfil` today. Paste findings. Decide the branch: **reachability** (page exists, no entry) vs **build** (page absent).
3. **Reachability branch (expected):** add a visible **"O meu perfil"** entry in the top-right user-menu area (beside name/role + Terminar sessao) linking to `/perfil`, rendered for every role. Reuse existing menu/link primitives + i18n (add the label key pt + en if absent). No behaviour change to the profile page itself.
4. **Build branch (only if the page is absent):** build the self-service profile per the original W6-02 spec (all roles, own account only, server-scoped to actor; edit own name + change own password; email read-only; reuse the password-strength precheck; audited), THEN add the same "O meu perfil" entry point.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation; in the build branch, a test that the profile action refuses a client-supplied foreign user id and writes only the actor's row), `pnpm build`, `pnpm test:e2e` (every role - owner/admin/therapist/receptionist as seeded - sees the "O meu perfil" entry, opens their own profile, edits their own name, changes their own password, and CANNOT reach another account's profile). JSON.parse both i18n files in the gate.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Recon PROOF:** the recon report - route existence + path, what it edits, self-scoping, the shell component, whether any `/perfil` link existed - and the chosen branch (reachability vs build). Paste it.
- **Reachability PROOF:** the "O meu perfil" entry renders in the top-right user-menu area for every role and links to `/perfil`. Paste it (before/after of the menu).
- **Reach-and-edit PROOF (E2E):** every seeded role opens its own profile via the entry, edits its own name, and changes its own password. Paste it (never print the password).
- **Own-account-only PROOF:** a user cannot reach or edit another account's profile (server-enforced; in the build branch, the action refuses a client-supplied foreign user id). Paste it.
- **Audit PROOF (build branch only):** the profile + password change each write an audit row (rule 6). Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The recon report + chosen branch, the migration-free diff, the menu-entry before/after, the per-role reach-and-edit E2E, the own-account-only proof, the audit proof (build branch), suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Recon-first:** decide reachability vs build before writing UI.
- **This loop is reachability first.** Do NOT add a phone/contact column (Q-W6-02-2) or an own-email-change flow (Q-W6-02-3); both are deferred QUESTIONS and out of scope here.
- **Own-account-only, server-enforced** from the request context; never trust a client-supplied user id. This is not `users:manage`.
- **Every role** gets the entry point and reaches only their own account.
- **Migration-free expected;** if the build branch needs an absent column, HALT rather than add a migration here. DB access only through `packages/db`. Audit mutations (rule 6).
- pt-PT i18n (both files, keep-both on rebase, JSON.parse both in the gate); no emoji; UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. SYNTHETIC-DATA-ONLY for verify.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- Recon shows the profile page is neither present NOR buildable migration-free (a needed `users` column is absent) - HALT with the finding; do not add a migration in this loop.
- Adding the entry point cleanly requires touching `packages/ui` shell internals in a way that risks other surfaces - surface the change and a recommended default (a route-local link vs a shell menu item) before proceeding.
- The self-service password change cannot go through the existing Supabase auth path without weakening a security control - surface it.

## Field 7. Report back
The recon report + chosen branch, the migration-free diff, the menu-entry before/after, the per-role reach-and-edit E2E, the own-account-only proof, the audit proof (build branch), suite counts, PR number.

**Merge policy (Wave 07 Correcoes QA, standing):** GREEN self-merge permitted once ALL required checks are green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API, never the banner. This loop is migration-free -> GREEN self-merge; if a migration surfaced it HALTED to a follow-up OWNER-MERGE loop with live-apply evidence. Workflow files are never touched. Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
