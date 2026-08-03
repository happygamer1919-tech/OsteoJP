# Notification safety lane — work notes

Running record for the choke point, the approval registry, and the environment
sweep. Ground truth is the committed code; this file records decisions and open
threads that the code cannot state for itself.

## Count reconciliation (settled, do not drift again)

- **11 distinct patient-facing bodies**: 10 in `apps/web/lib/reminders/templates.ts`
  (48h, 24h, confirmation, follow-up, no-show, each in email and SMS) plus 1
  patient activation body in `apps/api/lib/auth/activation.ts`.
- **12 refusing registry entries**: 10 in web, plus 2 in api, because the single
  activation body is delivered on two channels and the registry is keyed per
  (id, channel) so an SMS approval can never leak into an email approval.
- Both numbers are correct; they count different things. Asserted in
  `apps/web/lib/reminders/notification-registry.test.ts`, not just documented.
- Earlier reports said "eight" (a miscount carried from the five-function audit)
  and then "eleven entries" (conflating bodies with entries). Both superseded.

## Root-domain fallbacks (item 4 scope)

| # | Location | Fallback | Status |
|---|---|---|---|
| 1 | `apps/web/lib/reminders/clients.ts:63` | `reminders@osteojp.pt` | REMOVED |
| 2 | `apps/web/lib/invites/email.ts:44` | `reminders@osteojp.pt` | REMOVED |
| 3 | `apps/api/lib/notify/clients.ts:85` | `no-reply@osteojp.pt` | REMOVED |
| 4 | `apps/web/lib/reminders/dispatch.ts:136` | `https://osteojp.pt` | DEFERRED to item 4 |

The verified Resend identity is on `send.osteojp.pt`, not the root domain, so
every removed fallback was a guaranteed send-time rejection wearing a
healthy-looking default. Fallback 4 is a link base URL: unset in prod means every
reminder and no-show email carries a reschedule link that 404s on the marketing
site.

`REMINDERS_EMAIL_FROM` is now **required on the invite path as well as reminders**.
Boot validation must list it for both apps.

**Naming smell, logged and NOT fixed in this lane:** a reminders-named env var
powers staff invites. Renaming or splitting it is a follow-up, not a blocker.

## Open threads for the portal Definition of Ready

- **`sendPatientActivation` grants a session by design.** It mints a Supabase
  recovery link and delivers it by SMS. That conflicts with Decision D (patient
  login is a 6-digit SMS OTP, phone-only identify) and with the ruling that a
  patient link is one-action and never escalatable into a session. It is dead
  code today (no caller; see `docs/handoff/WAVE-12-CLOSE-20260727.md:78`) and is
  now registered `approved:false` so wiring a route to it cannot make it live.
  **Candidate for outright deletion. Decide during AUTH work (DoR item 1), not
  in this lane.** It is deliberately excluded from the JP approval packet: a dead
  template must not consume a clinical owner's review.

## Residual risk: end-to-end suppression is unobserved

The gate is proven in unit tests. No reminder has executed end to end through
Inngest since the app was synced on 2026-08-03, so the suppression path has never
been seen in a real run.

**What Ivan should look for after this branch deploys.** Not actionable from the
build shell; this needs a prod observer.

- **Trigger:** the next real appointment created by clinic staff. That emits
  `appointment/scheduled`, which fans out to two functions,
  `send-appointment-confirmation` (immediate) and `schedule-appointment-reminders`.
- **Where:** Vercel function logs for the **osteojp-platform** project, and the
  Inngest **run history** for app `osteojp-reminders`.
- **Expected log line format**, one per suppressed send:

  ```
  [notify] suppressed template=confirmation.sms channel=sms appointment=<uuid> reason=template_unapproved
  ```

- **Expected reason is `template_unapproved`**, not `live_send_disabled`, even
  though `REMINDERS_LIVE_SEND` is currently `false`. The approval gate is checked
  first by design, so it reports the more decisive cause. Seeing
  `live_send_disabled` instead would mean the registry was bypassed and is worth
  reporting.
- **Expected Inngest outcome:** the run **succeeds**. A suppressed send is a
  no-op, not an error, so a failed run means something other than the gate.
- **Expected count:** exactly one suppression line per channel the patient has
  contact for. Patient defaults are `reminder_sms_enabled` true and
  `reminder_email_enabled` false, so a patient with a phone and no email
  preference produces one SMS line and no email line.
