---
description: Run full patient portal E2E test (login → dashboard → appointments → forms → booking all 4 steps → clinics → account → documents) against https://osteojp-portal.vercel.app and report exact copy and error state for every screen.
---

You are running the OsteoJP patient portal end-to-end test. Use Playwright to
drive a real browser against production. Test credentials are embedded below —
never commit them.

## Target

URL: https://osteojp-portal.vercel.app
Email: triboimax635+maria@gmail.com
Password: MariaQA2026!

## Setup

Write the test to `/tmp/osteojp-e2e-portal.mjs`, then execute it with
`node /tmp/osteojp-e2e-portal.mjs`. The script must use ES module syntax
(`import`, not `require`). Playwright is available at
`/Users/sm33xy/Projects/OsteoJP/node_modules/playwright` — import from there.

Screenshots go to `/tmp/osteojp-e2e-screens/`. Create that directory before
running. After the run, read any screenshot that shows an unexpected error or
empty state.

## Test sequence (run every step every time)

**Login**
1. Navigate to `/auth/login` with `waitUntil: 'networkidle'`.
2. Wait for `button[type="submit"]` to be visible before typing.
3. `click()` then `type(EMAIL, { delay: 30 })` on the email field.
4. `click()` then `type(PASSWORD, { delay: 30 })` on the password field.
5. Intercept the Supabase token response — capture its HTTP status.
6. Click submit. Assert HTTP status is 200; log the body on any other status.
7. `waitForURL(url => !url.toString().includes('/auth/login'))`. If still on
   the login page after 15 s, abort and report the error copy visible on screen.

**Dashboard** (`/portal/dashboard`)
- Navigate directly. Wait `networkidle`.
- Check for "Não foi possível" (error boundary text) — flag as FAIL if present.
- Record: greeting text (h3), next-appointment card copy or empty-state copy,
  quick-action labels, any `[role="alert"]` text.
- Verify the RSC stream has no `$RX` error resolve: run a `curl` of the same
  URL with the session cookie, grep the HTML for `$RX(` and for `E{"digest"`.

**Appointments** (`/portal/appointments`)
- Record: tab labels, empty-state or appointment list copy, any errors.

**Forms** (`/portal/forms`)
- Record: empty-state or submission list copy, any errors.

**Booking** (`/portal/booking`) — walk all 4 steps, stop before confirming
- Step 1: record clinic cards shown. Click the first clinic card.
- Step 2: record all service buttons. Click "Fisioterapia" (first option).
- Step 3: click "Escolher data", record the calendar month shown. Click the
  first enabled weekday (use `aria-label` like
  `button[aria-label*="de junho de 2026"]`, skip disabled days). Record the
  time slots that appear. Click `08:00`. Click "Continuar".
- Step 4: record all copy on the confirmation summary. Do NOT click "Confirmar
  marcação".

**Clinics** (`/portal/clinics`)
- Record: page title, clinic names, addresses, phone numbers, emails, hours,
  footer note. Any errors.

**Account** (`/portal/account`)
- Record: header (avatar initials, name, email), all field labels and values
  (read-only display + editable fields with their placeholders), preference
  toggles and their states.
- Find "Alterar palavra-passe" using `document.querySelector` in `page.evaluate`
  (Playwright's `getByText` misses it if the element is not a button). Record
  its tag, href. Click it and record the URL it navigates to — must be
  `/auth/reset-password`. Record the copy on that page.

**Documents** (`/portal/documents`)
- Record: empty-state or document list copy, any errors.

## After each screen

Log: URL, any `text=/não foi possível|erro/i` matches, full `innerText` of
`<body>` (first 600 chars). Take a screenshot.

## Final summary

Print a table:

```
Screen             | Result | Notes
-------------------+--------+---------------------------------
Login              | PASS   | Auth 200
Dashboard          | PASS   | "Olá · Sem consultas marcadas"
...
```

FAIL means an error boundary ("Não foi possível"), redirect to login, HTTP
error, or missing required content. WARN means unexpected empty state or minor
copy mismatch. PASS means the screen loaded with expected content and no errors.

Print all console errors and network request failures at the end.
