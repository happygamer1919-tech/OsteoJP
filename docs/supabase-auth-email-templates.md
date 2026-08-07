# Supabase Auth email templates — pt-PT

**Status:** bodies authored and committed. **Not yet applied** — applying them is
an owner-terminal edit in the Supabase dashboard, which no PR can review and no
deployment carries.

**Committed source of truth:** `supabase/templates/*.html`
**Guard:** `apps/web/lib/auth/supabase-email-templates.test.ts` (34 assertions)

---

## 1. What is actually broken, re-derived rather than assumed

The card that opened this work (`LE-supabase-auth-templates-ptpt`) recorded two
patient-facing callers of Supabase auth mail, and predicted that LOOP 3 would
remove them. **LOOP 3 has landed (#828), and it did.** A repo-wide search on
2026-08-06 returns:

| Trigger | Callers on `main` | Sends Supabase mail? |
|---|---|---|
| `signInWithOtp` (magic link) | **zero** | — removed by LOOP 3 |
| `resetPasswordForEmail` | **zero** | — removed by LOOP 3 |
| `signInWithPassword` (staff, `apps/web` + `apps/admin`) | present | no, never sends mail |
| `admin.createUser` (`lib/auth/provision.ts:72,157`) | present | no — `email_confirm: true` |
| `admin.updateUserById` (`lib/auth/provision.ts:195`) | present | no — `email_confirm: true` |
| `admin.generateLink({type:"recovery"})` (`lib/auth/provision.ts:223`) | present | **no** — it RETURNS a link; `lib/admin/staff.ts:213` mails it through Resend with our own pt-PT body |
| `auth.updateUser({data})` (`apps/portal/.../account/actions.ts:131`) | present | no, metadata only |
| `auth.updateUser({password})` (`apps/web/app/perfil`, `auth/update-password`) | present | no, authenticated session |

**So no code path in this repo currently causes Supabase to send an email.**
That is a correction to the card, not a reason to close it. Two live exposures
remain, and both are the reason the bodies are authored now:

1. **The Supabase dashboard itself.** Staff password recovery today runs from
   the dashboard, not from a product screen (the card says so, and it is still
   true). A reset triggered there renders the project's template — English, on
   a pt-PT product, to a real staff member.
2. **Any future re-enable.** The moment someone calls `resetPasswordForEmail`
   again, English goes out with no warning and no gate. Bodies that are already
   correct make that a non-event.

---

## 2. The six templates

GoTrue has exactly six. All six are written, because translating five leaves a
gap nobody notices until it fires.

| Dashboard template | File | Subject to set |
|---|---|---|
| Confirm signup | `supabase/templates/confirm-signup.html` | `Confirme o seu endereço de email` |
| Invite user | `supabase/templates/invite.html` | `Convite para a plataforma OsteoJP` |
| Magic Link | `supabase/templates/magic-link.html` | `A sua ligação de acesso` |
| Change Email Address | `supabase/templates/change-email.html` | `Confirme a alteração de endereço de email` |
| Reset Password | `supabase/templates/reset-password.html` | `Redefinir a palavra-passe` |
| Reauthentication | `supabase/templates/reauthentication.html` | `Código de confirmação` |

**Variables.** Five templates interpolate `{{ .ConfirmationURL }}`.
Reauthentication interpolates `{{ .Token }}` instead — it is a code, not a link,
and a `ConfirmationURL` there renders empty. Change Email additionally names both
`{{ .Email }}` and `{{ .NewEmail }}`, so the recipient can see which swap they
are approving.

**Accented characters are HTML entities** (`n&atilde;o`, not `não`). Between the
dashboard editor and older mail clients there are too many ways to mangle a raw
UTF-8 byte; an entity survives all of them. The guard test decodes before it
asserts on prose, so the encoding is not what is being tested.

**Tone and brand.** Serious, precise, not warm. No emoji (asserted). Teal
`#45B9A7` rule above the wordmark, magenta `#8B1863` on the fallback link, grey
`#98B2C2` footer with the three clinic names.

---

## 3. Applying them (owner terminal, Supabase dashboard)

No terminal in this repo may write to a Supabase console, so this is Ivan's to
do. It takes one pass.

For each of the six rows in the table above:

1. Open the Supabase dashboard for the production project, then
   **Authentication → Emails → Templates**.
2. Select the template named in the first column.
3. Replace the **Subject heading** with the subject in the third column, exactly.
4. Open the committed file in the second column, select the whole file, and
   paste it over the entire message body.
5. Save.

Then check the sender once, under **Authentication → Emails → SMTP Settings**:

- Sender email: `no-reply@send.osteojp.pt`
- Sender name: `OsteoJP`

`send.osteojp.pt` is the verified Resend identity — the root domain is not
verified for sending, so a sender on `osteojp.pt` would fail. See
`apps/web/lib/invites/email.ts:38`.

**Verification, and it is one email.** Trigger a password recovery from the
dashboard for your own address and read what arrives. Portuguese subject,
Portuguese body, teal rule, `no-reply@send.osteojp.pt` as sender, and the link
lands on the set-password screen. That is the whole acceptance check.

---

## 4. The drift nobody can close from here

The dashboard is the only place these bodies actually live. `supabase/templates/`
is a committed copy of what the dashboard *should* hold, and nothing in this repo
can read the dashboard to confirm it does. The guard test keeps the committed
copy honest; it cannot keep the dashboard honest.

The one mitigation that exists: after applying, the recovery email in section 3
is the proof. Re-run it if anyone edits a template in the dashboard directly,
and update the committed file in the same change — otherwise the repo starts
lying about production, which is the failure this repo has spent several sessions
removing elsewhere.

`supabase/config.toml` is deliberately **not** wired to these files. Its
`[auth.email.template.*]` block configures the LOCAL stack only, where mail goes
to Mailpit and nobody reads the bodies. Wiring it would add an unverifiable
config change to the local dev environment for no production benefit.
