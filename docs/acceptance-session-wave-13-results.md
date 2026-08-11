# Wave 13 acceptance session - RESULTS

**This file is the RECORD. `docs/acceptance-session-wave-13.md` is the PLAN.**

The plan says so itself at line 1259: *"it is the stop condition, not a status
update."* A gate moves when a row **in this file** carries an observation. It
does not move because the plan describes what an observation would look like.

---

## How to fill this in

Replace `UNRECORDED` in the **Observed** column with what you actually saw, or
with `NOT RUN`. Nothing else.

- **A row left `UNRECORDED` is not a pass.** It means nobody wrote it down.
- **Do not infer a row from a neighbouring row.** Items 16-18 and 20 all consume
  item 14's output; if 14 was skipped, the rest are `NOT RUN`, not failures.
- **Ten rows need a screenshot** (plan lines 1200-1210): items 1, 2, 3, 12, 13,
  15, 16, 17, 18, 20. **Item 18 needs two.** Put the filename or the chat
  timestamp in **Evidence**.
- Every other row stands on your reported observation, which WF-03 counts as
  evidence.

**Created empty on 2026-08-11 by PURPLE, deliberately unpopulated.** The sittings
were run on 2026-08-08 and 2026-08-09 and their observations exist only in chat
and screenshots. PURPLE did not witness them, and inferring a result from a plan
is the exact error the 2026-08-11 gate reconciliation was opened to correct.
Card: `ACC-13-results-uncommitted`.

---

## Sitting metadata

| Field | Value |
|---|---|
| Sitting date(s) | `2026-08-08`, `2026-08-09` (per owner report) |
| Run by | `UNRECORDED` |
| Portal URL used | `UNRECORDED` |
| Platform URL used | `UNRECORDED` |
| Test patient record | `UNRECORDED` |
| Test therapist | `UNRECORDED` |

---

## PRE-FLIGHT

| Block | What it sets up | Observed | Evidence |
|---|---|---|---|
| 0a-0b | `PORTAL_TENANT_ID` set, both auth templates pasted | `UNRECORDED` | |
| 0c | Recovery clock started, link left unopened | `UNRECORDED` | |
| 0d | A patient record carries your mobile | `UNRECORDED` | |
| 0e | **Canary armed** (`OTP_LIVE_SEND` -> `true`), performed at item 4 | `UNRECORDED` | |
| 0f | Designated test patient, same record as 0d | `UNRECORDED` | |
| 0g | Cleanup ledger written | `UNRECORDED` | |
| 0h | Test therapist configured (items 9, 11, 14 depend on it) | `UNRECORDED` | |
| 0i | Incomplete-ficha banner read once, confirmed non-blocking | `UNRECORDED` | |

---

## The checklist

**Kind:** `gate` moves a launch gate. `card` closes a board card. `producer`
creates state the later items consume and closes nothing itself.

| # | Item | Kind | Closes | Observed | Evidence |
|---|---|---|---|---|---|
| 1 | Portal login screen: "Entrar com o seu telemóvel", single field | gate | PG1 | `UNRECORDED` | |
| 2 | `/auth/reset-password` and `/auth/activate` are gone | gate | PG1 | `UNRECORDED` | |
| 3 | Request a code with a NON-canary number | gate | PG1 | `UNRECORDED` | |
| 4 | Perform the 0e arming click path | setup | - | `UNRECORDED` | |
| 5 | Test patient ficha, scroll to terms | card | W13-05 | `UNRECORDED` | |
| 6 | Tick and Gravar, "Aceitação" shown | card | W13-05 | `UNRECORDED` | |
| 7 | Reopen: still unticked, acceptance still shown | card | W13-05 | `UNRECORDED` | |
| 8 | **No fee text anywhere** | card | W13-05 | `UNRECORDED` | |
| 9 | `/admin/staff` -> test therapist -> Horários | card | W13-A | `UNRECORDED` | |
| 10 | Saturday second period, 08:00-13:00 | card | W13-A | `UNRECORDED` | |
| 11 | New-appointment DRAWER, not the agenda grid | card | W13-A | `UNRECORDED` | |
| 12 | Request a code on a real handset | gate | PG1 | `UNRECORDED` | |
| 13 | Enter it, reach the portal dashboard | gate | PG1 | `UNRECORDED` | |
| 14 | **CREATE TWO BOOKING REQUESTS** | **producer** | **nothing** | `UNRECORDED` | |
| 15 | Sign out, reopen: trusted device holds | gate | PG1 | `UNRECORDED` | |
| 16 | Notification centre (bell) shows the pedidos | gate | PG2 | `UNRECORDED` | |
| 17 | Open pedido A, press Confirmar, it confirms | gate | PG2 | `UNRECORDED` | |
| 18 | **The double-booking check** | gate | PG2 | `UNRECORDED` | |
| 19 | Suppression log line in the platform function logs | card | LE-suppression-observation | `UNRECORDED` | |
| 20 | `/notificações` populated, no clinical content | gate | PG4 | `UNRECORDED` | |
| 21 | Recovery link READ before clicking, correct shape | card | LE-auth-recovery-deadend | `UNRECORDED` | |
| 22 | Open the link, set-password screen reached | card | LE-auth-recovery-deadend | `UNRECORDED` | |
| 23 | Staff invite, the half that runs | card | LAUNCH-01 | `UNRECORDED` | |
| 24 | Work the 0g cleanup ledger top to bottom | cleanup | - | `UNRECORDED` | |
| 25 | **DISARM `OTP_LIVE_SEND`** | **required** | see below | `UNRECORDED` | |
| 26 | **Therapist queue and therapist confirm** (added 2026-08-11) | card | ACC-therapist-queue-unobserved | `UNRECORDED` | |

---

## Item 26 - therapist queue and confirm, added 2026-08-11

**Not part of the original plan.** Added after the Task 2 code read established
that therapist notification and therapist confirm are **both already
code-complete** and that what is missing is observation, not construction.

Run all three on a **practitioner-role** account. **(c) is the negative arm and
must not be skipped** - without it, (a) and (b) prove only that something
rendered, not that it was scoped to the right person.

| Sub | What must be shown | Observed | Screenshot |
|---|---|---|---|
| a | An **assigned** therapist opens `/notificações` and **sees a pedido addressed to them** | `UNRECORDED` | |
| b | That same therapist **confirms it successfully** | `UNRECORDED` | |
| c | A **non-assigned** therapist attempting the same pedido gets **`not_found`** | `UNRECORDED` | |

Code evidence, all on `origin/main`: recipient at `booking.ts:408` and
`centre.ts:85`; no role gate on the surface at `notificacoes/page.tsx:20-25`;
capability gate at `actions.ts:1024` with `therapist` holding
`appointments:write` at `permissions.ts:148`; RLS scoping the confirm join at
`actions.ts:1050-1059`. **No code change and no RLS change is needed.**

---

## Item 18 - read this before recording anything

**Half two has never been observed by anyone.** Whether confirming a pedido over
an **existing staff booking** is **REFUSED** is unknown as of 2026-08-11.

The plan calls it a stop-the-session finding (lines 1216-1220): *"a confirm
succeeding over a staff booking = a live double booking."*

It needs **two** screenshots (lines 1208-1210), because one image cannot show
both halves:

| Half | What must be shown | Observed | Screenshot |
|---|---|---|---|
| One | The staff booking **saved with no conflict warning** | `UNRECORDED` | |
| Two | The confirm **REFUSED** | `UNRECORDED` | |

**Until half two is observed it is UNKNOWN, not passing.** It must not inherit a
pass from items 16 and 17.

---

## Item 25 - the disarm, and why it is the most urgent row here

The plan makes this mandatory, not optional, at lines 1161-1165:

> **`OTP_LIVE_SEND` IS DISARMED AT THE END OF THIS SESSION.** R9 authorises
> *supervised canaries*, not a standing arm. "Left armed" is **not** permitted
> merely because it was written down - writing it down is a note, not a decision.

| Field | Value |
|---|---|
| Disarmed at | `UNRECORDED` |
| Redeploy Ready at | `UNRECORDED` |
| Reason to leave armed, if any | `UNRECORDED` |

**A save without a successful redeploy does not disarm a running deployment.**
The Ready timestamp must post-date the save. If the redeploy errored, the flag is
still armed.

**Why this row outranks the rest.** `SEC-otp-unauthenticated-sms-pump`, found by
code read on 2026-08-11, establishes that while this flag is armed the public
`POST /api/v1/auth/otp/request` endpoint dispatches a real Twilio SMS to **any**
well-formed Portuguese number, with no patient lookup and no refusal branch,
across roughly 200,000,000 accepted inputs. The per-phone and per-IP limits do
not bound total spend. **If this row cannot be filled in with a confirmed disarm,
treat the flag as armed and disarm it now.** Governed by
`docs/rulings/R9a-otp-live-send-not-separable.md`.

---

## Gate ledger - fill only from the rows above

Denominator is fixed at 9. `readiness_passed` on the board must equal the count
of `pass` here, and the validator enforces it.

| Gate | Needs | Status | Moves to |
|---|---|---|---|
| PG1 AUTH | items 1, 2, 3, 12, 13, 15 all pass | `fail` | `UNRECORDED` |
| PG2 BOOKING | items 16, 17, 18 all pass (**18 needs BOTH halves**) | `fail` | `UNRECORDED` |
| PG4 NOTIFICATIONS | item 20 passes (empty state already proven 2026-08-05) | `fail` | `UNRECORDED` |

**Item 14 is a producer and closes nothing** (plan line 1235). If item 14 failed,
PG2 and PG4 **cannot be attempted** - record them `NOT RUN`, not `fail`. PG1 is
unaffected: items 12, 13 and 15 stand on their own.

**Item 19 is NOT a gate item.** It closes `LE-suppression-observation`, a card. A
previous dispatch listed it under PG4 in error.

**Ceiling: 6/9.** PG6, PG8 and PG9 cannot move here - LOOPs 6, 7 and 8 are
unbuilt and no screen check can close them (plan lines 1250-1251).

**Current committed readiness: 3/9** (PG3, PG5, PG7), after PG4 was corrected
from `pass` to `fail` on 2026-08-11 for passing on partial credit, which
rehydrate 4.5 forbids.
