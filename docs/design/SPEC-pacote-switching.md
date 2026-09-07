# SPEC — pacote switching, 5 to 10, crediting the difference

**Status: REPORT ONLY. NOTHING IS BUILT. No migration is authored.**
Author: PURPLE, 2026-09-07. Re-derived from `origin/main` at `380e1023`.

**The commercial half is ruled and is not in question.** JP: the patient pays
the difference and consumed sessions carry across. This report answers the
mechanical half: what exists, what a switch would actually have to touch, and
which of two shapes it is.

---

## 0. The one-paragraph answer

**Nothing in the product can move a patient between pacotes today. There is no
switch, no upgrade, no unlink and no transfer — not hidden behind a permission,
not present and refused: absent.** A switch would be **A CHANGE TO THE
INSTANCE**, not a change to which pack it points at, and the two are not the
same act: repointing `patient_pack_instances.pack_id` alone produces a row
labelled "Pacote 10" whose balance is still 5, because **`sessions_total` is a
SNAPSHOT on the instance and the derived balance reads it, not the catalogue.**
Consumed sessions carry across for free under a repoint — the linked
appointments carry `pack_instance_id`, which a repoint does not touch — and do
NOT carry across under retire-and-issue, where the new instance starts with zero
linked rows. **And the money cannot be computed from the data: nothing anywhere
records what a patient PAID for a pacote instance.**

---

## 1. WHAT EXISTS TODAY. The complete inventory of writes.

`patient_pack_instances` is written in exactly two places in the whole
repository, and one of them is a test:

| Write | Where | What it does |
|---|---|---|
| `INSERT` | `bookPackSessionTx`, `apps/web/lib/packs/instances.ts` | creates an instance when a patient books a pacote and has none with sessions left |
| `INSERT` | the seeds | fixtures |

**THERE IS NO `UPDATE` AND NO `DELETE` ON THE TABLE ANYWHERE IN `apps/` OR
`packages/`.** Verified by search, not remembered.

Two columns are FROZEN by explicit policy, and one of them is enforced in CI:

- **`sessions_remaining`** — the pre-0067 balance. `RB-02` made the balance
  derived and left this column as the only evidence 0067's backfill can be
  checked against. `scripts/pack-sessions-remaining-is-frozen.test.mjs` runs in
  the REQUIRED quality job and **fails any file outside a named allow-list that
  writes it.** The one permitted writer is the INSERT above.
- **`status`** — `instances.ts` states "Nothing below UPDATEs either" and the
  derived `active` is computed from the balance, never read from the column.

**AND `adjustPackSessionAction` WAS DELETED RATHER THAN HIDDEN.** RB-02 removed
the manual consume/restore control because it burned a session with no
appointment row — no who, no when, no slot — and its own comment records why it
was deleted and not merely unmounted: *"A server action left in place with its UI
removed is still callable by anything that can POST, and it would still write a
balance that nothing can reconcile."*

**SO THE ANSWER TO "CAN ANYTHING MOVE A PATIENT BETWEEN PACOTES" IS NO, AND IT IS
A DELIBERATE NO.** The last thing that could adjust a balance by hand was removed
on purpose. That is the baseline any switch has to argue against.

---

## 2. THE BALANCE, AND WHY IT DECIDES EVERYTHING BELOW

```
available = sessions_total − legacy_consumed − linked appointments that are not cancelled
```

`packages/db/src/pack-balance.ts`, applied in `instances.ts` and `link.ts`.

Three terms, three homes, and **the homes are the whole of this report**:

| Term | Lives on | Changes if you repoint `pack_id`? |
|---|---|---|
| `sessions_total` | **the INSTANCE** | **NO** |
| `legacy_consumed` | **the INSTANCE** | **NO** |
| linked appointments | `appointments.pack_instance_id` → **the INSTANCE's id** | **NO** |

**NOT ONE TERM OF THE BALANCE COMES FROM `service_packs`.** So repointing an
instance from the 5 to the 10 changes the NAME the screen shows and changes
NOTHING about the number beside it. A patient would see "Pacote 10 — 3/5
sessões", which is not a rounding error, it is a screen that contradicts itself.

**THIS IS `PACK-04`'S LESSON POINTED THE OTHER WAY, AND THE DISPATCH IS RIGHT TO
NAME IT.** There, `base_service_id` lives on `service_packs` — the CATALOGUE row
— so one UPDATE repointed the binding for EVERY holder of that pacote. Here,
`sessions_total` lives on the INSTANCE, so the catalogue's session count reaches
no existing holder at all. **Same family of mistake, opposite direction: assuming
a value lives on the row you happen to be looking at.**

---

## 3. WHAT HAPPENS TO SESSIONS ALREADY CONSUMED

A consumed session **is an appointment row** carrying `pack_instance_id`
(migration 0067). There is no counter. So:

**UNDER A REPOINT — they carry across, automatically, with no work.** The
appointments still point at the same instance id; the instance is the same row;
the count is unchanged. **This is the single strongest argument for the repoint
shape**, and it is exactly what "consumed sessions carry across" means in this
data model.

**UNDER RETIRE-AND-ISSUE — they do NOT carry across, and making them is where
the design gets ugly.** A new instance has zero linked appointments, so its
balance is its full `sessions_total`. Three ways to fix that, all bad:

1. **Re-point the old appointments' `pack_instance_id` at the new instance.**
   This is a write to `appointments`, on completed clinical rows, to fix a
   commercial event. It also silently changes what `packServiceChangeRefusal`
   will permit on those rows afterwards.
2. **Set `legacy_consumed` on the new instance.** It is the right arithmetic and
   the wrong column: its own schema comment defines it as *"sessions consumed
   BEFORE appointment linkage existed"* and records that it was *"backfilled
   ONCE"*. Re-purposing it makes the column mean two things and destroys the
   0067 audit identity — `legacy_consumed = sessions_total − sessions_remaining`
   — which two DB-gated suites currently assert.
3. **Leave the old instance alive with its appointments.** Then the patient owns
   two pacotes, the profile lists both, and `bookPackSessionTx` will happily
   attach a new booking to whichever it finds first with sessions left.

**None of the three is acceptable as written, which is the finding.**

---

## 4. IS IT A CHANGE TO THE INSTANCE, OR TO WHICH PACK IT POINTS AT?

**IT IS A CHANGE TO THE INSTANCE. Explicitly, as the dispatch asks.**

A switch has to move at least `sessions_total` from 5 to 10, and that column is
on the instance. Repointing `pack_id` is a NECESSARY PART of the same act — the
patient's profile reads the pacote's NAME and its BASE SERVICE through
`pack_id` — but it is not sufficient and it is not the substance.

**THE TWO BLAST RADII, since the dispatch asks for them explicitly:**

| | Repointing `service_packs.base_service_id` (PACK-04's act) | Changing `patient_pack_instances` (this act) |
|---|---|---|
| Rows touched | 1 catalogue row | 1 instance row |
| Patients affected | **EVERY holder of that pacote, forever, including future buyers** | **exactly one patient's one pacote** |
| Detectable afterwards? | only by noticing a balance moved | yes — one row, one audit entry |
| The trap | a catalogue edit that looks per-patient | an instance edit that looks like it needs a catalogue edit |

**THE ONE-PATIENT BLAST RADIUS IS THE REASON TO PREFER THE INSTANCE SHAPE**, and
it is the opposite of PACK-04's hazard rather than a repetition of it.

**AND THERE IS A THIRD ACT THAT LOOKS LIKE THIS ONE AND IS NOT.** `updatePack`
(`apps/web/lib/admin/packs.ts`) lets an admin with `services:write` change
`session_count` on a catalogue row **that patients already hold instances of, with
no guard and no warning.** Doing that to "upgrade a patient from 5 to 10" changes
NOTHING for any existing holder — their `sessions_total` is a snapshot — and
silently changes what every FUTURE buyer gets under the same name. **That is the
most likely way this gets done wrong by hand before anything is built**, and it
deserves a guard whether or not a switch feature is ever built:
`updatePack` should refuse (or at minimum name the holders) when `session_count`
changes on a pack with live instances — the same shape as PACK-04's archive
refusal, which already names the pacotes it is protecting.

---

## 5. WHAT LINKED APPOINTMENTS DO IN EACH CASE

| Case | `appointments.pack_instance_id` | Balance effect | Hazard |
|---|---|---|---|
| **Repoint, same base service** (Pacote 5 → Pacote 10 of the SAME treatment — JP's case) | untouched | consumed carries across exactly | none found |
| **Repoint, DIFFERENT base service** | untouched | consumed carries across | **every already-linked appointment now violates the rule the link was made under.** `packLinkRefusal` matches `appt.serviceId === inst.baseServiceId`; after the repoint the stored rows disagree with it, and `packServiceChangeRefusal` will then refuse the operator's next edit to those rows, naming a service the appointment never had |
| **Retire and issue** | still points at the OLD instance | consumed does NOT carry across | §3's three bad options |
| **Retire, issue, and re-point the appointments** | rewritten | carries across | a write to completed clinical rows to record a commercial event |

**SO THE SWITCH IS SAFE IN EXACTLY ONE SHAPE AND MUST REFUSE THE OTHERS:** a
repoint between two pacotes that share `base_service_id`. That is a
one-line predicate — `newPack.baseServiceId === oldPack.baseServiceId` — and it
is the guard that makes the whole feature small.

---

## 6. WHAT THE DATA CANNOT ANSWER: the money

**"Credit the difference" needs two prices, and the system stores neither
against the instance.**

- `patient_pack_instances` has **no price column at all**. Verified against the
  schema: id, tenant, patient, pack, sessions_total, sessions_remaining,
  legacy_consumed, status, purchased_at, timestamps. That is the complete list.
- `service_packs.price_cents` and `service_pack_location_prices` hold the
  CURRENT catalogue price, which can have moved since the purchase.
- `invoices` are per-APPOINTMENT (`invoices.appointment_id`) with a flat
  `amount_cents` and **no pack reference and no line items**. There is no invoice
  row for a pacote purchase.

**SO THERE IS NO RECORD, ANYWHERE, OF WHAT A PATIENT PAID FOR A PACOTE.** The
difference can only ever be computed from TODAY's catalogue prices, which is a
claim about the present presented as a settlement of the past.

**THIS IS NOT A BLOCKER AND SHOULD NOT BE TREATED AS ONE.** The clinic takes
money outside this system already. What it means is narrower and should be said
plainly to JP: **the switch screen can DISPLAY today's difference as guidance and
must not RECORD it as a fact.** The amount actually charged is a human decision
at the desk, and if it needs to be recorded, that is an invoice — a separate
change with its own shape.

**Q-PACK-SWITCH-1, for the owner/JP:** does the switch need to record the amount
charged? *Recommended default: no. Show today's catalogue difference as a hint,
record the switch as an audit entry naming both pacotes, and leave the money on
the invoice where money already lives.*

---

## 7. THE SHAPE I WOULD RECOMMEND, IF IT IS BUILT

Not a proposal to build. The answer to "what would this look like", so the
stamp is informed.

**ONE ACTION, `switchPackInstance(instanceId, newPackId)`, in ONE transaction:**

1. **REFUSE** unless `newPack.baseServiceId === currentPack.baseServiceId` — §5.
2. **REFUSE** unless `newPack.sessionCount > instance.sessionsTotal` — this is an
   upgrade with a credit, and a downgrade is a refund, which is a different
   commercial act nobody has ruled on.
3. **REFUSE** unless `newPack.isActive` — the PACK-04 family: nothing sellable
   should be bound to an archived service, and nothing new should be bound to an
   archived pacote.
4. **UPDATE the instance:** `pack_id` and `sessions_total`. **Nothing else.**
5. **`sessions_remaining` IS NOT TOUCHED**, and the CI guard is not amended. It
   is the pre-0067 record of a purchase that DID happen; a switch does not
   rewrite history. It stays ≤ the new, larger total, so no CHECK is violated.
6. **`legacy_consumed` IS NOT TOUCHED.** Its meaning is fixed.
7. **Audit** `pack_instance.switch` with both pack ids, both session counts and
   the balance before and after.

**NO MIGRATION.** Every column already exists; this writes two of them. Under
`PORTAL-REHYDRATE §1.1` that matters — a lane that needs a migration stops before
writing anything, and this does not.

**WHAT IT COSTS ELSEWHERE, checked rather than assumed:**

- `bookPackSessionTx` — unaffected; it reads the instance's own total.
- `listPatientPackInstances` / the profile counter — unaffected; derived.
- `linkAppointmentToPack` — unaffected while §5's same-service guard holds.
- `packServiceChangeRefusal` — unaffected, same reason.
- `getReferencedPackIds` / `deletePack` — the OLD pack may lose its last instance
  and become hard-deletable. Correct, and worth a line in the report to whoever
  presses it.
- **`scripts/pack-sessions-remaining-is-frozen.test.mjs` — UNAFFECTED, and that
  is a design constraint rather than a happy accident.** Step 5 exists precisely
  so this file needs no new allow-list entry. A switch that had to be exempted
  from the frozen-column guard would be a switch that had started rewriting the
  audit trail.

---

## 8. THE OPEN QUESTIONS

- **Q-PACK-SWITCH-1** — record the amount charged? *Recommended: no; audit the
  switch, leave money to invoices.*
- **Q-PACK-SWITCH-2** — is a DOWNGRADE (10 → 5) ever wanted? *Recommended:
  refuse it. It is a refund, the consumed count may already exceed the new
  total, and nothing has ruled on it.*
- **Q-PACK-SWITCH-3** — who may switch? *Recommended: `services:write` (owner and
  admin), not reception. It moves money and it is not a front-desk act — the
  same tier `updatePack` already sits at.*
- **Q-PACK-SWITCH-4, and it stands on its own merits whether or not a switch is
  ever built** — should `updatePack` refuse a `session_count` change on a pack
  with live instances? *Recommended: yes, and name the holders, exactly as
  PACK-04's archive refusal names the pacotes.*

**STOP. Report only, per the dispatch. Nothing is built and no migration is
authored.**
