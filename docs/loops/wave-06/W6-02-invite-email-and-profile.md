# Loop W6-02 - Invite email via Resend + self-service profile (Wave 06 Melhorias)

GATE: **Wave 06 Melhorias.** Wire the real staff invite email (Resend, already in stack) and add a self-service profile page (edit own name/contact, change own password) for every role. **Migration-free expected.** If a Vercel env var is required, the loop **HALTs with the exact variable name** (standing owner-exception class); the owner sets it in the Vercel dashboard, then the loop resumes. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Two parts: (a) make **Convidar** send a real invite email instead of showing "Nao foi possivel enviar o email de convite" and falling back to a temporary password; (b) add a **self-service profile page** where any signed-in user edits their OWN name and contact and changes their OWN password.

Ground truth (recon at authoring 2026-07-14, embed - executor runs with ZERO memory):
- **(a) Invite flow:**
  - UI: `apps/web/app/admin/staff/StaffInviteForm.tsx` (`inviteAction` via `useActionState`); states include `already_invited`, `invited` (success), and an email-failure branch showing `s["admin.staff.inviteEmailFailed"]` vs the success `s["admin.staff.inviteEmailSent"]`.
  - Server: `apps/web/app/admin/staff/actions.ts` -> `inviteAction`. Recon confirms where it creates the Supabase auth user / recovery link and where it ATTEMPTS the email (today it fails and falls back to a temp password shown in-UI).
  - The set-password landing already exists: `apps/web/app/auth/update-password/` (`page.tsx`, `UpdatePasswordClient.tsx`, `password.ts`) - the invite email's link points at Supabase's recovery `verify` endpoint which redirects here. Reuse this; do NOT rebuild the set-password flow.
  - Email vendor: **Resend** is in the stack (`packages/integrations`, CLAUDE.md rule 8 requires Resend EU). Recon confirms whether a Resend client wrapper exists and whether it is wired for the invite. The most likely gap is (i) the invite action never calls Resend, or (ii) it calls it but the Resend API key env var is missing in the environment.
  - **Env-var HALT class:** if recon shows the only blocker is a missing Vercel env var (e.g. the Resend API key, or a public app-URL used to build the invite link), the loop HALTs printing the **exact variable name(s)** and the target Vercel project(s) (osteojp-platform for staff). The owner sets it in the Vercel dashboard (human-only setup, CLAUDE.md), then the loop resumes. Do NOT stub, hardcode, or invent a key (CLAUDE.md "Environment and secrets"); never print a secret VALUE.
  - **Keep the temp-password fallback** for the case where the email genuinely fails to send (send error), so an admin is never fully blocked.
- **(b) Self-service profile page:**
  - No profile/account route exists today (recon confirmed: no `apps/web/app/**/(profile|account|perfil|conta)` dir). Add one route, accessible to **every role for their OWN account only**.
  - Fields: edit own **name** and **contact** (phone/email per the staff/user model - recon the `users` columns), and **change own password** (reuse the same password-strength precheck as `apps/web/app/auth/update-password/password.ts` and Supabase auth for the actual change).
  - **Own-account-only enforcement is server-side:** the action reads the actor's own user id from the request context and writes only that row; it never accepts a target user id from the client. This is NOT `users:manage` (that is staff admin over OTHERS); a self-service edit is available to all roles for self. Recon the existing `RequestContext` / `requireRequestContext()` to scope the write to `actor` (do not add a new capability unless recon shows one is needed; if so, keep it self-scoped).
  - Audit the profile/password change (CLAUDE.md rule 6). Secrets never logged (rule 7).
- **Migration-free expected:** editing existing `users` fields + Supabase-auth password change needs no new table. If recon finds a needed column is absent, HALT (Field 6) rather than add a migration in this loop.

**Scope:** (a) wire `inviteAction` to send the invite email via Resend, keep the temp-password fallback on send failure, reuse the existing set-password landing; HALT with the exact env var name if a missing Vercel env is the only blocker. (b) a self-service profile route for all roles, server-scoped to the actor's own account, editing own name/contact + changing own password, reusing the existing password-strength precheck; audited. Migration-free. pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w6-02-invite-profile origin/main -b osteojp-w6-02-invite-profile`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** the `inviteAction` server path (where it creates the user + where email should send); whether a Resend wrapper exists in `packages/integrations` and its required env var name(s); the set-password landing reuse; the `users` columns for name/contact; `requireRequestContext()` for self-scoping; whether a public app-URL env is needed to build the invite link. Paste findings. **If the only blocker is a missing Vercel env var, HALT now (Field 6) with the exact name(s).**
3. **(a) Invite email:** wire `inviteAction` to send via Resend (EU), using the existing set-password recovery link; on send failure keep the temp-password fallback and the existing failure UI. Distinct success vs fallback messaging (existing keys).
4. **(b) Profile page:** add the self-service route (all roles), server-scoped to `actor`; edit own name/contact; change own password (reuse the strength precheck + Supabase auth). Own-account-only enforced server-side (never a client-supplied user id). Audit the change.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation; a test that the profile action refuses a client-supplied foreign user id and writes only the actor's row), `pnpm build`, `pnpm test:e2e` (invite sends / shows sent state on success and the temp-password fallback on simulated failure; a non-admin can open their own profile, change name/contact, change password; a user cannot edit another user's account). JSON.parse both i18n files in the gate.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Recon report pasted:** invite path + Resend wrapper + env var name(s); set-password reuse; users columns; self-scoping context.
- **Invite-send PROOF:** the invite sends a real email via Resend on success (paste the send result / a mocked-Resend assertion, no secret value printed); the temp-password fallback still fires on a simulated send failure. Paste both.
- **Env-var HALT record (if applicable):** if a Vercel env var was missing, the loop halted with the exact variable name + target project, the owner set it, and the resume is noted. Paste the halt+resume record.
- **Profile PROOF:** a signed-in user (any role) edits their own name/contact and changes their own password. Paste it (never print the password).
- **Self-scope PROOF:** the profile action refuses a client-supplied foreign user id and writes only the actor's row (server-enforced). Paste the test.
- **Audit PROOF:** profile + password change each write an audit row (rule 6). Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report, the migration-free diff, the invite-send + fallback proof, any env-var halt+resume record, the profile edit proof, the self-scope test, the audit proof, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`.
- **Resend is already in the stack - NOT a new vendor.** Do not introduce any other email vendor. EU region (rule 8).
- **Env vars:** never stub, hardcode, or invent a key; if one is missing, HALT with the exact name and target Vercel project and let the owner set it (human-only setup). Never print a secret value (rule 7).
- **Keep the temp-password fallback** for genuine send failures.
- **Self-service is own-account-only, server-enforced** from the request context; never trust a client-supplied user id. This is not `users:manage`.
- **Migration-free expected;** if a needed column is absent, HALT rather than add a migration here. DB access only through `packages/db`. Audit mutations (rule 6).
- pt-PT i18n (both files, keep-both on rebase, JSON.parse both in the gate); no emoji; UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. SYNTHETIC-DATA-ONLY for verify.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- **A required Vercel env var is missing** (Resend API key, sender identity, or a public app-URL for the invite link) - HALT with the EXACT variable name(s) + target project; resume after the owner sets it. This is the expected, sanctioned pause, not a failure.
- The invite requires a NEW vendor or a domain/DNS verification the owner has not done (Resend sending domain unverified) - surface with the exact action needed.
- A self-service profile field needs a schema change (a `users` column is absent) - HALT with the finding; do not add a migration in this loop.
- Changing own password cannot be done through the existing Supabase auth path without weakening a security control - surface it.

## Field 7. Report back
Recon report, the migration-free diff, the invite-send + fallback proof, any env-var halt+resume record, the profile edit proof, the self-scope test, the audit proof, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12, standing for Wave 06):** GREEN self-merge permitted once ALL required checks are green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API, never the banner. The cross-browser lane no longer exists. This loop is migration-free -> GREEN self-merge. Workflow files are never touched. An env-var HALT pauses the loop for the owner and then resumes; it is not a merge. Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
