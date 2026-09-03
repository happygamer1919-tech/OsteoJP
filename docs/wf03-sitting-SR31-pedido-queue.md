# WF-03 sitting note — SR-31, the pedido queue moves to `appointments.origin`

**For the owner, to be read BEFORE this deploys.** SR-31 says the surfacing of
historical lost pedidos is correct behaviour and goes to a sitting first. This is
that note.

---

## 1. What reception will see that they did not see yesterday

**Requests that were made and never shown to anyone.**

A patient books through the portal. The appointment row is written inside the
patient's own transaction, so it always exists. A *separate*, best-effort
notification is then emitted to tell reception — and `emitPatientChange` never
throws, so when that emit fails the appointment exists and **nobody is told**.
The patient has already been shown *"pedido recebido"*.

Until now the queue asked the **notification** whether a pedido existed, so those
requests were invisible. It now asks the **appointment**, which cannot be lost.

**Nothing is removed from the queue.** The change is proven as a delta against a
real database: the visible set grows by exactly the lost-emit rows and shrinks by
nothing (`packages/db/tests/pedido-queue.db.test.ts`).

## 2. How many will appear

**I cannot read production and have not.** The count is one query, for your own
shell. It is read-only.

```
select count(*) as lost_pedidos_that_will_appear
  from public.appointments a
 where a.origin = 'patient_portal'
   and a.status = 'scheduled'
   and not exists (
     select 1 from public.staff_notifications n
      where n.appointment_id = a.id and n.kind = 'appointment_request');
```

To see them rather than count them, with **no patient names**:

```
select a.id, a.starts_at, a.location_id, a.created_at
  from public.appointments a
 where a.origin = 'patient_portal'
   and a.status = 'scheduled'
   and not exists (
     select 1 from public.staff_notifications n
      where n.appointment_id = a.id and n.kind = 'appointment_request')
 order by a.starts_at;
```

**Two of these are already known by name:** the INC-06 pedidos of 2026-08-09,
09:02:52 and 09:04:08. Both were created, both logged the stub consumer's line,
and a LEFT JOIN to `staff_notifications` returned null for both. They are the
worked example of the class.

**Expect the count to be small.** `origin` was only added on 2026-08-20 and
backfilled from the notification rows that existed then — so a pedido whose
notification was never written before that date was already invisible and is
**not** recoverable by this change. What surfaces is what has been lost since.

## 3. What reception should do with them

**Treat each one as a normal pedido.** They are real requests from real patients
who were told the request was received. Confirm or decline exactly as usual.

**Two things worth knowing before they do:**

- **Some may be in the past.** The filter is `status = 'scheduled'`, not "in the
  future", so a request for a slot that has already passed will appear. Those
  should be declined, and the patient rung if the slot mattered.
- **They were never blocking the slot.** Migration 0067 already fixed that half
  on 2026-08-20: `is_unconfirmed_pedido` keys on `origin`, so these have been
  correctly non-blocking since then. Nobody has been turned away because of one.

## 4. One behaviour change beyond the surfacing, and it is the one to decide on

**An admin with no clinic assignment can now see the queue.**

- **Before:** the queue came from the notification table, whose policy pins reads
  to the person the message was addressed to. An admin who was not on the
  fan-out list saw nothing, regardless of their clinic scope.
- **After:** the queue comes from the appointment, so the appointment's own rule
  governs. For an admin with **no** `staff_locations` row that rule is the
  documented **no-lockout fallback** — they see everything in the tenant.

**It is not new data.** That same admin already sees every one of these
appointments on the agenda and every patient in Utentes, by the same fallback.
The pedido queue was the only surface that hid them, and only incidentally.

**What changed is the queue's audience**: it is now the appointment scope rather
than the fan-out list. Assigned reception and assigned admins are unaffected;
therapists are unaffected. Proven in both directions in the DB-gated suite.

**Cross-tenant isolation is unchanged and is asserted separately** — a principal
from another tenant sees nothing.

## 5. What this does NOT fix

**The notification is still best-effort and can still be lost.** What changes is
that losing it no longer loses the request. A lost notification now costs a
notification-centre entry and nothing else.

The entry returned by the queue carries `notificationLost: true` for these rows.
**Nothing renders it yet** — whether reception should see a marker, and in what
words, is a copy decision for this sitting rather than something this lane picks.

## 6. The checklist

- [ ] Run the count query in §2 and note the number.
- [ ] Open **Notificações** and look at the pedido queue.
- [ ] Confirm the count matches what appeared.
- [ ] Decide: should a lost-emit pedido carry a visible marker, and in what words?
- [ ] Confirm you are content that an unassigned admin sees this queue (§4).
