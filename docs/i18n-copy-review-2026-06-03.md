# i18n Copy Review — 2026-06-03

**Reviewer:** Max
**Scope:** New strings added in PRs #106–#115
**Sections reviewed:** admin.settings, admin.staff, admin.invite, auth.setPassword, superadmin, reschedule
**Reference:** docs/brand-voice.md

---

## Overall verdict

PT register is consistent throughout — formal "você" implied, institutional tone correct. EN is clean. Six issues found, two worth fixing now, four flagged for Ivan/JP decision.

---

## Issues

### CPY-01 — `admin.settings.sectionPreferences` PT: "Idioma" too narrow
**Severity:** 🟡 Medium
**Current PT:** `"Idioma"`
**Current EN:** `"Language"`
**Problem:** This section now covers locale, reminder channels, lead times, and billing settings — not just language. "Idioma" implies it's only a language picker, which will confuse admins.
**Fix PT:** `"Preferências"`
**Fix EN:** `"Preferences"`

---

### CPY-02 — `superadmin.login.pending` PT: trailing ellipsis inconsistent
**Severity:** 🟢 Low
**Current PT:** `"A entrar..."` (3 dots, ASCII)
**Current EN:** `"Signing in..."` (3 dots, ASCII)
**Elsewhere in the file:** `auth.setPassword.submitting` uses `"A guardar…"` (single Unicode ellipsis `…`)
**Fix:** Standardize all loading/pending states to Unicode ellipsis `…`
- `superadmin.login.pending` PT: `"A entrar…"`
- `superadmin.create.pending` PT: `"A criar…"`
- `superadmin.login.pending` EN: `"Signing in…"`
- `superadmin.create.pending` EN: `"Creating…"`

---

### CPY-03 — `admin.invite.email.subject` PT: "Bem-vindo(a)" gendered workaround
**Severity:** 🟢 Low — owner decision needed
**Current PT:** `"Bem-vindo(a) à OsteoJP — defina a sua palavra-passe"`
**Problem:** `"Bem-vindo(a)"` is grammatically awkward in a subject line. Consistent with our SMS fix (SMS-02), institutional voice avoids gendered forms.
**Recommended fix PT:** `"A sua conta OsteoJP — defina a sua palavra-passe"`
**EN stays as-is** — "Welcome to OsteoJP" is gender-neutral.
**Action:** Apply fix — no owner decision needed, matches established brand voice principle.

---

### CPY-04 — `admin.settings.billingVatRate` label missing exemption context
**Severity:** 🟢 Low — flag only
**Current PT:** `"Taxa de IVA (%)"`
**Current EN:** `"VAT rate (%)"`
**Note:** OsteoJP is exempt from VAT under art. 9.º n.º 1 CIVA (health services). Having a configurable VAT rate field implies VAT may apply. If the field is always 0% and locked, the label should say so. If it's editable for future non-exempt services, it's fine as-is.
**Action:** Ivan to confirm whether this field is editable or locked. No copy change until confirmed.

---

### CPY-05 — `superadmin.create.slugHint` example uses real clinic name
**Severity:** 🟢 Low
**Current PT:** `"Minúsculas, números e hífens (ex.: linda-a-velha)."`
**Current EN:** `"Lowercase, numbers and hyphens (e.g. linda-a-velha)."`
**Note:** "linda-a-velha" is the real clinic location. Using it as an example in the superadmin UI is fine internally, but if the superadmin panel is ever shown to a third-party operator or in a demo, it leaks the client name. Low risk for now.
**Action:** No change needed for v1 — flag for v1.1 if superadmin panel becomes multi-tenant demo material.

---

### CPY-06 — `auth.setPassword.successBody` PT: redirect phrasing passive
**Severity:** 🟢 Low
**Current PT:** `"A redirecioná-lo para a plataforma…"`
**Problem:** `"redirecioná-lo"` is masculine — same issue as the SMS "obrigada" fix. If a female staff member sets her password, this reads as "redirecting him".
**Fix PT:** `"A redirecionar para a plataforma…"` — drops the pronoun entirely, clean and gender-neutral.
**EN stays as-is** — "Redirecting you" is gender-neutral.

---

## Fixes to apply

| Key | Field | Change |
|---|---|---|
| `admin.settings.sectionPreferences` | PT + EN | "Idioma"/"Language" → "Preferências"/"Preferences" |
| `superadmin.login.pending` | PT + EN | ASCII `...` → Unicode `…` |
| `superadmin.create.pending` | PT + EN | ASCII `...` → Unicode `…` |
| `admin.invite.email.subject` | PT only | "Bem-vindo(a)…" → "A sua conta OsteoJP…" |
| `auth.setPassword.successBody` | PT only | "A redirecioná-lo…" → "A redirecionar…" |

---

## No action needed

- `admin.staff.*` — clean, consistent, no issues
- `auth.setPassword.*` error messages — clear, actionable, correct register
- `superadmin.*` column labels — accurate and consistent
- `reschedule.invalidBody` — matches what we tested in QA (safe error page confirmed)
- `admin.settings.reminderEmail/Sms/LeadTime` — reviewed yesterday, confirmed compatible
