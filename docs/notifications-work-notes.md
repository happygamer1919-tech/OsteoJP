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
| 4 | `apps/web/lib/reminders/dispatch.ts:142` | `https://osteojp.pt` | REMOVED |
| 5 | `apps/web/lib/reminders/link-token.ts:81` | silent `null` when `REMINDERS_LINK_SECRET` is unset | FIXED (loud log, still returns null) |
| 6 | `apps/api/lib/auth/activation.ts:117` | `PATIENT_ACTIVATION_REDIRECT_URL` silently omitted | LEFT (dead code; see the AUTH thread below) |

Fallback 4 was cited as `dispatch.ts:136` in the briefing; the #760 merge shifted it
to `:142`. Same line, same defect.

Found by the item 4 sweep, beyond the four known:

- **5** was the sharpest. `signRescheduleToken` **throws** when the secret is
  absent; `verifyRescheduleToken` returned **null**, the same value it returns for
  a forged or expired token. A deployment missing the secret therefore presented to
  every patient as "invalid link" with no signal anywhere. It still returns null
  (the caller must not be able to distinguish a misconfiguration from a forgery)
  but now logs loudly first.
- **6** is dead code today and is left alone deliberately.

Judged benign, recorded so the next sweep does not re-litigate them:

- `TWILIO_SMS_FROM ?? TWILIO_MESSAGING_SERVICE_SID` (both apps) is a genuine
  either-or, not a degradation. Validated as "one of" rather than as two names.
- `PATIENT_ACTIVATION_CHANNEL` defaults to SMS by owner ruling. It does silently
  coerce an unknown value to SMS, which is worth revisiting if that path ever
  ships.

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


## JP approval packet (item 6)

`docs/notifications-approval-packet.md`, 537 lines. Written in pt-PT for a
clinical owner, not for engineers.

- **10 template sections**, one per registry entry, each with id, trigger, the
  authored template, a rendered example with real sample data, and for SMS the
  encoding and measured segment count. Every number in that file is generated
  from the shipping code with real fixtures, not written by hand.
- **Patient activation is excluded** per owner ruling: it is dead code and a
  candidate for deletion, and a dead template must not consume clinical review.
- **Two 24h variants** of the clinic-supplied wording, both accent-free GSM-7.
- `apps/web/lib/reminders/approval-packet.test.ts` fails if a registry template
  has no packet section. Prevents an eleventh body being approved in a batch that
  JP never saw.

### Measured facts worth keeping

| Fact | Value |
|---|---|
| Signed reschedule token | **183 chars** (link 208) |
| Clinic wording as supplied, filled + link | 371 chars, **not GSM-7**, **6 UCS-2 segments** |
| Variant A, short link | 122 chars, **1 segment** |
| Variant B, short link | 160 chars, **1 segment, zero margin** |
| Variant A/B with the CURRENT signed link | 303 / 341 chars, **2 / 3 segments** |
| All 5 shipped PT SMS bodies | GSM-7, 84-103 chars, **1 segment each** |

One segment for the clinic's wording is achievable **only with a short link**.
The 208-char signed link cannot fit. A clinic-domain short-link service is the
engineering prerequisite; until it exists the clinic wording costs 2-3 segments,
which is why the shipped SMS points at the clinic phone instead.

Variant B sits at exactly the 160 limit with **zero margin**: a longer phone
number or one extra word silently pushes it to two segments. Flagged in the
packet.

### Open with JP / lawyer (G8 batch)

The 50% no-show fee line. Announcing a fee by SMS does not make it enforceable;
it is generally only chargeable if the patient agreed somewhere. Two questions in
the packet: does a signed document already provide for it, and if not does JP want
one or does the line come out.

`REMINDERS_FEE_NOTICE_ENABLED` is the intended flag name, default OFF. It is
**specified, not built**, and the packet says so explicitly — claiming a
protection that does not exist yet is the exact pattern this lane has spent the
session removing. It gets built with the chosen variant, after the decision.
