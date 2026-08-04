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

---

# Counsel and owner rulings, 2026-08-03

Legal basis for reminders: art. 6(1)(b) plus 9(2)(h). Contact data tied to an
appointment is art. 9 health data. **No consent needed for reminders**, which
settles a question this lane had been treating as open.

## Copy approvals — CLOSED

All ten patient bodies are `approved: true`, `approvedBy: "JP"`,
`approvedAt: "2026-08-03"`.

**Source: JP's written reply of 2026-08-03, a blanket approval of all ten bodies
as they appear in the packet.** Not a verbal relay, not inferred from silence.

Consequences worth stating plainly:

- The approval gate no longer stops anything. **`REMINDERS_LIVE_SEND` is now the
  only thing between an approved body and a real patient's phone.** The test
  `sends NOTHING with live send off, even though all 10 are approved` is the
  load-bearing one from here on.
- Patient activation stays **unapproved**: it was excluded from the packet as
  dead code, so a blanket approval of the packet must not reach it. Asserted.
- **Open:** JP has not chosen between the shipped 24h SMS body and variant A.
  Follow-up sent. If he picks variant A, that body enters the registry
  `approved: false` and goes through the gate like any other copy change.

## SMS opt-out posture — CLOSED

No email fallback when a patient disables SMS. Ratified by JP in writing
2026-08-03. Recorded in the packet's defaults matrix.

## Cancel cutoff — 24 hours (JP, 2026-08-03)

Portal and token cancel paths refuse inside 24h of appointment start, pt-PT copy
directing the patient to telephone.

**Design consequence, resolved:** the 24h SMS arrives *at* the cutoff, so its
link is **confirm-only**. The 48h email may offer cancel, but the cutoff is
re-evaluated **at redemption**, not at issuance — a cancel link created at 48h
can be clicked 30 hours later, inside the cutoff. Per-offset action matrix is in
`docs/rgpd-token-flow.md` §5.

## Reschedule minimum notice — PENDING JP

Unanswered. **The new-slot constraint is deliberately not built.** Do not infer a
value from the cancel cutoff; they are different decisions.

## Reschedule notifications — binding scope for DoR item 4

Every patient-initiated change (cancel and reschedule included) lands in the
in-app notification centre for reception and the assigned therapist. Owner-
mandated, no longer merely planned.

## Payload minimisation — now a compliance property

Counsel reviewed and requires it maintained. Enforced by
`apps/web/lib/reminders/payload-minimization.test.ts`, verified to fail when a
`patientPhone` field is added to an event type. The first version of that check
used a word-boundary match and **missed `patientPhone`**; the negative arm caught
it and it now matches substrings.

## Fee acceptance — SPEC ONLY, DO NOT BUILD

**Location changed by JP: the ficha clínica, not the portal booking flow.**
A checkbox at the end of the ficha alongside the existing confirmations,
**staff-side**, captured when staff complete or update the ficha. Not pre-checked.

Acceptance record, per patient: `patient_id`, `accepted_at`, `terms_version`,
`recorded_by`.

**The fee line renders only for a patient with a recorded acceptance.** The gate
is per-patient acceptance **AND** the global flag, never the flag alone. A global
flag on its own would announce a fee to patients who never accepted it, which is
the exact thing counsel warned about.

JP confirmed **no existing signed document contains the rule**, so this flow is
the sole legal path to the fee line ever shipping.

Migration for the acceptance table is **not 0053**; it queues behind the audit
log migration. Phone and walk-in bookings are handled on paper by the clinic and
are out of scope here.

## Lawyer follow-up list

1. **Retention period** for the patient audit log.
2. Does **ficha clínica acceptance satisfy the pre-contractual communication
   duty for bookings concluded through the portal**, or does the portal also need
   its own acceptance step? This matters: the ficha is staff-side, so a patient
   who books entirely through the portal may never pass through it.
3. Whether the Supabase and Vercel regions need verifying from the provider
   consoles rather than from committed configuration (see
   `docs/rgpd-token-flow.md` §10).

## Documents produced

`docs/rgpd-token-flow.md` — token issuance, signature, validity, single-use
consumption, scope and per-offset action matrix, landing-page contents, audit log
fields and integrity, payload minimisation, subprocessor table. Every section
marked BUILT or SPECIFIED so counsel cannot mistake a plan for a control.

---

# Reschedule lane, 2026-08-04

## CORRECTION: the AppointmentView change was never approved

A handoff stated that `serviceId` and `locationId` "were approved and added to
`AppointmentView` (8 keys to 10)". **Both halves were false.** At `ffe1e33`:

- `apps/api/lib/appointments/booking.ts` — `AppointmentView` has **8 keys**
- `apps/portal/lib/api/client.ts` — same 8 keys

The claim exists in no committed file, so it was never an approval — only an
assertion that one had happened. Owner ruling 2026-08-04: **option 2**, do not
add the ids. `AppointmentView` stays at 8 keys.

This is the eighth time this session a claimed protection or decision has turned
out not to exist in committed code. The pattern is stable enough to plan around:
**re-derive from committed files before building on any handoff claim**, and when
one cannot be re-derived, halt rather than build on it.

## Reschedule options endpoint

`GET /api/v1/appointments/[id]/reschedule-options` takes the appointment id and
nothing else. Service and location resolve server-side from the stored row, so
the portal never receives either identifier. Data minimisation per counsel.

Zero duplicated slot computation: it calls the same `store.listOpenSlots` that
backs `GET /booking/slots`. Duration comes from the appointment itself, not the
service — reschedule preserves the original window by design, so a service whose
duration changed after booking must not silently resize an existing appointment.

## Minimum notice, 24h on the new slot (JP, 2026-08-03)

`RESCHEDULE_MIN_NOTICE_HOURS` is a **separate constant** from
`CANCELLATION_CUTOFF_HOURS` even though both are 24. They answer different
questions about different instants: "is it too late to touch the appointment you
have" versus "is that new time far enough away to be useful". Collapsing them
would mean changing one silently moves the other.

**Enforced twice, deliberately.** The options list filters, and the reschedule
action re-checks. The filter is a courtesy to an honest client; the action is the
control. Both arms proven to fail independently.

Before this, `rescheduleAppointment` rejected only a start in the *past*, so a
patient could have moved an appointment to two hours from now.

## Already done, verified not redone

- **B1 registry approvals** — merged in #766 (`ffe1e33`). All ten already
  `approved: true` / `JP` / `2026-08-03`.
- **B2 cancel cutoff** — already server-enforced at `booking.ts` via
  `isWithinCancellationCutoff`, with the client-side guard and pt-PT
  `cancel_too_late` copy in `AppointmentActions.tsx`. No change needed.
- **B6 SMS opt-out posture** — recorded closed in the packet and above.

## Still open in this lane

- Reschedule **UI** and the **B4 events** (patient-initiated change → in-app
  notification to reception and assigned therapist, fixed contract + stub
  consumer). Next PR, on top of this one once merged.
- **B5 fee acceptance on the ficha clínica** — spec only, not built, migration
  queues behind the audit-log migration.
