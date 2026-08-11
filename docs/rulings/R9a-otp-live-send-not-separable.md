# R9a - OTP_LIVE_SEND is not separable from the other live-send flags

**Owner ruling, 2026-08-11. Amends R9 by addition. Supersedes nothing in R9.**

R9 lives on board card `WF-12` and is unchanged by this file. `REMINDERS_LIVE_SEND`
and `INVITES_LIVE_SEND` stay off until supervised launch-day canaries, exactly as
ruled on 2026-08-05. This file governs a **third flag R9 never named**.

---

## The binding position

**`OTP_LIVE_SEND` may be armed ONLY for the duration of a supervised acceptance
sitting, and MUST be disarmed at the end of that sitting.**

**Arming it and leaving it armed is prohibited.**

Disarming is a **named closing step of every sitting that arms it**. A sitting is
not complete until the disarm redeploy shows `Ready` with a timestamp
**post-dating the save**. A save without a redeploy does not disarm a running
deployment, and "I turned it off" is not the evidence; the redeploy timestamp is.

---

## What was proposed, and why it was wrong

An earlier amendment was drafted and **voided before it was written to the
board**. It proposed that `OTP_LIVE_SEND` was *separable* from the other two
flags on blast-radius grounds, and could therefore **remain armed** on
`osteojp-api` Production throughout pre-launch testing, disarmed later as a
precondition of `LAUNCH-03`.

Its argument was:

> REMINDERS and INVITES are system-initiated fan-out: one bad predicate mails
> every matching row. OTP is user-initiated and one-to-one: it fires only on an
> active login submission and is rate limited to 3 per hour per IP and per phone.

**The rate-limit half is accurate. The "user-initiated and one-to-one" half is
false as built, and it is the half the conclusion rested on.**

It also assumed a refusal preceded the send:

> for a well-formed +351 number that matches ZERO patient rows, the code returns
> the generic pt-PT refusal required by Decision D before any send is attempted

**No such refusal branch exists anywhere on that path.** There is nothing to
refuse *on*, because the endpoint performs no patient lookup at all.

### The code, read 2026-08-11

`apps/api/app/api/v1/auth/otp/request/route.ts:20-22`, the route's own header:

> AND IT NEVER LOOKS THE PHONE UP. There is no patient query on this path at all,
> so membership cannot leak even through the timing of a lookup. WF-07 resolves
> the patient at CLAIM time, on verify.

`apps/api/lib/auth/otp.ts:216-220`, on `requestCode`:

> IT RETURNS NOTHING ABOUT WHETHER THE PHONE IS KNOWN, and it does not look.
> [...] A code is issued for any well-formed number; an unknown number simply
> receives an SMS that helps nobody.

`apps/api/lib/auth/otp.ts:245` is the send, unconditional.
`apps/api/lib/auth/otp-transport.ts:171-172` resolves the real Twilio adapter if
and only if `OTP_LIVE_SEND === "true"`, otherwise an in-process sink.

**The flag is the entire control.** Sink when off. Real SMS to any Portuguese
number when armed.

### One-to-any, not one-to-one

`PT_SUBSCRIBER` at `apps/api/lib/notify/phone.ts:19` is `/^[29]\d{8}$/`: first
digit 2 or 9 plus eight digits, so **200,000,000 accepted inputs**.

`RULES.otpRequest` at `apps/api/lib/rate-limit/limiter.ts:184` is
`{limit: 3, windowMs: 3600000}`. The per-phone limit caps harassment of **one
handset** at 3/hour and **does not bound spend at all** - an attacker rotating
numbers never approaches it. The per-client limit keys on the first
`x-forwarded-for` hop (`limiter.ts:117-119`), so a proxy pool yields 3 sends per
IP per hour against **no global ceiling**.

The endpoint is public. `apps/api/proxy.ts:5` confirms authorization is per-route
via `requirePatient`, which this pre-authentication route cannot and does not
call.

**So the flag does not gate a one-to-one user action. It gates an
unauthenticated, uncapped, tenant-funded SMS sender.** That is a strictly larger
blast radius than `INVITES_LIVE_SEND`, whose fan-out is at least bounded by the
staff table.

---

## What is NOT wrong, and must not be "fixed"

**The absent lookup is deliberate and correct.** `apps/api/lib/auth/otp.ts:7-13`
states the trade:

> THE ATTACK THIS IS SHAPED AROUND IS ENUMERATION [...] "A wrong code and an
> unknown phone return the SAME response - enumeration is the obvious attack
> here." A login form that answers differently for a known and an unknown number
> is a patient-list oracle for anyone with a phone book, and this clinic's
> patient list is itself sensitive.

A future session reading R9a must not conclude that adding a patient lookup is
the fix. **It is not. It is the regression.** A lookup-then-refuse endpoint
trades an SMS-spend problem for a patient-list disclosure problem, and for a
clinic the second is worse.

The remediation directions are on `SEC-otp-unauthenticated-sms-pump`, in priority
order, and all three preserve enumeration resistance: a **tenant-wide send
ceiling** returning the same generic response once tripped; **rejecting the `2`
prefix**, which cannot receive SMS anyway and which also supplies the landline
enforcement point PG1's own DoR requires; and an **invisible bot challenge** only
if the first two prove insufficient, weighed against accessibility for elderly
patients.

---

## The voided amendment contradicted a committed ruling, not just the code

This is the part worth keeping. **The acceptance plan had already ruled this
exact question, in the opposite direction, and the ruling is committed.**
`docs/acceptance-session-wave-13.md:1161-1165`, section 11, titled *"Disarm — a
named step, and not optional"*:

> **`OTP_LIVE_SEND` IS DISARMED AT THE END OF THIS SESSION.** R9 authorises
> *supervised canaries*, not a standing arm. "Left armed" is **not** permitted
> merely because it was written down — writing it down is a note, not a decision.

The voided amendment proposed precisely what that paragraph names and refuses: a
standing arm, justified by having been written down. **R9a is therefore not a new
position.** It restates a committed one, adds the code evidence that shows why it
is right, and moves it out of a session plan into the rulings register where a
future session will find it.

**And the operational consequence, which is why the exposure is live rather than
theoretical.** Item 25 is the disarm step, and it carries two blanks in the
committed file: `Disarmed at: ______` and `Redeploy Ready at: ______`. **Both are
unfilled.** The sittings ran on 2026-08-08 and 2026-08-09. No results file
existed until 2026-08-11, so there is no committed record that the disarm was
ever performed.

**Absent a filled-in item 25, the flag must be treated as armed.** The plan
anticipated even the failure mode: *"STOP if the redeploy errors. The flag is
still armed until one succeeds."* A save without a successful redeploy does not
disarm a running deployment.

---

## Why this file exists rather than an edit to R9

So the reasoning is not repeated. The separability argument is **plausible** -
authentication genuinely should not share a kill switch with marketing-adjacent
sends, and `apps/api/lib/auth/otp-transport.ts:7-23` makes exactly that case for
why OTP has its own flag at all. That reasoning is sound and stands.

What does not follow is that a separate flag may therefore be left **on**. The
flag was separated so that OTP could be armed *independently*, not so that it
could be armed *permanently*. A future session that re-derives the first half of
that argument will be tempted to re-derive the second. This file is the stop.

**Test debt recorded:** there is no test file for the request route. The
send-for-unknown-number behaviour is currently unasserted, which is how a
deliberate trade became an unreviewed one. Any fix ships with a guard proven red
against the pre-fix sha.
