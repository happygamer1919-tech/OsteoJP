# D1 — two unconfirmed pedidos stack on one slot. An options paper for JP.

**Status: AWAITING RULING. Nothing is implemented. No option is recommended
here as a decision — the recommendation at the end is engineering's reading, and
JP overrides it.**

Raised 2026-08-11 from production. Written by PURPLE for Ivan to take to JP.

---

## 1. What happens today, verified in the code

**Two appointments now exist on 2026-08-11 at 10:00 local — same patient, same
practitioner (Catarina Vieira), same location (OsteoJP LV), both `scheduled`
with confirmação pendente. The second saved with no conflict warning.**

The mechanism is confirmed and it is **wider than first reported**. The exclusion
`NOT is_unconfirmed_pedido(...)` is applied at **three** sites, not one — 0059's
own header says so and names why:

| Site | File | Effect |
|---|---|---|
| Staff booking conflict | `0059:192`, `appointment_conflicts` | a pedido does not block a staff booking |
| **Portal booking guard** | `apps/api/lib/appointments/store.ts:165`, `apptOverlapExists` | **a pedido does not block another pedido** |
| Staff agenda availability | `apps/web/lib/scheduling/day-availability.ts:113` | a pedido does not grey out the slot |

The middle row is D1. When a second patient books the same slot, the first
pedido is excluded from the overlap check, so there is no conflict, so it saves.
**There is no cap. Ten patients can request the same slot.**

## 2. Why this is not a bug in 0059

JP's ruling was scoped, verbatim from `0059:4-9`:

> "an unconfirmed pedido must NOT hold the slot against anyone else. **Staff may
> book over it and another patient may book it**, until reception actually
> confirms."

**"and another patient may book it" is in the ruling.** So the current behaviour
is what was asked for. What was never decided is what happens when the *second*
patient's request is also never confirmed, and whether there is a limit.

**0059 is correct and does not need changing to implement most of the options
below.** Options A, B and C are changes to the *portal* booking guard only, which
is application SQL, not the shared function.

## 3. What reception actually faces

Two pedidos on one slot means **reception must decline one**. The queue does not
say they collide — the pedido row carries patient, time and requested-at, and
nothing else (`pending-requests.tsx:26-33`). So reception discovers the clash by
confirming one and having the other refuse.

**The refusal already works.** `confirmAppointmentRequest` takes slot locks,
re-checks inside the transaction, and the second confirm finds the first
`confirmed` — and `confirmed` has always blocked (`0059:96-102`). **Nobody can
double-book by confirming twice.** The damage is workload and patient
experience, not data integrity.

## 4. The options

### Option A — leave it. Unlimited stacking.

- **Reception:** worst. Every duplicate request is a decline, by hand, with no
  warning that it is a duplicate. Grows with portal adoption.
- **Patient:** best-case optimism. Two patients each believe they may get 10:00;
  one is told no, later, by a person.
- **Abandoned request:** best. A request nobody actions costs nothing — the slot
  was never held, so it stays bookable by anyone including staff.
- **Cost:** zero. It is today.

### Option B — a pedido blocks *other patients* but not staff.

The portal guard stops excluding unconfirmed pedidos; the staff path keeps
excluding them. One slot, one request, first come.

- **Reception:** best. Never two requests for one slot. The queue becomes a list
  of distinct decisions.
- **Patient:** honest scarcity — the second patient sees the slot gone and picks
  another, immediately, instead of waiting to be declined.
- **Abandoned request:** **worst, and this is the whole risk.** A request nobody
  actions **holds the slot against every other patient until someone touches it.
  That is dead calendar,** and it is invisible: the slot simply stops being
  offered. With no expiry it accumulates.
- **Cost:** small. One predicate in the portal guard. **No migration.**
- **Note:** JP's ruling explicitly permitted "another patient may book it", so
  this option *reverses a stated clause* and needs him to say so.

### Option C — Option B plus an expiry.

A pedido holds the slot for N hours, then stops blocking.

- **Reception:** near-best, with a deadline that is theirs to meet.
- **Patient:** honest scarcity, and an abandoned request self-heals.
- **Abandoned request:** solved — the slot returns automatically.
- **Cost:** **higher, and this is where a migration appears.** "Stops blocking
  after N hours" is computable from `created_at` with no schema change, but only
  if N is a constant. If N must be configurable per clinic it becomes a column
  and **migration 0061**. **Engineering will not pick N** — it is a promise to
  patients about how fast the clinic answers.

### Option D — cap the stack at 2 or 3.

- **Reception:** better than A, worse than B. Still duplicates, but bounded.
- **Patient:** the cap is invisible and arbitrary; the Nth patient is refused for
  a reason nobody can explain on the phone.
- **Abandoned request:** same as A, bounded.
- **Cost:** small, but it is the only option that introduces a number with no
  clinical meaning. **Recorded for completeness rather than recommended.**

## 5. Summary

| | Reception load | Patient experience | Abandoned request | Migration |
|---|---|---|---|---|
| **A** leave it | worst | false hope, late decline | **best** — nothing held | no |
| **B** pedido blocks patients | **best** | honest scarcity | **worst** — dead calendar | no |
| **C** B + expiry | best | honest scarcity | solved | **only if N is per-clinic** |
| **D** cap the stack | middle | arbitrary refusal | bounded | no |

**The trade is one sentence: any option that makes a pedido hold the slot
reintroduces dead calendar when a request is never actioned.** B buys reception's
sanity with that risk. C buys it back with a number JP has to choose. A refuses
the trade and pays in reception's time.

## 6. Engineering's reading, which JP overrides

**C, with N as a fixed constant to start.** It is the only option where nothing
silently accumulates. Starting with a constant avoids `0061` entirely; if the two
clinics later need different windows, that is a migration then, on evidence.

**If a decision is wanted today with no new mechanism: B.** It is one predicate,
it is reversible, and reception is the constraint that is actually hurting.
Accept that an unactioned request holds a slot until someone looks.

## 7. What JP is being asked

1. **A, B, C or D?**
2. **If C: what is N?** How long may a request hold a slot before the clinic has
   effectively not answered? Hours, not minutes.
3. **If C: same N for both clinics, or per clinic?** Same means no migration.
4. **Does the "another patient may book it" clause in the original ruling
   stand?** B and C both reverse it.

**Nothing is built until this returns.** The two stacked production rows on
2026-08-11 10:00 are real bookings and should be resolved by hand either way.
