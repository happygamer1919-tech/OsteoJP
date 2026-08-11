# R11 - the 24h SMS carries the confirm link, not the clinic phone

**Strategy ruling, 2026-08-11. A SCOPED AMENDMENT to the phone-CTA decision at
`apps/web/lib/reminders/templates.ts:135-136`.**

**STATUS: RULED, NOT YET IMPLEMENTED.** The ruling stands. Implementation is
blocked on a segment collision that the ruling did not anticipate, documented in
full below. Nothing in the templates has been edited.

---

## The ruling

**The 24h SMS carries the single-use confirm link and drops `Remarcar: {phone}`.**

**Scope, stated narrowly because this is an amendment and not a replacement:**

| Surface | Change |
|---|---|
| **24h SMS** | link replaces phone |
| 48h SMS | **unchanged**, keeps the phone |
| 48h email | **unchanged**, keeps confirm and cancel |
| Every other template | **unchanged**, the clinic phone stays |

## Why

The 24h SMS **arrives at or inside the cancel cutoff set by Decision C**. A phone
number in that message offers the patient a reschedule they **cannot obtain at
that moment**. The confirm link offers the one action that is actually available
to them.

This is the same reasoning counsel's per-offset matrix already applies at
`apps/web/lib/reminders/dispatch.ts:174-179`, which gives the 48h email confirm
**and** cancel but the 24h SMS confirm **only**. R11 makes the copy agree with the
matrix instead of contradicting it.

## What it amends, and what it does not

`templates.ts:135-136` reads:

> Go-live deviation from the doc (Stream E): SMS points to the clinic PHONE, not
> the reschedule short-link. The signed reschedule token (see link-token.ts) is
> far too long to fit a single GSM-7 segment alongside this copy, and a
> two-segment SMS doubles cost. The reschedule LINK lives in the email reminder;
> SMS keeps the phone CTA.

**That decision was correct on its own premise and the premise has changed.** It
rests on token length, and R11 is only possible because the token is truncated to
22 characters (128 bits). **The original comment is not edited.** It remains the
governing decision for the **48h** SMS and for every other SMS body.

---

## THE BLOCKER - a segment collision the ruling did not anticipate

**Measured 2026-08-11 against the committed copy. The model reproduces the
numbers in `fee-notice.ts:64-67` exactly (53, 153, margin 7), which is what
validates it.**

Worst case is `Castelo Branco` with the longest phone, per
`twilio-proof.test.ts:97-98`. **Note the SMS uses `appointmentDateShort` (`23/05`,
5 chars), not a long weekday** - an earlier estimate of mine used the long form
and was wrong.

| Variant | Chars | Verdict |
|---|---|---|
| 24h base, today | 99 | |
| 24h base **+ fee notice** | **153** | fits, **margin 7** |
| 24h **+ link**, fee OFF | **131** | **fits**, margin 29 |
| 24h **+ link + fee notice** | **185** | **OVERFLOWS BY 25** |

**The fee notice is appended to the 24h SMS specifically** (`templates.ts:222`,
the eleventh body, W13-05), and it is 53 characters. The 24h SMS is the **one**
body that already spends its entire segment budget.

**And the failure mode is worse than cost.** `assertSmsCompliant`
(`templates.ts:259-268`) **throws**. So this does not silently become two billed
segments - **the render fails and the 24h reminder does not send at all**.

**The trigger is a step that looks unrelated.** `REMINDERS_FEE_NOTICE_ENABLED`
defaults off and is armed as a supervised launch-day step under LAUNCH-01, after
JP and counsel sign the fee line. **Shipping R11 as specified would arm a
landmine: the moment counsel signs, every 24h reminder throws.**

### Options, none of which I may choose

1. **Shorten the fee line.** It is unapproved copy that JP and counsel must sign
   anyway, so it is the natural place to spend 25 characters. **Recommended**,
   because it is the only option that costs nothing operationally and the review
   is already scheduled.
2. **Drop `Local: {clinic}` from the fee-bearing 24h SMS only.** Saves 22. Still
   **3 short**, and it removes the location from the one message that mentions a
   penalty.
3. **Shorten the link base.** `https://app.osteojp.pt/r/` is 25 chars. Dropping
   `https://` saves 8 and breaks auto-linking in some handsets. A shorter host is
   a domain decision, not a code one.
4. **Accept two segments for the fee-bearing 24h SMS only.** A pure cost
   decision, and it requires relaxing `assertSmsCompliant` for one path, which
   weakens a guard that currently protects every template.
5. **Put the link in the 48h SMS instead**, which carries no fee line. Cheapest
   technically, but it **contradicts the reasoning for R11**: the 48h message is
   outside the cutoff, where the phone CTA is still useful.

**Entropy was not reduced and will not be.** 128 bits is the floor set by
strategy and every figure above assumes it.

---

## No migration

Truncation needs no schema change: consumption is keyed on the token **sha256
hash** in `action_token_consumptions` (0054), and a shorter token hashes to the
same width. **0061 stays unoccupied.**
