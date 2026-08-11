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

## Open question for JP, logged rather than guessed

**Should a patient whose pedido is still pending 24 hours before the slot be told
anything at all?**

The options, with the trade in one line each:

1. **Nothing** (today's behaviour after this ruling). Safest. A patient who
   requested a slot hears silence and may arrive anyway.
2. **A distinct pending-reminder body.** Honest, but it is an eleventh patient
   template needing JP approval and a registry entry, and it tells several
   patients about the same contested slot.
3. **Force reception to resolve pedidos before the 24h mark.** An operational
   rule, not a code change, and the only option that removes the situation rather
   than describing it.

**Recommended default: option 1**, which is what shipped, on the grounds that
silence is the only option that cannot mislead. Revisit when reception has run
the queue for a week and there is real data on how long a pedido actually sits.
