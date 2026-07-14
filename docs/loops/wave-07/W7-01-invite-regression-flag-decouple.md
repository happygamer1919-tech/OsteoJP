# Loop W7-01 - BUG: invite regression + INVITES_LIVE_SEND flag decoupling (Wave 07 Correcoes QA)

GATE: **Wave 07 Correcoes QA, BUG loop, DIAGNOSIS-FIRST.** On the deployed app, Administracao > Equipa > Convidar novo membro returns the generic "A operacao falhou. Tente novamente." and produces NO temporary password. Pre-W6 behaviour was "Nao foi possivel enviar o email de convite" PLUS a temp-password fallback. This is a W6-02 (#573) regression. **Read-only recon and a recorded root-cause finding are MANDATORY before any fix.** Expected migration-free. Runs FIRST in Wave 07. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Fix the invite regression so Convidar never surfaces the opaque generic failure, and **decouple the invite live-send from the reminder live-send** by introducing a dedicated `INVITES_LIVE_SEND` env flag independent of `REMINDERS_LIVE_SEND`. Diagnosis first: the root cause is recorded in this loop file before any code changes.

Ground truth (recon at authoring 2026-07-14, embed - executor runs with ZERO memory):
- **Observed on the deployed app (owner QA 2026-07-14):** Convidar novo membro fails with **"A operacao falhou. Tente novamente."** and shows **no temporary password**. That exact string is `admin.staff.error` (`packages/i18n/src/strings.pt.json:440` = "A operação falhou. Tente novamente."), i.e. the invite action hit its generic catch, NOT the invite-specific `inviteEmailFailed` + temp-password fallback UI.
- **The invite UI:** `apps/web/app/admin/staff/StaffInviteForm.tsx` (`inviteAction` via `useActionState`). It renders `s["admin.staff.inviteEmailSent"]` on a real send, `s["admin.staff.inviteEmailFailed"]` ("Nao foi possivel enviar o email de convite.") + the temp password on the fallback path, and the generic `admin.staff.error` only on a `{ ok: false, code: "error" }` result.
- **The invite action:** `apps/web/app/admin/staff/actions.ts` -> `inviteAction` (approx lines 16-33). It calls `inviteStaff(actor, ...)`, returns `{ ok: true, delivery: "email" }` or `{ ok: true, delivery: "temp_password", tempPassword }`, and in its `catch` returns `{ ok: false, code: isAdminError(e) ? e.code : "error" }`. **Any non-`AdminError` thrown by `inviteStaff` becomes `code: "error"` -> the generic message, with no temp password** (the temp password only rides on the `ok: true` result, which is never reached when a throw escapes).
- **The invite service:** `apps/web/lib/admin/staff.ts` -> `inviteStaff` (approx lines 98-162). Order: capability + owner-tier gating -> idempotency pre-check -> `provisionStaffUser` (the privileged Supabase auth-user creation, approx lines 129-141, wrapped in try/catch that maps a unique-violation to `already_invited` and **re-throws everything else**) -> `generateSetPasswordLink` + `sendEmail` (approx lines 145-157, **guarded by their own try/catch that sets `send = null` on any failure**) -> `inviteDeliveryFromSend(send)` (approx lines 77-81) returns `email` only for a real live delivery, else `temp_password`.
- **The delivery decision:** `inviteDeliveryFromSend(send)` returns `email` only when `send && !send.sandbox`; a sandbox/suppressed send OR a caught send failure (`send === null`) both yield `temp_password` and the temp password is returned. So a **send failure is already handled gracefully** - it does NOT throw. The only unguarded throw in `inviteStaff` is the `provisionStaffUser` re-throw path.
- **The provisioning path:** `apps/web/lib/auth/provision.ts` -> `provisionStaffUser` (approx line 21) calls `admin.auth.admin.createUser` (approx line 39); `generateSetPasswordLink` (approx line 115) calls `admin.auth.admin.generateLink` (approx line 119). Both use the privileged Supabase admin client. Recon must confirm exactly where the throw that reaches `inviteAction`'s generic catch originates (see candidates).
- **The current live-send gate (the coupling):** `sendEmail` lives in `apps/web/lib/reminders/clients.ts`; `liveSendEnabled()` (approx line 45) returns `process.env.REMINDERS_LIVE_SEND === "true"`. Invites therefore ride the SAME global switch as appointment reminders. This is recorded in **QUESTIONS Q-W6-02-1**, which already flags that going live on invites without live reminders "needs a small follow-up code change to decouple the invite gate." **This loop is that decoupling.**
- **pre/post regression framing:** pre-W6 the invite always used the temp-password hand-off and showed `inviteEmailFailed` + the password. W6-02 (#573) wired the real Resend send. The regression is that some W6-02-introduced path now throws before the temp-password result is returned, collapsing to the generic error. Diagnosis-first confirms which path.

**Candidate causes to investigate (recon each, record a verdict per candidate in the appendix):**
1. **`provisionStaffUser` throws (PRIME).** The privileged `admin.auth.admin.createUser` (or the admin-client construction it depends on) throws when a required env is absent/misconfigured in the deployed environment (e.g. the Supabase service-role key or the public app/redirect URL used to build the admin client), re-thrown at `staff.ts` ~140, coerced to `code: "error"` at `actions.ts` ~32 -> generic message, no temp password. Recon: reproduce with the provisioning env deliberately absent and capture the thrown error (PII-free, never print a key).
2. **`generateSetPasswordLink` / `sendEmail` escape the guard.** These are inside a try/catch (`send = null` on failure), so a failure there SHOULD yield the temp-password fallback WITH the password. Recon: confirm the guard actually catches (including any synchronous throw at client construction), i.e. that this path is NOT the source of the no-temp-password symptom. If a throw does escape the guard, that is a real defect to fix.
3. **A module-load / import-time throw** in the Resend or Supabase-admin client (constructed at import when an env is absent) that bypasses the in-function guards. Recon: confirm whether any client is constructed at module scope vs lazily inside the guarded block.
4. **`inviteDeliveryFromSend` mislabels a sandbox send as a hard failure** upstream (unlikely per the code, but confirm the sandbox path returns the temp password rather than raising).

**Required behaviour after fix (all three, verified):**
- **(a) Resend env ABSENT (or `INVITES_LIVE_SEND` not `true`):** the invite **succeeds via the temp-password path** - the auth user is created, and the pt-PT UI displays the temporary password and clearly states the email was not sent. Never the generic failure.
- **(b) Resend env PRESENT and `INVITES_LIVE_SEND=true`:** a real invite email sends (the `email` delivery path), no temp password shown.
- **(c) Email send FAILS at runtime (transient send error with live-send on):** graceful fallback to the temp-password path with the same clear "email not sent, here is the temporary password" message. Never the generic failure.

**Flag decoupling (mandatory):**
- Introduce a dedicated env flag **`INVITES_LIVE_SEND`** that gates invite emails, **fully independent from `REMINDERS_LIVE_SEND`**. Invite live-send is on only when `INVITES_LIVE_SEND === "true"` (exact string, same convention as the reminder gate). **Reminder behaviour is unchanged**: `REMINDERS_LIVE_SEND` continues to gate appointment reminders and only reminders; do not repurpose or widen it.
- Recon whether the cleanest seam is a dedicated invite-send helper (an invite-scoped `liveSendEnabled` reading `INVITES_LIVE_SEND`) rather than the reminder `sendEmail`, so the two switches never share state. Keep Resend as the single email vendor (in-stack; not a new vendor).
- **Document the exact env set for live invites** in this loop file (the "Root-cause finding + live-invite env set" appendix below) AND in `docs/design/QUESTIONS.md` (extend/relate to Q-W6-02-1): `RESEND_API_KEY`, `REMINDERS_EMAIL_FROM` (the verified osteojp.pt sender/from address), `INVITES_LIVE_SEND=true`, and the **osteojp.pt domain-verification prerequisite in Resend**. **Names only - never print an env VALUE or a secret.**

**Regression tests (mandatory):** (i) the **env-absent path** - invite succeeds via temp-password, message states email not sent, temp password present, NO generic error; (ii) the **send-failure fallback path** - live-send on but the send throws at runtime -> temp-password fallback with the clear message; (iii) the **env-present path (mocked)** - live-send on + a mocked successful Resend send -> `email` delivery, no temp password; (iv) an assertion that **`INVITES_LIVE_SEND` and `REMINDERS_LIVE_SEND` are independent** (toggling one does not change the other's behaviour).

**Scope:** diagnosis-first root-cause finding; the minimal fix so Convidar never returns the generic failure and always reaches (a)/(b)/(c); introduce `INVITES_LIVE_SEND` decoupled from `REMINDERS_LIVE_SEND` (reminders unchanged); the four regression tests; QUESTIONS + loop-file documentation of the live-invite env set (names only). Migration-free. pt-PT i18n (both files) for any new/reworded copy.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w7-01-invite-regression origin/main -b osteojp-w7-01-invite-regression`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **RECON, record BEFORE any fix (mandatory):** reproduce the generic-failure invite on the dev/preview environment (synthetic data), capture the exact thrown error / server log (PII-free, no secret values). Walk all four candidate causes; for EACH record a verdict (root cause / contributing / ruled out) with evidence. Trace the throw from `inviteAction`'s generic catch back to its origin. **Write the root-cause finding into this loop file's "Root-cause finding" appendix (below) in the PR.** No code changes yet.
3. **Fix the root cause** with the minimal change so the invite reaches behaviour (a)/(b)/(c) and NEVER the generic failure. Do not weaken any auth/security control; if provisioning genuinely cannot create the user, that is a distinct, specific error (not the generic mask), but the target state is that env-absence yields the temp-password success path.
4. **Decouple the flag:** introduce `INVITES_LIVE_SEND` gating invite emails only, independent of `REMINDERS_LIVE_SEND`. Reminder behaviour byte-for-byte unchanged. Keep Resend as the sole vendor.
5. **Messaging:** ensure the temp-password fallback message clearly states the temporary password AND that the email was not sent (reuse/reword existing `admin.staff.*` keys; pt-PT + en). Remove the generic-fallback masking for the known invite outcomes.
6. **Regression tests:** the four tests above (env-absent success, send-failure fallback, env-present mocked send, flag independence). Each must fail on pre-fix behaviour where applicable and pass post-fix.
7. **Document the env set:** append the exact live-invite env names to the appendix below and to `docs/design/QUESTIONS.md` (relate to Q-W6-02-1). Names only; never a value.
8. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation + the four regression tests + the existing reminder tests proving reminders are unchanged), `pnpm build`, `pnpm test:e2e` (Convidar on the env-absent path shows the temp password + "email not sent", never the generic error; the mocked live path shows the sent state). JSON.parse both i18n files in the gate.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Root-cause finding pasted** in the appendix below: the reproduction, the per-candidate verdicts, and the identified root cause with evidence (PII-free, no secret values).
- **Behaviour PROOF (a):** env-absent (or `INVITES_LIVE_SEND` off) -> invite succeeds, temp password shown, message states email not sent, NO generic error. Paste it (never print the temp password value; fingerprint only).
- **Behaviour PROOF (b):** env-present + `INVITES_LIVE_SEND=true` + mocked send -> real email sends (`email` delivery), no temp password. Paste the mocked-send assertion (no secret printed).
- **Behaviour PROOF (c):** live-send on + a runtime send failure -> temp-password fallback with the clear message, NO generic error. Paste it.
- **Flag-decoupling PROOF:** `INVITES_LIVE_SEND` gates invites and `REMINDERS_LIVE_SEND` gates reminders, independently; paste the independence test and the passing existing reminder tests (reminders unchanged).
- **Env-set documentation PROOF:** the live-invite env names (`RESEND_API_KEY`, `REMINDERS_EMAIL_FROM`, `INVITES_LIVE_SEND=true`, osteojp.pt domain-verification prerequisite) are recorded in the appendix below AND in QUESTIONS (relating to Q-W6-02-1). Paste the QUESTIONS entry. **No env VALUE anywhere.**
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report + root-cause finding, the migration-free diff, the (a)/(b)/(c) behaviour proofs, the flag-decoupling + reminders-unchanged proof, the QUESTIONS env-set entry, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Diagnosis-first:** no fix commit before the root-cause finding is recorded in the appendix below.
- **`REMINDERS_LIVE_SEND` behaviour is NEVER changed;** reminders continue to work exactly as before. `INVITES_LIVE_SEND` is a NEW, independent gate for invites only.
- **Resend is the single email vendor** (in-stack). Do not add any other email vendor.
- **Env vars:** never stub, hardcode, or invent a key/value; if a Vercel env var is the only blocker for the live path, HALT with the EXACT name + target project (osteojp-platform) and let the owner set it (human-only setup). **Never print a secret VALUE** (rule 7); names only.
- **No auth/security control is weakened** to make the invite succeed. Own-account and privilege gating unchanged.
- **Migration-free expected;** if a needed column/schema change surfaces, HALT rather than add a migration here. DB access only through `packages/db`. Audit mutations (rule 6).
- pt-PT i18n (both files, keep-both on rebase, JSON.parse both in the gate); no emoji; UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. SYNTHETIC-DATA-ONLY for verify.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- The root cause requires a **migration** or a schema change to fix - HALT with the finding; do not author a migration here (one-migration-in-flight + OWNER-MERGE would apply to a follow-up).
- Making the invite reach the temp-password success path would require weakening an auth/security control - surface it, never bypass (instant escalation).
- A required Vercel env var is the only blocker for the live-invite path - HALT with the EXACT name + target project (osteojp-platform); the owner sets it, then resume. This is the sanctioned pause, not a failure.
- Recon cannot reproduce the generic failure at all (deployed state already changed) - HALT with the recon evidence and a recommended default (proceed on the PRIME candidate `provisionStaffUser` throw with a regression test that locks the required (a)/(b)/(c) behaviour).

## Field 7. Report back
Recon report + recorded root-cause finding, the migration-free diff, the (a)/(b)/(c) behaviour proofs, the flag-decoupling + reminders-unchanged proof, the QUESTIONS env-set entry, suite counts, PR number.

## Root-cause finding + live-invite env set (executor fills this appendix in the PR before the fix commit)

**Root-cause finding (recorded 2026-07-14, before the fix commit):**

**Correction to this loop file's ground truth (Field 1, para "pre/post regression framing").** The loop states the regression was introduced by W6-02 (#573), which "wired the real Resend send". That is **false**. `git show --stat 130d0a4` ("W6-02: self-service profile page; invite email is env-only (#573)") shows #573 touched **zero** invite-path files:

```
apps/web/app/perfil/{actions.test.tsx,actions.ts,layout.tsx,page.tsx,profile-client.tsx}
apps/web/components/app-shell.tsx
apps/web/e2e/profile.spec.ts
docs/design/{DECISIONS.md,QUESTIONS.md}
packages/i18n/src/strings.{en,pt}.json
```

`git log -- apps/web/lib/admin/staff.ts apps/web/lib/auth/provision.ts apps/web/app/admin/staff/actions.ts` shows the invite path was last touched by **#516**, and the Resend send was wired in **#110** (`ac714bf feat(#3): email invite/set-password`), long before Wave 06. The generic-failure defect is therefore **latent and pre-existing**, not a W6-02 regression. What changed is the deployed *environment/data* state, not the invite code. The required deliverable ((a)/(b)/(c) + flag decoupling) is unaffected by this correction.

**Reproduction (PII-free, no secret values).** A scratch vitest harness drove `inviteStaff` with its collaborators mocked, replicating `actions.ts:32` (`isAdminError(e) ? e.code : "error"`). Verbatim output:

```
[repro:env-absent-admin-client]      thrown: Error | state: {"ok":false,"code":"error"}
[repro:auth-email-already-registered] thrown: Error | state: {"ok":false,"code":"error"}
[cand2:send-throws]        delivery: temp_password | tempPassword present: true
[cand2:link-throws]        delivery: temp_password | tempPassword present: true
[cand2:env-absent-resend]  delivery: temp_password | tempPassword present: true
[cand4:live-send]          delivery: email         | tempPassword present: false
[coupling] liveSendEnabled reads: REMINDERS_LIVE_SEND
Tests  7 passed (7)
```

`code: "error"` renders `admin.staff.error` = "A operação falhou. Tente novamente." (`strings.pt.json:440`) - the exact string the owner observed - and no temp password, because `tempPassword` only rides the `ok: true` result.

- **Candidate 1 (`provisionStaffUser` throws): ROOT CAUSE (confirmed).** `provisionStaffUser` raises **plain `Error`s** at three sites: role-not-found (`provision.ts:35`), admin-client env absent (`supabase/admin.ts:10`, thrown from the unguarded `createSupabaseAdminClient()` call at `provision.ts:38`), and auth `createUser` failure (`provision.ts:45`). `inviteStaff` re-throws anything that is not a PG unique violation (`staff.ts:140`), and `inviteAction` maps every non-`AdminError` to `code: "error"` (`actions.ts:32`). Both repro lines above confirm the collapse to the generic mask with no temp password.
- **Candidate 2 (`generateSetPasswordLink` / `sendEmail` escape the guard): RULED OUT.** The `staff.ts:146-157` try/catch holds in all three sub-cases: a `sendEmail` runtime throw, a `generateSetPasswordLink` throw, and a Resend-env-absent sandbox return all yield `delivery: temp_password` **with** the password. `generateSetPasswordLink` additionally never throws (returns `null`, `provision.ts:126`). No defect here.
- **Candidate 3 (module-load / import-time client throw): RULED OUT.** `grep -rn "new Resend\|createClient(\|createSupabaseAdminClient()" apps/web/lib/` shows every client is constructed **inside a function body**; `Resend` is `await import`ed lazily on the live branch only (`clients.ts:82-83`). No module-scope construction exists to bypass the in-function guards.
- **Candidate 4 (`inviteDeliveryFromSend` mislabels sandbox): RULED OUT.** A sandbox send returns `temp_password` **with** the password; only a live non-sandbox send returns `email`. The pure function behaves as specified and never raises.

**Identified root cause.** `inviteStaff` leaks raw, unclassified `Error`s from the provisioning step, and `inviteAction` masks every unclassified error as the generic `code: "error"`, discarding the temporary password. Any provisioning failure therefore presents to the owner as "A operação falhou. Tente novamente." with no recovery path. The **two provisioning failures that fire on a live deployment** are:

1. **Supabase auth already holds the email.** Auth emails are unique **platform-wide**, but the invite's idempotency pre-check (`staff.ts:120-125`) only queries the tenant's `users` table. `deleteStaffMember` (`staff.ts:467`) deletes the `users` row but **never deletes the Supabase auth user** - it has no `admin.auth.admin.deleteUser` call. So any email that was invited once and later deleted leaves an **orphaned auth user**: re-inviting it passes the pre-check, then `createUser` returns "already registered", which becomes a raw `Error` -> the generic mask. This failure is **permanent and repeatable** for that email, which matches the owner's report of an invite that used to work and now always fails.
2. **`SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` absent or misconfigured** on `osteojp-platform`, making the unguarded `createSupabaseAdminClient()` throw. Login is unaffected (it uses the anon/SSR client), so the app looks healthy while every privileged invite fails.

Deployed logs and Vercel env names were **not** readable from this session (the authenticated Vercel CLI account has no OsteoJP projects), so the two are not distinguished from here. **They do not need to be:** both are provisioning failures, both are fixed by the same change, and the loop already rules that a genuine provisioning failure must surface as "a distinct, specific error (not the generic mask)" (Field 1, step 3).

**Fix summary (migration-free).**
1. **Classify provisioning failures.** `provisionStaffUser` now throws typed `AdminError`s instead of plain `Error`s: `auth_email_taken` when Supabase auth already holds the email (detected on the auth error `code`/`status`, not on message text), and `provisioning_unavailable` for a missing admin-client env, a missing tenant role, or any other auth-API failure. `createSupabaseAdminClient()` is called inside a guard. All messages stay PII-free (rule 7).
2. **Remove the generic mask for known invite outcomes.** Every failure `inviteStaff` can produce is now an `AdminError` with a specific pt-PT message; `code: "error"` remains only for a genuinely unknown throw. No auth or security control is weakened: a provisioning failure still fails the invite, it just says why.
3. **Decouple the flag.** New `apps/web/lib/invites/email.ts` owns `invitesLiveSendEnabled()` (reads `INVITES_LIVE_SEND` only) and `sendInviteEmail()`. `apps/web/lib/reminders/clients.ts` is **not modified**, so `REMINDERS_LIVE_SEND` behaviour is byte-for-byte unchanged and the two switches share no state. Resend remains the single vendor.
4. **Messaging.** `admin.staff.inviteEmailFailed` is reworded to "O email de convite não foi enviado." so it is accurate for both the not-attempted (live-send off) and the send-failed cases; the temp password is shown alongside it in both.
5. **Out of scope, escalated.** Deleting the orphaned Supabase auth user in `deleteStaffMember`, or adopting an orphaned auth user on re-invite, is a **product + security decision** and is NOT self-decided here. Logged to `docs/design/QUESTIONS.md` as **Q-W7-01-1** with a recommended default. After this fix that case surfaces as a clear `auth_email_taken` message instead of the generic mask.

**Live-invite env set (names only, never a value):**
- `RESEND_API_KEY` (Vercel osteojp-platform) - _the Resend API key_
- `REMINDERS_EMAIL_FROM` (Vercel osteojp-platform) - _the verified osteojp.pt from/sender address_
- `INVITES_LIVE_SEND=true` (Vercel osteojp-platform) - _the NEW invite-only live-send switch, independent of `REMINDERS_LIVE_SEND`_
- Prerequisite: the **osteojp.pt sending domain must be verified in Resend** before real delivery. Until then, invites stay on the temp-password path (behaviour (a)).

**Merge policy (Wave 07 Correcoes QA, standing):** GREEN self-merge permitted once ALL required checks are green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API, never the banner. This loop is migration-free -> GREEN self-merge; if a migration surfaced it HALTED to a follow-up OWNER-MERGE loop with live-apply evidence. Workflow files are never touched. An env-var HALT pauses the loop for the owner and then resumes; it is not a merge. Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
