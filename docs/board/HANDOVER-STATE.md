# OsteoJP portal — handover state

**As of 2026-08-12, `origin/main` @ `1cdb36f`.** Written for the person who hands
this build to the clinic team and to legal, and for anyone who reads it after.

**Live board:** https://claude.ai/code/artifact/279ea20f-0b64-4abc-9e64-676803f7740a
**118 cards. 54 shipped, 64 open. Launch readiness 7/9.**

---

## 1. Readiness — 7 of 9

| Gate | State | One line |
|---|---|---|
| **PG1 AUTH** | **PASS** | Phone-only OTP login, removed routes bounce, an unregistered number is refused without disclosing whether it is a patient, and a trusted device does not survive sign-out. All four observed on the deployed build. |
| **PG2 BOOKING** | **PASS** | A staff confirm over an existing confirmed appointment is REFUSED — and refused again at the database when the operator deliberately forces "Guardar mesmo assim". |
| **PG3 APPOINTMENTS** | **PASS** | History, cancel and reschedule render for a linked patient; the reminder-link route is live and fails closed on an invalid token. |
| **PG4 NOTIFICATIONS** | **PASS**, carrying a defect | A therapist confirming a pedido now leaves a record reception can see, with no service name and no clinical content. **The entry's title is wrong** — see risk 1. |
| **PG5 REMINDERS** | **PASS** | 48h email and 24h SMS as separate per-channel offsets with the channel inside the idempotency key, and all ten bodies approved. **Reminders are not live** — `REMINDERS_LIVE_SEND` is false. |
| **PG6 EXPOSURE** | **PASS** | 51-row exposure matrix committed; 23 MUST-NEVER rows, every one with a verified enforcement point. |
| **PG7 ENVIRONMENT** | **PASS** | Every environment variable has a safe default or fails loudly at boot; the full four-app estate was walked. |
| **PG8 SYNC** | **OPEN** | Structure and behaviour proven; the cross-surface e2e is written and its crossing observed in CI. **It once passed for the wrong reason** — matching an unrelated appointment's time — and was held. The assertion is now scoped to the patient's identity. |
| **PG9 EXPERIENCE** | **OPEN** | Not started. Ten portal screens against seven criteria, tool ruled (`@axe-core/playwright`, `wcag22aa`). The largest remaining item; it audits the other seven loops. |

---

## 2. What closed on 2026-08-12, and on what evidence

**Four gates moved in one day: 3/9 → 7/9.**

| Gate | Evidence |
|---|---|
| **PG1** | Owner observation, deployed build. Items 1, 2, 3 and 15 of the acceptance plan. |
| **PG2** | Owner observation. The pedido confirm was refused and stayed pending; then, with the conflict override **deliberately forced**, the database refused it anyway. That second one is the deployed proof of migration `0061`. |
| **PG4** | Owner observation. A third notification appeared at 14:55, newer than the two 14:47 pedido rows, for the right appointment, with no service name. **A row cannot be produced by an absence** — which matters, because the queue emptying alone would have looked identical with a completely broken fan-out. |
| **PG6** | `docs/recon/W13-06-exposure-matrix.md`, plus `apps/api/lib/exposure/patient-surface.test.ts` (51 assertions, 7 negative arms). Every cited enforcement point was then **read line by line**; four citations were wrong and were corrected. |

**Migration `0061` was applied to production** and its journal is recorded verbatim
at `docs/migration-apply-0061.md` §10. The next free migration number is **0062**,
unoccupied.

**INC-08, the confirmed double booking, is CLOSED** — mechanism, both wrong
hypotheses, three fixes and the production evidence, all on the card.

---

## 3. The top three risks before demonstrating this build

### RISK 1 — Reception is shown a FALSE event description on a real event

**`INC-09`, high, open.** A therapist confirming a pedido produces a notification
titled **"Marcação remarcada"** — *appointment rescheduled*. Nothing was
rescheduled.

**Why it matters in a demo:** this is a staff-facing surface that states something
untrue about a clinical appointment. A receptionist acting on it would call a
patient about a change that never happened.

**What is known:** the write is correct — `kind: "confirmed"` is what gets
inserted. The label map has **no `confirmed` case at all** and falls back to
printing the raw database value, so a confirmation should render the literal
English string `confirmed` on a Portuguese screen. **That does not explain
"Marcação remarcada"**, so a third cause is still open and the card says so
rather than guessing. Either way `notifications.kind.confirmed` exists in neither
locale.

**Do not demonstrate the notification centre without mentioning this.**

### RISK 2 — Reminders are NOT live. (The dead-hostname half is FIXED.)

**Two separate facts that are easy to present wrongly.**

`REMINDERS_LIVE_SEND` is **false**. PG5 passing means the reminder *system* is
built and its copy approved — **no patient has ever received one**. The
suppression path has never been observed end to end in a real run.

**RETIRED 2026-08-12, the dead-hostname half.** `apps/portal/.env.example` named
`patient.osteojp.pt`, which does not resolve, and taking it at face value pointed
a running portal at a dead host. It now names the live Vercel host, with the
go-live target, the DNS record needed and the cutover runbook all named inline.

A repo-wide sweep found **13 files** mentioning that hostname; **one** could reach
a running build and it is the one fixed. The other 12 are DNS planning documents,
historical handoffs, and the four board documents that already warn the host does
not resolve. The go-live checklist in `docs/cutover-runbook.md` still curls it,
correctly — that runbook runs *after* the DNS record exists.

`OTP_LIVE_SEND` is armed **for supervised sittings only** and must be disarmed at
the end of each. Its disarm timestamp is still unrecorded.

### RISK 3 — An agenda left open does not learn about a portal booking

**`LE-agenda-does-not-learn-of-portal-bookings`, medium, open.** The portal is a
separate deployment from the staff platform, and `revalidatePath` cannot cross
that boundary. An agenda open on a screen at reception **only** updates when
someone navigates or refreshes.

**It is not a double-booking risk** — the protection is the slot lock and the
`0061` constraint, not the render, and a stale screen cannot create a double
booking. But in a live demo, booking on the portal and pointing at an unrefreshed
agenda will look broken. **Refresh the agenda.**

---

## 4. Every open card, by bucket

**64 open of 118.**

### Incidents — 1
`INC-09-confirm-notification-wrong-label` **(high)** — risk 1 above.

### Blocked on people — 4
All four need an observation or a signature, not a build.
`ACC-13-results-uncommitted` (ivan) · `ACC-therapist-queue-unobserved` (ivan, needs
a **second therapist test account** that does not exist) · `LE-suppression-observation`
(ivan) · `LAUNCH-02-jp-packet-signoff` (jp).

### Security — 3
`SEC-r-token-no-rate-limit` **(high)** — `apps/web` has no rate limiter at all; the
fix is a port or a shared package. · `SEC-allowconflict-not-audited` **(high)** ·
`SEC-otp-unassigned-prefix-500` (medium) — a 500 on the login endpoint that arrives
by uncaught exception, so every future provider failure falls through the same
crack.

### Test-integrity — 4, and they are why the gates can be trusted
`ACC-vacuous-guard-sweep` **(high)** — 123 assertions that may not be able to fail,
with four triage criteria. · `ACC-skippable-suites-unguarded` **(high)** — 36 suites
can still skip inside a passing required check; the structural fix is **ruled** and
scheduled after PG9. · `LE-board-pr-reconciliation` **(high)** — nothing reconciles
merged PRs against card status; three cards have carried a false one. ·
`ACC-identity-blind-assertions` **(high)** — assertions that match shared
vocabulary (a time, a status, a count) rather than identity on a shared seeded
database. **Worse in kind than a skippable suite: a skip fails to prove, an
identity-blind assertion proves something false.** 170 count assertions triaged;
63 are absence assertions and structurally safe, and the presence set is
dominated by static UI structure. Three genuine candidates, none gate-bearing.

### Wave-13 loops and launch — 24
`W13-06a`, `W13-06b`, `W13-08`, the `WF-*` series, `LAUNCH-01` (flag arming),
`LAUNCH-03-client-data-migration`. Several `W13-*` and `LE-*` cards sit at
`in_flight` **on purpose**: WF-03 rules that a patient-visible loop closes on the
owner's deployed screen, not on green CI.

### Loose ends — 28
Includes `LE-inc08-survivor-still-confirmed` **(high)** — now resolved in the
production diary, all four test appointments cancelled — `LE-ocupado-lists-pending-pedido`
(a staff panel contradicting the rule stated on the next screen),
`LE-prod-apply-worktree-loose-scripts` **(high)**, and
`LE-staff-transitions-emit-nothing` (cancel, reschedule and no-show still emit no
notification).

---

## 5. What a reader should know about how these gates were verified

**Read this before trusting any green check on this project.**

Over 2026-08-12 the verification found, in its own work:

- **four wrong citations out of 23** in the exposure matrix — enforcement points
  that pointed at tests which did not prove the row, including one whose mock
  supplied its own answer;
- **a gate-bearing e2e test that SKIPPED inside a passing shard on two
  consecutive runs**, while a PR merged on four green required checks with that
  direction never executed;
- **36 further suites** that can still do the same thing.

Two guards now exist: the test **fails rather than skips** in CI, and
`.github/scripts/assert-e2e-executed.mjs` reddens the job from the report
independently. The preferred evidence standard is recorded in
`docs/board/BOARD-SPEC.md`: **any gate row whose property can be disabled by a
flag should carry a CI arm that disables it and requires the check to fail** —
modelled on `slot-lock-concurrency`, which re-runs itself with the lock off on
every commit and requires that run to be red.

**A green check on this project means more than it did yesterday, and less than
it appears to.** The gates above are stated with their evidence so a reader can
check rather than trust.

---

## 6. Where to look

| What | Where |
|---|---|
| Live board | the artifact URL at the top |
| Board data | `docs/board/portal-board.json` (validate: `node docs/board/validate-board.mjs`) |
| How to boot a session | `docs/board/PORTAL-REHYDRATE.md` |
| Test accounts and their **display names** | `docs/board/FIXTURES.md` |
| The observation sweep | `docs/board/OBSERVE-SWEEP.md` |
| PG6 exposure matrix + citation audit | `docs/recon/W13-06-exposure-matrix.md` |
| PG8 sync trace | `docs/recon/W13-07-sync-trace.md` |
| `0061` applied proof | `docs/migration-apply-0061.md` §10 |
