# R10 - reminders do not fire for unconfirmed pedidos

**Strategy ruling, 2026-08-11. Consequence of JP's D1 no-cap decision.**

---

## The binding position

**An appointment whose `confirmation_state` is `pending` is not remindable.**
The dispatcher gates on `confirmation_state` in addition to `status`.

---

## Why it became necessary, which is the part worth keeping

This was not a bug report. It is a **second-order consequence of a ruling**, and
it is the kind that does not announce itself.

JP ruled on D1 that **unconfirmed pedidos stack on one slot with no cap**,
confirming the verbatim header of migration 0059:

> Staff may book over it AND ANOTHER PATIENT MAY BOOK IT, until reception
> actually confirms.

That ruling is sound, and it is sound **because a pedido is a request, not a
commitment**. Several patients may ask for the same slot; reception decides.

The reminder pipeline did not know that. `REMINDABLE_STATUSES` at
`apps/web/lib/reminders/dispatch.ts` admitted `scheduled`, and **a pedido is
`status = 'scheduled'` with `confirmation_state = 'pending'`**. So with no cap in
force, **N patients holding a pending pedido on one therapist and one slot would
each have received a 24h reminder telling them their appointment is tomorrow** -
for a slot only one of them can hold.

**The no-cap ruling and the reminder gate are the same decision viewed twice.**
Stacking is defensible only while a pedido stays a request. A reminder restates
it as a commitment, and would have converted a correct ruling into a visible
defect at the patient.

---

## What the gate is, precisely

`UNREMINDABLE_CONFIRMATION_STATES = new Set(["pending"])`, checked in
`dispatchReminder` immediately after the status check.

**A set rather than a `!== "pending"` comparison**, deliberately: the enum can
grow, and a future state that also means "not agreed yet" must be added in one
named place rather than discovered as a second reminder defect.

**Null is remindable.** Rows predating the column carry no pedido semantics, and
treating null as pending would silently stop reminders for the entire existing
book.

**Checked after `status`, not before.** A pedido that was also cancelled keeps
reporting `status`, so the outcome stays stable for anything counting skip
reasons.

**The skip reason is `unconfirmed`, not `status`.** Collapsing them would hide
which gate fired, and since a pedido genuinely *is* `scheduled`, the log would
have claimed the status was wrong when it was not.

---

## No migration

`appointments.confirmation_state` already exists (`packages/db/src/schema.ts:726`).
This ruling adds a read of an existing column and a branch. **0061 stays
unoccupied.**

---

## What this does NOT do

- **It does not change stacking.** D1 is closed with no cap and this ruling does
  not reopen it. Reception still resolves contention at confirm time.
- **It does not suppress anything else.** Confirmed appointments, staff-booked
  appointments, and every row with a null state remind exactly as before. Three
  negative arms in `apps/web/lib/reminders/pedido-not-remindable.test.ts` pin
  that, because a gate that skipped every `scheduled` row would pass a naive test
  and silently kill reminders for the ordinary book.
- **It does not decide what a patient with a pending pedido should receive
  instead.** Today they receive nothing. Whether an unconfirmed request deserves
  its own message ("ainda a aguardar confirmacao") is a product question for JP
  and is **not** answered here.

---

## Answered by JP, 2026-08-11

**A patient whose booking request is still unconfirmed receives NO 24h reminder.**

**The shipped default is the intended behaviour, not a placeholder.** This was
logged as an open question when the gate shipped in #854, with option 1 (silence)
as the recommended default on the grounds that it is the only option that cannot
mislead. JP has ruled it, and the ruling matches what #854 already ships, so
**there is no code change**.

The two alternatives are refused rather than deferred:

- **A distinct pending-reminder body** would be an eleventh patient template
  needing JP approval and a registry entry, and it would tell several patients
  about the same contested slot.
- **Forcing reception to resolve pedidos before the 24h mark** is an operational
  rule, not a code change, and remains available to the clinic without any
  engineering.

Revisit only if reception's queue data later shows patients arriving for
unconfirmed requests.
