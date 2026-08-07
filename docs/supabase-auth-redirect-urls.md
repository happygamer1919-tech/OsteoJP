# Supabase Auth URL configuration — staff recovery landed on the patient portal

**Defect, observed 2026-08-06:** a STAFF password recovery redirected to
`https://osteojp-portal.vercel.app`. Wrong twice over: it is the patient portal,
not the staff app, and it is the raw Vercel host rather than a product domain.

**Status:** root cause found in committed code. Fix is one env var plus two
dashboard fields. Not yet applied.

---

## 1. Root cause, from the code and not from a guess

`apps/web/lib/auth/provision.ts:219-232`:

```
const redirectTo = process.env.STAFF_INVITE_REDIRECT_URL;
const { data, error } = await admin.auth.admin.generateLink({
  type: "recovery",
  email,
  ...(redirectTo ? { options: { redirectTo } } : {}),
});
```

`STAFF_INVITE_REDIRECT_URL` **is not set anywhere.** It appears in exactly two
places in the whole repository: the line above, and a note in
`docs/QUESTIONS.md:736`. It was in no `.env.example` until this change added it.

When it is unset, the spread contributes nothing, `generateLink` is called
without `redirectTo`, and Supabase falls back to the project's **Site URL**. The
file says so itself at line 216-217: *"When the env var is unset, Supabase uses
the project's configured Site URL."*

So the Site URL is currently the patient portal, and the staff flow inherits it.

**This is the only redirect the codebase requests.** A repo-wide search for
`redirectTo`, `emailRedirectTo` and `redirect_to` across `apps/` and `packages/`
returns that one call site and nothing else. Every other Supabase auth mail flow
falls back to the Site URL — and after LOOP 3 there are no other live ones:
`signInWithOtp` and `resetPasswordForEmail` both have zero callers, and patient
auth runs on SMS OTP through our own transport.

---

## 2. The host layout, derived from the repo

| Host | App | Status |
|---|---|---|
| `app.osteojp.pt` | `apps/web`, staff platform | **live** on `cname.vercel-dns.com` (`docs/SPEC.md:269`) |
| `api.osteojp.pt` | `apps/api`, patient API | **live** (same line) |
| `patient.osteojp.pt` | `apps/portal`, patient portal | **NOT LIVE** — "the only host still unresolved" (`docs/SPEC.md:269`, `:55`) |
| `send.osteojp.pt` | Resend sending identity | live, verified |

Landing routes, from the route tree:

| Flow | Route | Absolute URL |
|---|---|---|
| Staff set/reset password | `apps/web/app/auth/update-password` | `https://app.osteojp.pt/auth/update-password` |
| Patient set password (residue) | `apps/api/app/auth/set-password` | `https://api.osteojp.pt/auth/set-password` |
| Portal login | `apps/portal/app/auth/login` | no Supabase mail flow reaches it |

---

## 3. What the Site URL should be, and why it is the staff app

The Site URL is the **fallback** for any flow that does not pass its own
`redirect_to`. One Supabase project serves three apps, so no single Site URL is
right for all of them — which is the actual defect, and why the durable fix is to
stop relying on it.

Set it to the **staff platform**, on this reasoning:

- Staff recovery is the **only** Supabase-sent mail flow that is live. Patient
  auth is SMS OTP; the portal sends no Supabase mail at all.
- A fallback that lands on the staff app is correct for the only flow that uses
  it. A fallback that lands on the patient portal is the reported defect.
- `patient.osteojp.pt` does not resolve, so it must **not** be set as the Site
  URL. Setting a host that does not exist would replace one broken redirect with
  a dead one.

The portal does not need to be in the redirect allowlist at all today. Nothing
generates a Supabase link to it.

---

## 4. Apply it — Vercel first, then Supabase

Order matters: the env var is the durable fix, and the allowlist is what stops
Supabase refusing it.

### Step 1 — Vercel (project `osteojp-platform`, which is `apps/web`)

1. Open the Vercel dashboard, project **osteojp-platform**.
2. Settings, then Environment Variables.
3. Add a variable:
   - Name: `STAFF_INVITE_REDIRECT_URL`
   - Value: `https://app.osteojp.pt/auth/update-password`
   - Environments: Production. Add Preview too only if you want to test invites
     on a preview deployment, and see the STOP conditions below first.
4. Save. **Redeploy** the project. An env var added after a build is not visible
   to the running deployment until it is redeployed.

### Step 2 — Supabase dashboard, production project

1. Open the Supabase dashboard for the production project.
2. Authentication, then URL Configuration.
3. **Site URL** — replace whatever is there with exactly:

   `https://app.osteojp.pt`

   No trailing slash, no path.
4. **Redirect URLs** — the allowlist. Make sure it contains exactly this entry:

   `https://app.osteojp.pt/auth/update-password`

   Remove any entry pointing at `osteojp-portal.vercel.app` or any other raw
   `vercel.app` host. Leave any entry you do not recognise in place and report
   it rather than deleting it.
5. Save.

### Step 3 — verify, and it is one email

1. In the Supabase dashboard, trigger a password recovery for your own staff
   address.
2. Open the email and click the button.

**Expected result, corrected 2026-08-06 after the first verification:** the
browser lands on **`https://app.osteojp.pt`** — the Site URL root — carrying the
result in the URL hash (`#access_token=...&type=recovery`). It does **not** land
on `/auth/update-password`.

This document originally promised the set-password screen here. **That was
wrong**, and the correction matters more than the wording: a
**dashboard-triggered** recovery does not use `STAFF_INVITE_REDIRECT_URL` at all.
That variable is read only by `provision.ts:222`, which serves the in-product
staff-invite path. The dashboard trigger has no `redirect_to` of its own, so it
falls back to the Site URL — which is exactly the fallback this whole document
was written to make correct.

**What you should see is therefore the LOGIN page, and that is a defect, not a
pass.** The root route is a server component (`apps/web/app/page.tsx`) that
redirects to `/login`; neither route reads the hash. See section 7.

**What is genuinely fixed and can be asserted:** the link's `redirect_to` is
`https://app.osteojp.pt`. No portal, no `vercel.app` host. That was the original
defect and it is closed.

---

## 5. STOP conditions

Stop and report rather than working around any of these.

- **The link still lands on the portal.** The allowlist entry does not match, so
  Supabase discarded the redirect and fell back to the Site URL. Do not edit the
  Site URL to compensate. Send the exact URL you landed on.
- **Supabase shows a "redirect not allowed" error.** The env var value and the
  allowlist entry disagree, character for character, including the trailing
  slash. Send both values.
- **`app.osteojp.pt` does not load.** That is a DNS or Vercel domain problem and
  nothing here fixes it. Stop.
- **You are tempted to add a wildcard** such as `https://*.vercel.app/**`. Do
  not. An auth redirect allowlist is a security boundary: a wildcard over
  preview hosts lets any preview deployment receive a recovery token. If you
  need preview testing, add the one specific preview URL, and remove it after.
- **Any entry you do not recognise is already in the allowlist.** Do not delete
  it. Report it — an unexplained redirect entry on an auth project is worth
  understanding before it is removed.

---

## 6. What this does not fix

`apps/api/app/auth/set-password` still exists as a patient-side residue from
before Decision D. No Supabase flow currently links to it, so it needs no
allowlist entry, but it is dead surface on an auth path. Tracked separately as
`LE-portal-supabase-residue`.

---

## 7. OPEN DEFECT — dashboard recovery dead-ends (found by the verification)

**Symptom, reproduced twice on fresh tokens:** the recovery link lands on
`https://app.osteojp.pt` with the recovery hash, the login page renders, and no
set-password screen is ever offered. The link cannot be reused.

**Mechanism, from the code — and the usual description of it is wrong.** The
token is not consumed by our app. Supabase's `/auth/v1/verify` endpoint consumes
the single-use token **server-side, before redirecting**, and hands the resulting
session material to the browser in the URL **fragment**. A fragment is never sent
to a server. So:

1. `apps/web/app/page.tsx` is a server component: it calls `getRequestContext()`,
   finds no session cookie, and redirects to `/login`. The fragment survives the
   redirect (RFC 7231) but the server never saw it.
2. `apps/web/app/login/page.tsx` is a client component but creates **no** Supabase
   browser client — it posts to a server action. Nothing reads the fragment.
3. The fragment is discarded on the next navigation. The link is already spent, so
   retrying it returns `otp_expired`.

`apps/web/app/auth/update-password/UpdatePasswordClient.tsx` is the one route that
handles this correctly, and its header documents the exact fragment shape it
expects. The flow never reaches it.

### Immediate stopgap — one dashboard field, zero code

Staff recovery is the **only live recovery path** and it is currently dead, so
this is worth doing before the code fix ships.

1. Supabase dashboard, Authentication, URL Configuration.
2. Change **Site URL** to exactly:

   `https://app.osteojp.pt/auth/update-password`

3. Save. **No allowlist change is needed** — that exact URL is already in the
   Redirect URLs list.

The dashboard trigger then falls back to the route that already reads the hash.

**Why this is a stopgap and not the fix:** the Site URL is the fallback for
*every* flow that passes no `redirect_to`. Today that is only staff recovery, so
pointing it at the set-password screen is correct. The moment a second such flow
exists (an email-change confirmation, say), it would land on a set-password
screen and be wrong. The durable fix is below.

### The durable fix — on a branch, after #830 merges

Mount a hash guard in `apps/web/app/login/page.tsx`, which is already
`"use client"`. On mount, if `location.hash` carries `type=recovery` or
`error_code=`, `router.replace("/auth/update-password" + location.hash)`.

Small, contained, and it makes **any** future misrouting self-correcting rather
than depending on one dashboard field staying set. Once it ships, the Site URL
can go back to `https://app.osteojp.pt` — or stay as-is harmlessly.

Do **not** attempt to read the fragment on the server. It is never transmitted.

---

## 8. RULING — remove `https://patient.osteojp.pt/**` from the allowlist

That entry predates this work and Ivan correctly left it in place, because
section 5 says unrecognised entries are reported rather than deleted.

**Its provenance is now known**, so that rule no longer applies: it dates from
when the portal used Supabase magic links, which LOOP 3 removed. **Remove it.**

Three reasons, and the third is why it is not merely tidy-up:

1. **Nothing links to it.** `signInWithOtp` and `resetPasswordForEmail` both have
   zero callers; patient auth is SMS OTP through our own transport.
2. **The host does not resolve.** `patient.osteojp.pt` is the one unwired domain
   (`docs/SPEC.md:269`), so the entry protects no working flow.
3. **It is a wildcard on an auth boundary.** `/**` authorises every path under a
   host that does not exist today. If that name is ever pointed anywhere — a
   future deploy, a misconfiguration, a lapsed record picked up by someone else —
   every path under it silently becomes a valid destination for a recovery token.
   An allowlist entry for a host you do not control is the worst shape an auth
   redirect entry can take.

**Cost of removing: none today.** If the portal ever needs Supabase auth mail
again, add the one specific path it needs at that point, never a wildcard.

**Instruction for Ivan, one line:** in the Supabase dashboard under
Authentication, URL Configuration, Redirect URLs, delete the entry
`https://patient.osteojp.pt/**` and save.


---

## 9. FIXED 2026-08-07 — the link itself changed shape, and what Ivan must re-paste

The dead end in section 7 is closed at the source. **The emailed link no longer
goes to Supabase's `/auth/v1/verify`.**

### What changed

| Before | After |
|---|---|
| `{{ .ConfirmationURL }}` → Supabase `/auth/v1/verify` → redirect here with the result in the URL **fragment** | `https://app.osteojp.pt/auth/update-password?token_hash={{ .TokenHash }}&type=recovery` |
| **Fetching the link spends the token.** A mail-provider scanner does exactly that | **Fetching the link spends nothing.** The page renders and verifies nothing |
| The page read only `window.location.hash` | The page reads the **query**, which auth-js does not touch |
| `verifyOtp` never ran | `verifyOtp` runs **only from the explicit submit** |

The shape is copied from `apps/web/app/r/[token]/page.tsx`, which has been
prefetch-safe since the reminder lane shipped. The auth lane never adopted it,
and that is the whole of this incident.

**It is stricter than Supabase's own recommended pattern, deliberately.** Their
sample verifies on the GET and redirects; a scanner following the link to *our*
domain would then spend the token here instead. Same failure, one hop later.

### THE LANDING URL IS HARDCODED IN THE TEMPLATES, and that is the point

Not `{{ .RedirectTo }}`. That variable is populated only when the caller passed a
`redirect_to`, and **a dashboard-triggered recovery passes none** — it would
render empty and break the link. One variable that is set on one trigger path and
empty on another is the exact conflation section 3 corrects. Hardcoding removes
the variable.

**If the app domain ever changes, both templates change with it and must be
re-pasted.**

### What Ivan re-pastes, and it is only these two

Supabase dashboard → **Authentication → Emails**. Paste the file contents over
the existing template:

- [ ] **Reset Password** ← `supabase/templates/reset-password.html`
- [ ] **Invite user** ← `supabase/templates/invite.html`

**No other template changed.** `change-email.html`, `confirm-signup.html`,
`magic-link.html` and `reauthentication.html` are untouched — do not re-paste
them.

**No Site URL change and no allowlist change is needed.** The Site URL may stay
at `https://app.osteojp.pt/auth/update-password` (the section 7 stopgap) or
return to the root; neither matters now, because the link carries its own
absolute destination and no longer depends on a fallback.

### Verification — one email, in a real inbox

The scanner is the thing under test, so no local harness reproduces it.

1. Trigger a password recovery to a **real Gmail address**.
2. **Leave it sitting for a few minutes** so the provider has scanned it. This
   step is the test; clicking immediately proves nothing.
3. Open the link. The **set-password form** must render — not "Ligação inválida".
4. Set a password and sign in with it.

If it fails, the error screen now carries a **"Detalhes técnicos"** disclosure
naming exactly what arrived on the URL, with token and session values redacted to
a length. The old screen erased that evidence before a human could read it, which
is why five verification rounds produced no diagnosis.
