# Acceptance sitting, 2026-08-17 - RESULTS

**This file is the committed RECORD of what the owner observed on the deployed
build.** It is the artefact `ACC-13-results-uncommitted` demanded: before it,
the only account of the sitting lived in chat and in the board's card evidence.

**Derived, and here is exactly how, so nobody has to trust it.** Every row below
comes from a card's own `evidence` field on `docs/board/portal-board.json`,
where `kind == "screenshot"` and `at == 2026-08-17` - the shape WF-03 requires
for an owner observation. That query returns exactly fifteen cards. Re-run it and
you get this list:

```
node -e "const b=require('./docs/board/portal-board.json');
  console.log(b.cards.filter(c=>c.evidence?.kind==='screenshot'
    && String(c.evidence.at).startsWith('2026-08-17')).map(c=>c.id))"
```

**NOTHING HERE IS INFERRED FROM A PLAN.** The distinction is the whole reason the
card exists: the earlier 2026-08-08 and 2026-08-09 sittings produced observations
that were never written down, and the board and the acceptance plan then
disagreed about how many gates had moved because neither was reading a record.
Filling those rows from the plan would have laundered an inference into a record.
They remain `UNRECORDED` in `docs/acceptance-session-wave-13-results.md` and
this file does not touch them.

---

## The sitting, as a number

**15 checks. 14 PASS. 0 STOP. 1 SKIPPED** - the sitting's own figure, recorded
identically on every card closed by it. See the count note below: fifteen cards
carry an observation from that day, and the difference of one is left open rather
than resolved.

The skip is `W13-03`, the patient OTP login screens: the checklist was not to
hand. **It is recorded as SKIPPED, not as a pass and not as a failure**, and its
card stays `in_flight` for that reason alone. An unrun check that reads as a
green one is the exact collapse PORTAL-REHYDRATE 1.3 names, and this is the
sitting where it was avoided on purpose rather than by luck.

Its checklist is committed standalone at
`docs/board/W13-03-ACCEPTANCE-CHECKLIST.md` so the next attempt needs nothing
but the file: five steps, four runnable today, the fifth needing a real SMS code
and therefore belonging to the supervised LAUNCH-01 canary while
`OTP_LIVE_SEND` is off.

---

## A COUNT THAT DOES NOT RECONCILE, REPORTED RATHER THAN ADJUSTED

**Fifteen cards carry an owner observation dated 2026-08-17. The sitting reports
fourteen passes.** Both numbers are on the board, in the cards' own evidence, and
this document will not quietly pick one.

The most likely reading, stated as a reading and not as a finding: one of the
fifteen is a **re-confirmation rather than a check**. `STAFF-01` records
"OBSERVED in the 2026-08-17 sitting as well, holding since its own 2026-08-13
acceptance" - it had already been accepted four days earlier, so observing it
again would not add to the sitting's count of checks. That would make it 14
checks plus 1 carry-over plus the W13-03 skip.

**That is arithmetic, not testimony.** Nobody wrote down which item was which, so
it stays an open discrepancy of one. It is recorded here because a document that
silently resolved it would be doing the precise thing `ACC-13` was opened to
stop: turning an inference into a record. If the owner remembers, one line
settles it.

---

## The fifteen cards that carry an observation

Each entry is the observation as its card recorded it on the day.

### 1. `GUEST-03-reception-queue`

**PASS.** a guest request rendered in reception's queue carrying "Preferencia: 21/08/2026, tarde", with the "Novo cliente" mark on the row. BOTH HALVES ARE THE ACCEPTANCE, not one. The MARK is what the ruling required - a guest is visibly not an ordinary appointment. The LABEL is GUEST-04's honest window format: "Preferencia", never "Data", and a PERIOD rather than an invented time. An earlier build rendered "20/08/2026, 09:00

### 2. `GUEST-04-public-guest-form`

**PASS.** the public form at /marcacao submits, and what it produced downstream carried the correct honest window format - a date and a period, never a time the form never offered. Option A on the deployed build: no availability shown, no slot implied.

### 3. `INC-09-confirm-notification-wrong-label`

**PASS.** a confirmation notification renders "Marcacao confirmada" in Portuguese. The raw database enum "confirmed" is gone from the staff screen - which is what this incident was: a fifth notification kind added by migration 0061 with no label, rendered through a `?? e.kind` fallback that turned an unhandled case into plausible-looking English on a pt-PT screen.

### 4. `LE-portal-booking-therapist-step`

**PASS.** the A2 therapist step on the deployed portal booking flow, including the explicit "Escolham por mim" option. THIS CLOSES THE LAST OPEN THING ON THIS CARD. It was found shipped by code read on 2026-08-12 after carrying "CARDED, NOT BUILT" for three days past #857, and the card's own note said the remaining gap was that it had "NOT YET BEEN OBSERVED ON A DEPLOYED SCREEN". It has now.

### 5. `SCHED-01-alternating-week-schedules`

**PASS.** an alternating-week pattern saved clean and the screen answered "Semanas alternadas definidas." The CB/LV flip was then verified ACROSS THE WEEK BOUNDARY - the day the pattern changes clinic - in BOTH consumers: the staff agenda and the portal slot engine. That pairing is the acceptance that mattered. The card's own build note says the two consumers read the dated rows through different code (day-availability-core.ts

### 6. `SCHED-02-therapist-horarios-nav`

**PASS.** a therapist reaches Horarios from the sidebar and sees their OWN schedule and no colleague's. RULING A on screen.

### 7. `STAFF-01-timefield-offstep-value`

**PASS.** in the 2026-08-17 sitting as well, holding since its own 2026-08-13 acceptance: the Editar marcacao Hora control reads the stored minute.

### 8. `STAFF-02-booking-location-unscoped`

**PASS.** the reception LOCATION LOCK on the deployed build. A located receptionist cannot book into a clinic outside their assignment, which is the defect this card was opened for - appointments created at CB by an LV-only staffer who could then never see them.

### 9. `STAFF-03-agenda-hour-row-expansion`

**PASS.** the agenda hour row grows to fit the appointments that start inside it; nothing is clipped.

### 10. `STAFF-04-marcacoes-name-truncated`

**PASS.** the Marcacoes row renders the full patient name over two lines. No "Abilio J..." on the deployed build.

### 11. `STAFF-05-horarios-crash-located-viewer`

**PASS.** /horarios renders for a located viewer. The black "Application error" page is gone.

### 12. `STAFF-06-therapist-blocks-own-schedule`

**PASS.** THERAPIST SELF-SCOPE on the deployed build. A therapist blocks their own schedule and only their own; the Terapeuta control shows their own name as text rather than a selector. THIS IS THE ONE WHERE THE SCREEN COULD NOT HAVE BEEN THE PROOF ON ITS OWN, and the card says why: the dangerous half was never the grant, it was resolveScheduleScope returning null - "unrestricted" - for three different

### 13. `STAFF-07-notification-deep-link`

**PASS.** "Ver marcacao" in Notificacoes opens the appointment it names.

### 14. `W13-04`

**PASS.** the LOOP 4 booking surface on the deployed build - reception's confirm with the transactional availability re-check, and the pedido reaching the queue. STATUS MOVES TO shipped. This card has carried in_flight since 2026-08-07 for exactly one reason, written on it at the time: "WF-03 closes a patient-visible loop on Ivan deployed-screen evidence, batched at the acceptance session." That session has now happened.

### 15. `W13-05`

**PASS.** the ficha clinica terms acceptance on the deployed build, and the per-patient gate behind it. STATUS MOVES TO shipped, for the same single reason W13-04 does: both halves were on main since 2026-08-07 with migration 0058 applied and proven, and the card was held open only for the owner's screen.

---

## What this record does NOT claim

- **It is not the full acceptance history.** The Wave 13 sittings of 2026-08-08
  and 2026-08-09 are a separate document and remain unrecorded, because nobody
  wrote down what was seen and no honest reconstruction is available. That gap is
  a fact about those sittings, not something this file can close.
- **It moves no gate on its own.** A gate moves on its own condition and its own
  evidence. This file records observations; where one closed a card, the card
  says so and carries the ref.
- **It is a derivation, not a transcript.** The owner's words at the sitting were
  in chat. What is preserved here is what each card recorded at the time, which
  is the committed form of the same observation - and the only form that survived.

*Generated 2026-08-18 from the board's close records. Regenerate by re-running
the query above if a card's evidence is ever corrected.*
