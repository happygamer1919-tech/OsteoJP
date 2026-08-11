# Remaining work, triaged

**Board:** `docs/board/portal-board.json` @ `as_of 2026-08-11T23:40:00Z`.
**Scope:** every card not `status: shipped`. **56 cards.**
**Shipped and out of scope here:** 46. **Board total: 102.**

Generated from the board, not typed: the generator refuses to emit this file
unless every unshipped card lands in exactly one bucket. So the four counts
below always sum to the unshipped total, and no card can be quietly dropped.

## The partition rule

The four buckets split by **who or what unblocks the card**, which makes them
mutually exclusive without judgement calls:

| Bucket | Unblocked by | Count |
|---|---|---|
| **BUILD** | a terminal | **35** |
| **OBSERVE** | Ivan | **14** |
| **EXTERNAL** | a third party | **4** |
| **LAUNCH-DAY** | launch itself | **3** |
| | **total** | **56** |

`blocked_on` on this board is `ivan | jp | lawyer | infra`. Ivan is deliberately
**not** an EXTERNAL party, which is why everything waiting on him is OBSERVE even
when what he owes is a ruling rather than a screenshot.

---

## BUILD — 35

Code work a terminal can do. Nothing outside this repo has to happen first.

| Card | Pri | Status | Note |
|---|---|---|---|
| `W13-06` | high | todo | Umbrella for 06a/06b. Carries no work of its own. |
| `W13-06a` | high | todo | LOOP 6 Phase A - rebuild the exposure matrix from the code. Blocked by dependency on A2, not by anything external. |
| `W13-06b` | high | todo | LOOP 6 Phase B - close every deficient row Phase A names. Depends on 06a. |
| `W13-07` | high | todo | LOOP 7 SYNC proof. Depends on LOOP 6 merged. |
| `SEC-r-token-no-rate-limit` | high | todo | apps/web has no rate limiter at all. Structural port; a LOOP 6 Phase B output, NOT AMBER's (rehydrate 1.1). |
| `INC-08-double-booking-state-not-path` | high | todo | Diagnosis complete. The fix is a btree_gist EXCLUDE = a MIGRATION, so it cannot start until the 0061 slot clears. |
| `ACC-vacuous-guard-sweep` | high | todo | 123 assertions that cannot fail, across 385 test files. Large, mechanical, high value. |
| `AI-02-payload-structural-drift` | high | todo | A partner key mapping to no ficha field is silently discarded. |
| `WF-03` | high | todo | Owner ruling: a patient-visible loop closes only on the deployed screen |
| `WF-04` | high | todo | Owner ruling R1: extending the patient-change event contract from 2 kinds to 4 is growth,  |
| `WF-05` | high | todo | Owner ruling R2: for dual-therapist services, BOTH assigned therapists are notified |
| `WF-06` | high | todo | Owner ruling R3: the OTP rate limiter gets a durable store on the EXISTING Postgres - no n |
| `WF-07` | high | todo | Owner ruling R4: patient linkage is phone-match at OTP claim time, and it REFUSES on anyth |
| `WF-08` | high | todo | Owner ruling R5: delete sendPatientActivation - it grants a session by design and has no c |
| `WF-11` | high | todo | Owner ruling R8: migration choreography unchanged - author, PR, paste-ready apply block, h |
| `WF-12` | high | todo | Owner ruling R9: REMINDERS_LIVE_SEND and INVITES_LIVE_SEND stay off through acceptance - a |
| `WF-13` | high | todo | Owner ruling R10: credential rotation confirmed by Ivan 2026-08-05 - the exposure card clo |
| `WF-14` | high | todo | Owner ruling: GREEN is retired - custody of the platform board transfers to PURPLE, closur |
| `WF-15` | high | todo | Owner ruling: legal and regulatory work leaves engineering - external counsel owns it |
| `WF-16` | high | todo | Owner ruling: supervision minimized - one acceptance session at wave end, four return cond |
| `W13-08` | medium | todo | LOOP 8 experience pass. Runs last, deliberately: it audits the others. |
| `AI-01-projection-null-safety` | medium | in_flight | In flight, NO EVIDENCE on the board. The only in-flight card with none. |
| `LE-pedido-emit-best-effort` | medium | todo | A failed appointment_request emit loses the pedido AND makes it block. Known weakness recorded in 0059:82-90. |
| `LE-vacuous-template-guard` | medium | todo | The email-template guard passes on a comment. |
| `LE-portal-booking-therapist-step` | medium | todo | **A2 — THIS IS PURPLE'S NEXT CARD.** It precedes LOOP 6 by dependency (rehydrate 1.1): Phase A enumerates the patient-facing surface and A2 *adds* to it, so a matrix built before A2 is wrong on arrival. Its `medium` priority reflects its size, not its order. |
| `LE-portal-booking-home-clinic-preselect` | medium | todo | Portal booking preselects the home clinic. |
| `LE-portal-multi-appointment-booking` | medium | todo | Portal exposure of Agendar lote. |
| `LE-reminders-landline-dispatch` | medium | todo | **AMBER, 2026-08-11.** The OTP route now refuses landlines; the shared reminder path does not. Consequence of the fork-2 ruling. |
| `LE-staff-assisted-activation` | medium | todo | Buildable now; WF-07 rules it POST-LAUNCH, so it is scheduled late, not blocked. |
| `WF-01` | medium | todo | Owner ruling: wave docs end after Wave 13 - the board card becomes the loop spec |
| `WF-09` | medium | todo | Owner ruling R6: owner verifications are batched - trigger at 3 or more waiting, or when n |
| `WF-10` | medium | todo | Owner ruling R7: no launch date - the condition is a patient completing every planned port |
| `SEC-otp-request-tenant-500-oracle` | low | todo | **AMBER, 2026-08-11.** An unknown tenantId answers 500 where a known one answers 204 - a tenant-existence oracle. |
| `LE-notes-list-hydration-mismatch` | low | todo | toLocaleString differs server vs client. Low. |
| `LE-stale-auth-user-id-sweep` | low | todo | PURPLE authors the read-only count, Ivan runs it. The authoring half is terminal work. |

## OBSERVE — 14

Built and merged. Waiting only on Ivan - a deployed screen, a log line, a ruling, or a confirmation to close. No terminal can advance these.

| Card | Pri | Status | Note |
|---|---|---|---|
| `W13-03` | high | in_flight | LOOP 3 patient AUTH. #828 merged. Held in_flight ON PURPOSE under WF-03. |
| `W13-04` | high | in_flight | LOOP 4 booking. #830 merged. Same hold. |
| `W13-05` | high | in_flight | LOOP 5 ficha terms. #833 + #835 merged, 0058 applied. Same hold. |
| `LE-auth-recovery-deadend` | high | in_flight | #837 merged. Closes on ONE real Gmail-aged link reaching set-password. Ivan must re-paste two Supabase templates FIRST. |
| `ACC-13-results-uncommitted` | high | blocked (ivan) | The results file. Five rows now carry the 2026-08-11 closure ruling; item 25 (was OTP_LIVE_SEND disarmed) is still the most urgent blank. |
| `ACC-therapist-queue-unobserved` | high | blocked (ivan) | Item 26 a/b/c. Code-complete, never seen. (c) is the negative arm and must not be skipped. |
| `ACC-13-item20-staff-fanout` | high | blocked (ivan) | HALTED on a contract ruling. PG4 cannot pass until Ivan rules. Recommended default is on the card. |
| `LE-suppression-observation` | high | blocked (ivan) | Watch for the log line on the next real booking. |
| `VERIFY-QUEUE` | medium | todo | The mechanism card for WF-09/WF-16 batching. Its notes ARE the queue. |
| `LE-portal-supabase-residue` | medium | in_flight | **#841 merged, verified ancestor of main.** Same. |
| `LE-trusted-device-revoke` | medium | in_flight | **#843 merged, verified ancestor of main.** Same. |
| `LE-e2e-nif-edit-404` | medium | in_flight | Merged as CAPTURE, not fix. Closes when the flake recurs a third time already diagnosed - it waits on an event, not on work. |
| `LE-prod-scripts-cleanup` | low | blocked (ivan) | Inventory the one-off prod scripts staged outside the repo. |
| `LE-env-sweep-scope` | low | in_flight | **#843 merged, verified ancestor of main.** Appears to need nothing - see the hygiene note below. |

## EXTERNAL — 4

Waiting on a third party: JP, Eduardo, external counsel, or the cybersecurity engagement.

| Card | Pri | Status | Note |
|---|---|---|---|
| `LAUNCH-02-jp-packet-signoff` | high | blocked (jp) | **JP.** Formal packet sign-off. Gates template arming on launch day. |
| `LE-portal-reminder-confirm-loop` | medium | todo (jp) | **JP** on the inbound-SMS half. NOTE: the EMAIL confirm-by-link half has no blocker at all and is buildable today (/r/[token] is live, PG3 passed on it). |
| `LAUNCH-03a-caderno-encargos` | low | halted | **Eduardo.** The document is written (docs/migration/caderno-encargos-exportacao.md). The whole block is Ivan forwarding it. |
| `END-legal-sweep` | low | halted | **External counsel + cybersecurity.** WF-15: legal left engineering. Any future legal finding APPENDS here silently and never opens a card. |

## LAUNCH-DAY — 3

Impossible before launch by definition. Not backlog, not blocked - not yet possible.

| Card | Pri | Status | Note |
|---|---|---|---|
| `LAUNCH-01` | high | todo | Arm the live sends under supervision, in order, canary first. WF-12 holds REMINDERS_LIVE_SEND and INVITES_LIVE_SEND off until this. |
| `LAUNCH-03-client-data-migration` | high | todo | ~10,000 real patient records from the vendor. Nothing anywhere tracks it. |
| `LE-primary-location-backfill` | low | todo | Runs AFTER LAUNCH-03, never before: the patients whose home clinic matters do not exist in the database yet. |

---

## The sixteen WF cards are one PR, not sixteen tickets

`WF-01`, `WF-03`, `WF-04`, `WF-05`, `WF-06`, `WF-07`, `WF-08`, `WF-09`, `WF-10`, `WF-11`, `WF-12`, `WF-13`, `WF-14`, `WF-15`, `WF-16` are **owner rulings that have already been given.**
Each card quotes its ruling verbatim in its own notes. They sit at `status: todo`
with `evidence: null` for one reason: **none of them is written into**
**`docs/DECISIONS.md`.** Verified 2026-08-11 by grep over that file - R2 through
R10 and the four unnumbered rulings return zero hits.

So 15 of the 35 BUILD cards are a single documentation PR:
append each ruling to `DECISIONS.md`, close each card with that commit as evidence.
No code, no migration, no owner time. **It is the cheapest large move on the board**
and it matters for a handover: right now the project's governing decisions live in
board notes, which is exactly the condition `ACC-13-results-uncommitted` exists to
complain about.

---

## Flags a handover needs to see

These are annotations on the buckets above, not a fifth bucket.

### 1. Four cards read "merged, on main" but sit `in_flight`

`LE-env-sweep-scope`, `LE-portal-supabase-residue`, `LE-trusted-device-revoke`,
`LE-e2e-nif-edit-404`. Each carries a **STALE-REF CORRECTION dated 2026-08-11**
recording that its PR is merged and is a verified ancestor of `origin/main` - the
board was wrong, not the work. Unlike `W13-03/04/05`, none of them says "STATUS
STAYS in_flight ON PURPOSE", so none is being held by WF-03.

**They were not flipped to `shipped` in this dispatch, deliberately.** Flipping four
cards to shipped on my own reading of their notes is the kind of silent
reconciliation rehydrate §3 forbids as a first act. Three of the four (`env-sweep`,
`supabase-residue`, `trusted-device-revoke`) look closeable on inspection;
`e2e-nif-edit-404` genuinely is not - it shipped as *capture, not fix* and closes only
when the flake recurs a third time already diagnosed. **One owner sentence closes
three cards.**

### 2. `SEC-otp-unauthenticated-sms-pump` — the flag RESOLVED itself mid-dispatch

Raised as a contradiction (board said `blocked_on: ivan`, rehydrate §1.1 assigned it
to AMBER as the highest-priority card), then answered before this file was written.
**AMBER shipped it**: branch `sec/SEC-otp-sms-pump-ceiling`, commits `f5ed2b9` +
`5fae227`, PR #865. The card is now `shipped` and out of this file's scope. The
rehydrate was right and the board was stale.

**How that reached this board matters, because it is not the normal path.** AMBER
republished the shared artifact at 22:20; this session's publish was refused as a
conflict. `origin/main` had NOT moved, so the divergence was on AMBER's unmerged
branch. Rather than force-publish and silently delete two of their cards from the
owner's only status surface, **this board was rebuilt on AMBER's board as base and
this dispatch's edits re-applied on top.** The two lanes' card sets are disjoint, so
the merge is content-preserving and the validator passes at 102.

**The risk that creates, stated rather than hidden:** this branch now asserts
`SEC-otp-unauthenticated-sms-pump: shipped` on the strength of an UNMERGED branch. If
PR #865 is revised or abandoned, that assertion is wrong until this board is
corrected. It carries AMBER's own evidence ref, so it is their claim preserved, not
a new one made here.

### 3. Nothing here is startable that needs a migration

`0061` is **reserved and unauthored**, released only after AMBER's OTP PR merges
(rehydrate §1.1, standing rule 8: one migration in flight across the whole repo).
Two cards in BUILD are gated behind that slot:

- `INC-08-double-booking-state-not-path` - the `btree_gist` EXCLUDE constraint.
- `ACC-13-item20-staff-fanout` - a fifth notification kind is pinned by a CHECK
  constraint in migration `0055`, so it needs a migration *and* an owner ruling.
  (Filed under OBSERVE, because the ruling blocks it before the migration does.)

### 4. The dependency chain inside BUILD is strictly serial

`LE-portal-booking-therapist-step` (A2) → `W13-06a` → `W13-06b` → `W13-07` → `W13-08`.
A2 precedes LOOP 6 because Phase A enumerates the patient-facing surface and A2 *adds*
to it. LOOP 8 runs last because it audits the others' output. **The other BUILD cards
are order-free** and are where a second terminal should go.

