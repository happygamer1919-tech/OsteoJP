# SPEC — SMS appointment-confirmation flow

> **STATUS: SPEC ONLY — NO BUILD THIS WAVE.** This document is a design source of
> truth. It adds no product code, no dependency, no Inngest job, no confirm-page
> route, no schema change, no env/secret. A future build loop is GATED on the
> Twilio-as-new-vendor decision (owner-confirmable, CLAUDE.md) and the open
> questions in `docs/design/QUESTIONS.md` (2026-07-03 entries).

Authored by the GREEN runner (W2-13), Wave 02. Aligns with: the 0024 confirmation
axis (DECISIONS 2026-07-01), the multi-tenant / tenant-from-token hard rules
(CLAUDE.md), and EU data residency (Resend EU precedent).

## 1. Goal

Reduce no-shows by asking each patient to confirm an upcoming appointment via a
short SMS with a one-tap **SIM / NÃO** link. Tapping the link flips the existing
0024 confirmation axis on that appointment. No staff action required.

## 2. Sender

- **Vendor:** Twilio (PT SMS sender / alphanumeric or PT long code — TBD with the
  vendor decision). Twilio is a **NEW third-party vendor**: its introduction is
  owner-confirmable and is NOT wired by this SPEC (see QUESTIONS 2026-07-03).
- **Home:** `packages/integrations` (alongside InvoiceXpress / Resend), mirroring
  the existing vendor-adapter pattern. Credentials live in Vercel/Supabase env
  only, never in code (CLAUDE.md).
- **Data residency:** confirm Twilio EU region / DPA before any build (EU-only
  for stored data — CLAUDE.md hard rule 8). Message bodies contain minimal PII
  (patient first name + appointment time); no clinical data in SMS.

## 3. Reminder job (Inngest)

- A scheduled Inngest job (the existing background-job stack) enqueues, per
  upcoming appointment in a `scheduled`/`confirmation_state = pending` state:
  - a **day-before** reminder, and
  - a **same-day-morning** reminder.
- Exact Europe/Lisbon send times are a JP/owner decision (recommended default
  18:00 D-1 and 08:00 D0 — see QUESTIONS). Times are computed in Europe/Lisbon
  and stored/compared in UTC (CLAUDE.md date rule).
- Idempotency: at most one SMS per (appointment, reminder-slot); re-runs must not
  double-send (dedupe on appointment_id + slot). An appointment already
  `confirmed` or `declined` is NOT re-reminded.
- Tenant scope: the job runs per tenant; `tenant_id` is set explicitly on every
  query (service-role hard rule 3), never global.

## 4. Message

- A short pt-PT SMS (exact copy is a JP/owner decision — QUESTIONS) carrying a
  **signed short link** to a PUBLIC, no-login confirm page.
- The page shows the appointment (date, time, therapist, location) and two
  buttons: **SIM** (confirm) and **NÃO** (decline). No login, no app.
- No clinical content in the SMS or the page beyond the appointment logistics.

## 5. Confirm action → flips the 0024 axis

Tapping **SIM** / **NÃO** on the confirm page flips the appointment's existing
0024 axis (no schema change — the columns already exist):

| Field (0024) | On SIM | On NÃO |
|---|---|---|
| `confirmation_state` | `confirmed` | `declined` |
| `confirmation_received_at` | now() | now() |
| `confirmation_channel` | `sms` | `sms` |

- The lifecycle `appointment_status` axis is UNTOUCHED — the two axes stay
  orthogonal (DECISIONS 2026-07-01; never collapse them).
- The flip emits the existing `appointment_status_changed`-style analytics/audit
  as applicable (a confirmation event), tenant-scoped.

## 6. Token (security)

- **HMAC-signed, opaque token**, SINGLE-appointment scope, with an **expiry
  window** (recommended: expires shortly after the appointment; exact window
  TBD). The token encodes the appointment id + tenant + issue time + a version.
- **Tenant is derived SERVER-SIDE from the verified token, NEVER from the request
  payload** — hard requirement (multi-tenant rule). The public confirm endpoint
  trusts nothing in the URL/body except the HMAC-verified token.
- **Single-use or idempotent-flip:** the confirm endpoint is idempotent — a
  second SIM tap re-affirms `confirmed` (no error, no state churn); a switch
  SIM→NÃO (or vice-versa) before expiry is allowed and updates
  `confirmation_received_at`/`state` (final decision wins). (Chosen: idempotent
  flip, so a patient can correct a mis-tap; a strict single-use variant is a
  fallback if abuse is observed.)
- Signing key is a server-only secret (env), rotated with a `kid`/version in the
  token so rotation doesn't invalidate all live links at once.

## 7. Abuse / rate considerations

- **Opaque token, no enumeration:** the token is not a guessable appointment id;
  an invalid/forged token returns a generic "link inválido ou expirado" page
  (no information leak, no tenant hint).
- **Expiry:** an expired token → the same generic page; no flip.
- **Replay:** an already-decided appointment re-tapped → idempotent (re-affirm),
  never an error; a token past expiry never flips.
- **Rate limiting** on the public confirm endpoint (per-IP + per-token) to blunt
  brute-force/abuse; the endpoint does no work beyond verify + flip.
- No PII in error responses or logs (hard rule 7); the confirm page renders only
  the appointment logistics for a valid token.

## 8. Explicit non-goals

- **NO inbound reply-text parsing** — confirming by replying "SIM"/"NÃO" as an
  SMS reply is OUT OF SCOPE; only the link page confirms.
- **NO build this wave** — no Twilio dependency/account, no Inngest job, no
  confirm route, no `packages/integrations` wiring, no env/secret, no schema.
- **No other channel** (WhatsApp/email confirmation) in this SPEC.
- **No new schema** — the flow reuses the 0024 columns as-is.

## 9. Build gate (future loop)

A build loop for this SPEC is blocked on: (a) Twilio-as-new-vendor approval +
EU-region/DPA confirmation; (b) the pt-PT message/page copy; (c) the exact send
times; (d) opt-out/consent handling. All four are logged in
`docs/design/QUESTIONS.md` (2026-07-03).
