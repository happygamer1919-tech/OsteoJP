# SPEC — forcing a booking outside a therapist's hours

**Status: STAMPED 2026-09-08. STILL NOTHING IS BUILT — it needs BLUE's columns.**
Author: PURPLE, 2026-09-07. Re-derived from `origin/main` at `e19a5b09`.
The four rulings landed on 2026-09-08 and are in §5, which is now answers rather
than questions. §0-§4 are unchanged: they are the derivation the rulings were
taken against, and rewriting them to match the outcome would destroy the record
of what was known when the decision was made.

---

## 0. HALT FIRST. THIS REVERSES AN OWNER RULING THAT IS THREE WEEKS OLD.

**The request and a committed ruling contradict each other, and I am not
resolving that myself.**

> **THE DISPATCH:** "A therapist asked for the old platform's behaviour: warn,
> do not refuse. Outside the therapist horario is a soft rule: warn and allow."

> **`apps/web/lib/scheduling/availability-enforcement.ts`, RB-03, owner ruling
> 2026-08-20:** *"Availability becomes ENFORCED at write time… **`allowConflict`
> must not reach it.** The generic conflict path is overridable by 'Guardar
> mesmo assim', and **an override that reinstates the exact defect is not an
> override, it is a bypass.** A therapist who genuinely works late is expressed
> by EXTENDING THEIR DISPONIBILIDADE — which is the data being enforced — not by
> pressing past the check."*

**"Warn, do not refuse" IS the behaviour RB-03 removed.** Before it, PL-11
(owner, 2026-07-30) had made availability advisory in exactly those words:
*"availability warning is advisory, never a hard block"*. RB-03 overturned PL-11
because of a reported defect: **Catarina's hours end at 13:00 and a manual entry
booked 17:00**, and the check that would have caught it ran, produced the right
answer, and was thrown away one line before the refusal.

So this request is a proposal to go back to the state that produced that defect.

### The one thing that makes the reversal defensible where PL-11 was not

**PL-11 warned and forgot. The dispatch warns and REMEMBERS.**

> "recording who forced it and when, visible on the appointment"

That is the whole difference and it is not cosmetic. RB-03's objection was that
an override "reinstates the exact defect" — and it did, because nothing anywhere
recorded that a human had chosen to override. Catarina's 17:00 was
indistinguishable from a booking inside her hours. **A forced booking that
carries its own record is a different object from an unforced one**, and it can
be found, counted, and asked about.

**IT IS STILL A REVERSAL AND IT IS STILL THE OWNER'S TO MAKE.** Recording a
decision does not make the decision correct; it makes it reviewable. Strategy
and the owner rule. Nothing below is built until they do.

### And there is a smaller premise error in the dispatch worth correcting

> "An occupied slot **or an explicit time-off block** … must warn differently"

**Those two are already the same thing today, and they should not be.** `time_off`
and `therapist`/`room` are three of four `ConflictKind` values that share ONE
severity, ONE message shape and ONE override button. So "warn differently and
name which rule is being bypassed" is a change to the HARD path too, not only a
matter of splitting it from the soft one. §4 covers it.

---

## 1. WHAT REFUSES TODAY. Four rules, three enforcement styles, five call sites.

| # | Rule | Where the verdict is made | What happens | Overridable? |
|---|---|---|---|---|
| A | Outside the therapist's **disponibilidade** | `checkAvailability`, `availability-enforcement.ts` | **REFUSES** with `outside_availability`, naming the therapist's windows that day | **NO. By design.** |
| B | Therapist already booked (**overlap**) | `findConflicts` → `ConflictKind "therapist"` | refuses with `conflict` + the list | **YES**, `allowConflict` |
| C | **Room** already taken | same | same | **YES**, `allowConflict` |
| D | **Time-off** block overlaps | `findScheduleConflicts` → `ConflictKind "time_off"` | same | **YES**, `allowConflict` |
| E | Two **CONFIRMED** appointments overlapping | migration 0061, `EXCLUDE USING gist … WHERE (status = 'confirmed')` | **REFUSES** at the DATABASE with `double_booked` | **NO. Cannot be.** |

**B, C AND D ARE ONE CODE PATH AND ONE BUTTON.** `conflict-core.ts` is the
single classifier and it has exactly two categories — advisory (`availability`
alone) and blocking (everything else). The three blocking kinds are then
indistinguishable to the caller: same error code, same list, same *"Guardar mesmo
assim"*.

**A IS A SEPARATE, EARLIER REFUSAL, DELIBERATELY**, and it sits OUTSIDE the
`if (!allowConflict)` block at every call site so the override cannot reach it.

**E IS NOT AN APPLICATION RULE AT ALL.** It is a Postgres exclusion constraint,
so no flag in any request body can pass it, and `fail()` maps it to its own code
precisely so the drawer does NOT offer *"Guardar mesmo assim"* for something that
can never succeed. **Any design below must leave E alone.**

### The call sites, counted

`checkAvailability` is called in **three** places, all in
`apps/web/lib/scheduling/actions.ts`:

| line | function | |
|---|---|---|
| 647 | `createAppointment` | the create drawer and the pedido conversion |
| 1027 | `cloneAppointment` | *Marcar novamente* |
| 1540 | `rescheduleAppointment` | a time move |

**`updateAppointment` does NOT check it, and that is correct**: its `set` never
contains `startsAt`, so it cannot move a booking in time. A time move is
`rescheduleAppointment`.

**AND A FOURTH PATH BEHAVES DIFFERENTLY AGAIN, WHICH NOBODY HAS ASKED ABOUT.**
`batch.ts` — *Agendar lote* — reads availability through
`getTherapistAvailability` and **SKIPS** unavailable slots: *"Partial success is
expected behaviour, not an error."* So for one rule the product has three
answers: **refuse** (create/clone/reschedule), **skip silently** (lote), and
**warn only** (the picker panel, which is what `ADVISORY_CONFLICT_KINDS` still
feeds). A soft-rule design has to say what the lote does, or the override will
exist on three screens and not the fourth.

---

## 2. WHAT IS RECORDED TODAY WHEN SOMEBODY OVERRIDES

**`allowConflict` reaches `audit_log.metadata` as a boolean, and goes nowhere
else.** SEC-allowconflict-not-audited made it *"ALWAYS a boolean, never omitted
when false, or the absence would again be unreadable"* — so the fact is captured.

**IT IS NOT ON THE APPOINTMENT.** Verified against the schema: `appointments` has
no `forced`, `override`, `allow_conflict` or equivalent column. So today:

- **who forced it** — recoverable, from `audit_log.actor_user_id`
- **when** — recoverable, from the audit row
- **visible on the appointment** — **NO.** Nothing on the agenda card, the
  drawer, the Marcações row or the hover says a booking was forced. Finding out
  means querying the audit log, which reception cannot do and the owner would
  not think to.

**THE DISPATCH'S THIRD REQUIREMENT IS THEREFORE THE ONE THAT DOES NOT EXIST AT
ALL** — not for availability, and not for the conflicts that already have an
override. Whatever is built has to add it for both, or the new soft rule will be
better recorded than the hard one it sits beside.

---

## 3. THE SHAPE I WOULD RECOMMEND, IF IT IS STAMPED

Not a proposal to build. The answer to "what would this look like".

### 3.1 Two overrides, never one

The dispatch's binding constraint — *"they must not share one override"* — is
the same boundary RB-03 drew, so it survives intact and is the reason the design
is small:

```
SOFT   outside disponibilidade   → warn, allow, RECORD    → override "reason: outside_hours"
HARD   overlap / room / time-off → warn, allow, RECORD    → override "reason: conflict"
NEVER  two confirmed overlapping → refuse at the database → no override exists
```

**Two distinct request fields, not one flag with a mode.** `allowOutsideHours`
and `allowConflict`. A single flag with an enum is the same bypass wearing a
type: one press of one button would clear both rules, and the button the user
pressed said only one thing.

**AND THE SOFT ONE MUST BE THE NARROWER FIELD.** `allowConflict` already exists
and already means "I accept a clash". Adding the availability case to it is
exactly what RB-03 forbade; a second field leaves that sentence true.

### 3.2 The record, on the appointment, because that is where it is read

**A migration is required and PURPLE MAY NOT AUTHOR ONE** (PORTAL-REHYDRATE
§1.1). This is the piece that makes the whole thing BLUE's to enable:

```
appointments.forced_reason      text null   -- 'outside_hours' | 'conflict'
appointments.forced_by          uuid null   -- users.id
appointments.forced_at          timestamptz null
```

**THREE COLUMNS AND NOT A BOOLEAN.** A boolean answers "was this forced" and
none of the three questions actually asked. And `forced_reason` is what lets the
screen say **which rule** was bypassed, which the dispatch requires and which a
boolean structurally cannot.

**NULLABLE, NOT DEFAULTED.** Every existing row was created before the
distinction existed, and back-filling `false` would assert that none of them was
forced — which is unknown, not false. NULL is "we do not know", and that is the
truth for every row before the column exists.

**WHERE IT RENDERS:** the agenda card and the Marcações row already carry a
chip vocabulary (`StatusChip`, *Sem nota*), and the hover panel already has a
place for provenance (*"Criado por … · Criado em …"*). A forced booking gets a
chip and a hover line naming the rule and the person. That is one more line in
an existing block, not a new surface.

### 3.3 What the refusal becomes

`outside_availability` stops being an error and becomes a **confirmation**, in
the same shape the conflict path already uses: the server answers with the
therapist's windows, the drawer asks, the second submit carries
`allowOutsideHours: true`. The message already names the windows
(`describeWindows`, split-shift aware), so the copy is mostly written.

**THE HARD PATH'S COPY HAS TO CHANGE TOO**, per §0's correction: today one
sentence covers overlap, room and time-off. Three kinds need three sentences,
because "the therapist is away" and "the room is taken" are different problems
with different fixes.

### 3.4 The lote

**A ruling is needed and I will not guess it** (Q-FORCE-3). Today it skips. It
could keep skipping, or offer the override once for the batch, or refuse the
batch. My recommendation: **keep skipping and REPORT the skipped slots as
skipped-for-hours specifically**, because the lote is a bulk convenience and a
per-slot override dialog in the middle of one is worse than a list to review.

---

## 4. WHAT MUST NOT MOVE

- **Migration 0061 stays absolute.** Two confirmed overlapping appointments are
  refused by the database. No field reaches it and none should.
- **`ADVISORY_CONFLICT_KINDS` still feeds the picker panel.** RB-03 left it
  alone on purpose; the warning surface is not the enforcement surface.
- **Unconfigured availability still enforces nothing.** `checkAvailability`
  returns `ok: true, reason: "unconfigured"` when a therapist has no template
  for that location. That is load-bearing and asserted in both directions: a
  clinic that never set hours must not be locked out of its own diary. **A soft
  rule does not change this** — there is nothing to warn about.
- **The picker still only offers slots inside availability.** The override is
  for a time somebody TYPED, and there is deliberately no "was this typed or
  picked" flag, because the server cannot know and a client-supplied flag on a
  rule the client is being restrained by is not a rule.

---

## 5. THE RULINGS — ALL FOUR STAMPED, 2026-09-08

Every recommendation in §5 was taken. They are restated here as decisions, with
what each one binds, because a spec whose answers live in a chat log is the
failure `docs/state/rulings-register.md` §1.6 exists to end.

### Q-FORCE-1 — RB-03 IS REVERSED, ON ONE CONDITION. **STAMPED: yes.**

Outside a therapist's *horário* becomes a SOFT rule: warn and allow.

**The condition is not a preference and the build does not proceed without it:
the force is RECORDED ON THE APPOINTMENT and VISIBLE THERE.** That is the entire
difference between this and PL-11, which warned and forgot, and which was
overturned because a manual entry booked Catarina at 17:00 when her hours end at
13:00 and nothing afterwards could tell that booking from an ordinary one. A
forced booking that carries its own record is a different object: findable,
countable, answerable. Recording a decision does not make it correct; it makes it
reviewable, and reviewable is what RB-03 said was missing.

**AND THE ARGUMENT GOT STRONGER ON 2026-09-08, from a direction nobody planned.**
Castelo Branco reception could not save the weekly schedule editor at all - the
P0 of that morning - and while it was broken she could not book a patient into
hours she knew the therapist worked. **When the schedule is wrong, a hard rule
does not protect anybody: it stops the clinic working.** RB-03 assumed the
schedule is right and the booking is suspect. That assumption failed in
production, and a soft rule with a record is what survives it.

### Q-FORCE-2 — THE HARD PATH GETS THE RECORD TOO. **STAMPED: yes.**

The conflict override (therapist overlap / room taken / time-off block) also
writes the record, **and it gets its own distinct sentence** rather than sharing
the availability one.

The reason is the one §5 gave: without it the NEW soft rule would be better
audited than the harder rule beside it, which inverts the severities - a double
booking would be less traceable than a late finish. It also settles the
correction §2 made to the dispatch's premise: an occupied slot and an explicit
time-off block already share one message, one code and one button today, and
three distinct sentences is what stops `forced_reason` from being a boolean
wearing a name.

### Q-FORCE-3 — *AGENDAR LOTE* KEEPS SKIPPING. **STAMPED: keep skipping.**

The batch does NOT gain an override. It continues to skip a slot it cannot
fill - "partial success is expected behaviour, not an error" - **and it reports
a skipped-for-hours distinctly** from a skipped-for-busy.

That closes the fourth-path problem §4 raised without giving one rule four
answers: refuse becomes warn on the three single-booking call sites, and the
batch keeps its own honest third answer, which is now legible instead of silent.

### Q-FORCE-4 — NO PERMISSION SPLIT. **STAMPED: no split.**

Every role that can force today can force the soft path. `allowOutsideHours` is
available wherever `allowConflict` is, **and the record names who did it.**

The question §5 raised - whether a therapist forcing their OWN hours differs
from reception forcing someone else's - is answered by the record rather than by
a grant. A split would have created a second permission axis to maintain and a
second thing for the screen to explain, to buy a distinction the `forced_by`
column already draws on every row.

---

## 6. WHAT IS STILL BLOCKED, AND IT IS NOT A DECISION

**THE BUILD NEEDS THREE COLUMNS THAT DO NOT EXIST**: `forced_reason`,
`forced_by`, `forced_at` on `appointments`, nullable and never back-filled
(`false` on an existing row would assert something nobody knows). Verified
against the schema: `allowConflict` reaches `audit_log.metadata` as a boolean
and goes nowhere else, so WHO and WHEN are recoverable from the audit log and
VISIBLE ON THE APPOINTMENT is false today - for availability and for the
conflicts that already have an override.

**That is a migration, and §1.1 forbids either lane authoring one.** The record
IS the reversal's justification per Q-FORCE-1, so there is no useful subset to
build first: shipping the warn without the record would be PL-11 exactly, on
purpose, with a ruling saying not to.

**THE ORDER IS: BLUE authors the migration, it is applied, then this builds.**

**STOP — on the columns, no longer on a decision.**
