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

**Expected result:** the browser lands on
`https://app.osteojp.pt/auth/update-password`, which shows the set-password
screen. Not the portal. Not a `vercel.app` host.

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
