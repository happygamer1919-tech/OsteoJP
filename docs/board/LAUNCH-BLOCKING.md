# Launch-blocking subset - a DERIVED view of the portal board

**Generated 2026-08-11 from `docs/board/portal-board.json` at `2026-08-11T13:25:04Z`.**

**This file edits nothing.** No card was re-statused to produce it. It is a
reading of the board, and if it disagrees with the board the **board wins** and
this file is regenerated.

**The test applied to every card, and it is deliberately strict:** a card is
**LAUNCH-BLOCKING** only if *the platform cannot be handed to the clinic without
it*. Not "would be better with". Not "we said we would". If the clinic could open
on Monday and work around it, it is POST-LAUNCH.

---

## Counts

| Class | Count |
|---|---|
| **LAUNCH-BLOCKING** | **20** |
| POST-LAUNCH | 28 |
| DEFERRED | 2 |
| **Unshipped total** | **50** |
| Shipped | 42 |
| **Board total** | **92** |

**Reconciliation:** 20 + 28 + 2 = **50** unshipped, and 50 + 42 = **92** total. Both sums check.

### Two things the raw count hides

**1. 15 of the 28 POST-LAUNCH cards are RULING RECORDS, not work.** Every
`WF-*` card is a standing owner ruling already in force, parked in `todo`
permanently because a ruling never "ships". They inflate the unshipped count by
15 and represent **zero remaining effort**. Real POST-LAUNCH work is
**13 cards**.

**2. Two POST-LAUNCH cards were superseded this dispatch.**
`LE-portal-booking-home-clinic-preselect` and
`LE-portal-booking-therapist-step` describe A1 and A2, both now built and
merged. They need **closing, not building**, and are flagged here rather than
re-statused because this file does not edit the board.

---

## LAUNCH-BLOCKING, by lane

**9 are BUILD. 11 are OWNER-OBSERVATION under WF-03** - already built,
waiting only to be seen working on a deployed screen. That split is the useful
number: **more than half of what blocks launch is not engineering.**

### PURPLE lane (11)

| Card | Kind | Why it blocks handover |
|---|---|---|
| `W13-03` | owner-observation | PG1 AUTH. Built and merged; closes only on the owner's deployed screen (WF-03). |
| `W13-04` | owner-observation | PG2 BOOKING. Built and merged; closes only on the owner's deployed screen. |
| `W13-06` | build | PG6 EXPOSURE. No committed MUST-NEVER matrix exists, so nobody can say what a patient must never reach. |
| `W13-07` | build | PG8 SYNC. Portal booking removing the slot from the staff agenda is unproven; a double booking is a clinical event. |
| `W13-08` | build | PG9 EXPERIENCE. WCAG 2.2 AA and pt-PT are handover conditions, not polish. |
| `W13-05` | owner-observation | Terms acceptance gates the fee line. Built; awaiting the owner's screen. |
| `VERIFY-QUEUE` | owner-observation | The mechanism the acceptance sitting runs from. Empty queue is the handover condition. |
| `LE-pedido-emit-best-effort` | build | A failed emit loses the pedido silently - the INC-06 class. Reception never learns a patient asked. |
| `ACC-13-results-uncommitted` | owner-observation | The only thing between 3/9 and 6/9. Three gates are unproven for want of a written record, not for want of work. |
| `ACC-therapist-queue-unobserved` | owner-observation | Therapist notification and confirm are code-complete and have never been seen working. |
| `SEC-r-token-no-rate-limit` | build | apps/web has no rate limiter at all. A LOOP 6 output; the exposure matrix has to name an enforcement point. |

### AMBER lane (9)

| Card | Kind | Why it blocks handover |
|---|---|---|
| `LE-suppression-observation` | owner-observation | The suppression path has never run end to end. First observable on the first armed send under LAUNCH-01. |
| `LAUNCH-01` | owner-observation | The live sends are OFF. A clinic cannot operate with no reminders reaching patients. |
| `LE-auth-recovery-deadend` | owner-observation | Staff password recovery. Needs two templates pasted and one real aged link proven. |
| `LAUNCH-02-jp-packet-signoff` | owner-observation | JP signs the patient-facing copy packet. Unsigned copy must not reach a patient. |
| `LAUNCH-03-client-data-migration` | owner-observation | The real book has to be in the platform. Without it the clinic has an empty system. |
| `LE-stale-auth-user-id-sweep` | build | Its own title says pre-launch. Patients with a stale auth_user_id are silently unlinkable at OTP claim. |
| `LE-staff-no-forgot-password` | build | Staff login has no recovery link at all. A locked-out therapist on day one has no self-serve path. |
| `SEC-otp-unauthenticated-sms-pump` | build | Arming OTP for real patients turns a public endpoint into an uncapped SMS sender across ~200M numbers. |
| `SEC-sentry-frame-vars` | build | Clinical payload could leave as Sentry stack-frame locals. RGPD, and rule 7 forbids PII in logs. |

---

## POST-LAUNCH (28)

The clinic can open without these.

### Real work (13)

| Card | Kind | Why it does not block |
|---|---|---|
| `LE-notes-list-hydration-mismatch` | work | Cosmetic hydration warning on one list. No patient-visible failure. |
| `LE-env-sweep-scope` | work | Work merged (#843). Card open for closure bookkeeping only. |
| `LE-prod-scripts-cleanup` | work | Repo hygiene. No runtime effect. |
| `LE-staff-assisted-activation` | work | A fallback for patients WF-07 refuses. Reception can act manually until it exists. |
| `LE-portal-supabase-residue` | work | Dead-branch removal, merged (#841). Bookkeeping. |
| `LE-trusted-device-revoke` | work | Merged (#843). Bookkeeping. |
| `LE-e2e-nif-edit-404` | work | A diagnostic capture for a test flake, merged. Not patient-facing. |
| `LE-portal-booking-home-clinic-preselect` | work | SUPERSEDED by A1, shipped this dispatch. Needs closing, not building. |
| `LE-portal-booking-therapist-step` | work | SUPERSEDED by A2, shipped this dispatch. Needs closing, not building. |
| `LE-portal-reminder-confirm-loop` | work | Reminder confirm loop. Reminders themselves ship under LAUNCH-01; this is the enhancement. |
| `LE-portal-multi-appointment-booking` | work | New booking feature. The clinic books multiples by phone today. |
| `PW-B-sms-confirm-link` | work | An enhancement to a reminder that already sends. Blocked on JP's copy, not on launch. |
| `LE-primary-location-backfill` | work | Explicitly a LAUNCH-03 follow-on. The patients it serves do not exist yet. |

### Ruling records (15) - no work attached

| Card | Kind | Note |
|---|---|---|
| `WF-01` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-03` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-04` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-05` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-06` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-07` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-08` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-09` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-10` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-11` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-12` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-13` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-14` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-15` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |
| `WF-16` | ruling record | Standing ruling already in force. A record, not work - it never 'ships'. |

---

## DEFERRED (2)

| Card | Kind | Why |
|---|---|---|
| `END-legal-sweep` | - | Halted. External counsel, outside engineering (WF-15). |
| `LAUNCH-03a-caderno-encargos` | - | Halted by the owner. Vendor spec, deferred until code-ready plus clinic review. |

---

## What this says, in one paragraph

**20 cards stand between here and handover, and 11 of them are the owner
looking at a screen.** The engineering remainder is **9 cards**: the three
unbuilt loops (PG6, PG8, PG9), three security items, and three auth or
notification gaps. The largest single lever is not a build at all - it is
`ACC-13-results-uncommitted`, which can move readiness from 3/9 to 6/9 with no
code, because three gates are unproven for want of a written record rather than
for want of work.
