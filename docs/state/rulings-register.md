# Binding rulings register

**THE CANONICAL COMMITTED HOME for the Portal Definition of Ready, for JP's
owner rulings, for the clinic's RGPD counsel spec, and for the engineering
decisions in force.** Extracted verbatim from `docs/loops/wave-13/WAVE-13.md`
§1 on 2026-08-20, under board card `WF-01`, which is the owner's ruling of
2026-08-04 that wave docs end after Wave 13.

**ONE COMMITTED HOME, NEVER TWO THAT CAN DRIFT.** That is the whole reason this
file exists, and it is `WF-01`'s own stated reason. `WAVE-13.md` §1 is now a
pointer to this file and carries no second copy of the text. If you are looking
for the register and you found a copy somewhere else, the copy is the bug.

**THE RECONCILIATION THIS EXTRACTION REQUIRED, STATED RATHER THAN GLOSSED.**
`WAVE-13.md` §0 instructs a dispatcher to "Read §1 in full" and paste it with
the loop briefing, and the file's own header argues that "a loop that points at
a sibling file for its rulings is not self-contained". Read literally, that
rationale forbids the pointer this file replaces §1 with. **The rationale was
right for the wave and is spent now:** all eight Wave 13 loops are shipped, no
further loop is dispatched out of that document, and from the next authored loop
onward the BOARD CARD is the loop spec. What self-containment protected — a
stateless terminal receiving everything it needs in one paste — is now the
card's `spec` field's job. **Anyone re-opening Wave 13 as a live document should
treat that as a premise mismatch and halt**, rather than quietly reading the
pointer as though the loops were still dispatchable from it.

**Rulings are the law. When code and a ruling disagree, the ruling wins and the
code is the bug** (`PORTAL-REHYDRATE.md` §2, load order step 4).

---

# 1. BINDING RULINGS REGISTER

Transcribed here so every loop is self-contained. This section is the
**canonical committed home** for the Portal Definition of Ready and for
Decisions B, C and D, none of which had ever been committed before this file.

## 1.1 Portal Definition of Ready — the DoR of record

**Source note.** Supplied by the owner from session handoff on 2026-08-04; never
previously committed; **this section is now the canonical home.** The Portal
Board authored in parallel quotes this exact text as gate conditions **PG1..PG9**.
**The wording must not drift.** Amend by owner ruling only, and amend here first.

Before this section existed, the DoR was referenced by number from committed code
notes (`docs/notifications-work-notes.md:72` cites "DoR item 1";
`docs/notifications-work-notes.md:206` cites "DoR item 4") while the list itself
existed nowhere in the repository or in any branch. That is the defect §1.6 exists
to end.

> **1. AUTH:** OTP by SMS per Decision D with all the limits, trusted device 30
> days, transport behind an interface with a test sink and the Twilio adapter
> behind a flag, pt-PT degradation copy for no phone, landline, shared number.
>
> **2. BOOKING:** patient_bookable with the internalOnly precondition,
> preselection per Decision C, request-mode for the multi-resource set.
>
> **3. APPOINTMENTS:** history, cancel, reschedule UI, confirm and cancel from
> the reminder link via a one-action signed token.
>
> **4. NOTIFICATIONS:** in-app centre on the bell icon. Events for booked,
> cancelled, rescheduled, pedido de marcacao, fanning out to reception and the
> assigned therapist. In-app only.
>
> **5. REMINDERS:** email 48h, SMS 24h, per-channel offsets, distinct content.
> The idempotency key must include channel. Plus resolution of the five-function
> copy-approval halt.
>
> **6. EXPOSURE:** every MUST-NEVER row has an enforcement point. Gap count 1.
>
> **7. ENVIRONMENT:** no silent degradation. Every var has a safe default or
> fails loudly at boot.
>
> **8. SYNC:** 3C proven, portal booking removes the slot from the staff agenda
> and vice versa, hop-by-hop trace with timing named.
>
> **9. EXPERIENCE:** 3E. Mobile-first, WCAG 2.2 AA, pt-PT, 24h format, one
> primary action on landing, patient-readable empty and error states, minimum
> field count.

### 1.1.1 Coverage map — which loop closes which gate

| Gate | Closed by | State at `ffe1e33` |
|---|---|---|
| PG1 AUTH | LOOP 3 | Not started |
| PG2 BOOKING | LOOP 4 | Not started |
| PG3 APPOINTMENTS | LOOP 1 (token half) + precondition PRs (UI half) | Partly built: cancel + reschedule API exist, token confirm/cancel does not |
| PG4 NOTIFICATIONS | LOOP 2 | Not started |
| PG5 REMINDERS | **Already closed by merged work** | See below. Do NOT rebuild |
| PG6 EXPOSURE | LOOP 6 | Not started; matrix does not exist |
| PG7 ENVIRONMENT | **Already closed by merged work** | See below. Do NOT rebuild; do not regress |
| PG8 SYNC | LOOP 7 | Not proven |
| PG9 EXPERIENCE | LOOP 8 | Not audited |

**PG5 is closed on `main` and must not be rebuilt.** Per-channel offsets and the
channel-in-idempotency-key landed in #764 (`6023b2a`,
`apps/web/lib/reminders/offsets.ts`, `channel-idempotency.test.ts`). The
five-function copy-approval halt was resolved by #765 (approval packet) and #766
(`ffe1e33`): all ten patient bodies are `approved: true`, `approvedBy: "JP"`,
`approvedAt: "2026-08-03"` at `apps/web/lib/reminders/notification-registry.ts:61,87`.
The one residue is the 50% fee line, which LOOP 5 gates.

**PG7 is closed on `main` and must not be regressed.** The loud-at-boot posture
landed in #763 (`64124c1`), with the fallback inventory and its six rows recorded
at `docs/notifications-work-notes.md:20-28` and the enforcing test at
`apps/web/lib/reminders/loud-env.test.ts`. Every loop below that touches an env
var inherits this: **no silent default on a notification or token path.**

## 1.2 Owner rulings — JP, in writing

**2026-08-03.**

- **All ten notification bodies approved blanket.** Registry flips are merged
  (#766); do not re-do them.
- **Cancel cutoff is 24 hours.** The portal and the token path refuse inside it,
  with pt-PT copy directing the patient to telephone the clinic.
- **Every patient-initiated change notifies reception plus the assigned
  therapist, in-app.** Cancel and reschedule included. Owner-mandated, not merely
  planned (`docs/notifications-work-notes.md:206-211`).
- **Fee acceptance is a staff-side checkbox on the ficha clínica**, alongside the
  existing confirmations, not pre-checked, captured when staff complete or update
  the ficha. JP confirmed **no existing signed document contains the rule**, so
  this flow is the sole legal path to the fee line ever shipping.
- **SMS opt-out gets no email fallback.** Ratified in writing; recorded in the
  packet's defaults matrix.

**2026-08-03, recorded 2026-08-04 in PR #767 (unmerged at authoring time).**

- **Reschedule minimum notice is 24 hours on the new slot.** This is a *separate
  constant* from the cancellation cutoff even though both are 24. They answer
  different questions about different instants: "is it too late to touch the
  appointment you have" versus "is that new time far enough away to be useful".
  Collapsing them means changing one silently moves the other.

> **Provenance warning.** At `ffe1e33` the committed record still reads
> "**PENDING JP** … the new-slot constraint is deliberately not built. Do not
> infer a value from the cancel cutoff"
> (`docs/notifications-work-notes.md:200-204`, and `docs/rgpd-token-flow.md` §12.2).
> The ruling arrives with PR #767. It is therefore a **precondition** (§3), not
> ground truth, until #767 merges. Do not build against it before then.

**2026-08-04.**

- **`AppointmentView` stays at 8 keys.** A handoff claimed `serviceId` and
  `locationId` "were approved and added, 8 keys to 10". Both halves were false.
  Owner ruled option 2: do not add the ids. Verified independently at authoring
  time: `apps/api/lib/appointments/booking.ts:33-41` has exactly 8 keys — `id`,
  `startsAt`, `endsAt`, `status`, `serviceName`, `locationName`,
  `practitionerName`, `room` — and `apps/portal/lib/api/client.ts` mirrors them.

## 1.3 Clinic RGPD counsel — binding engineering spec

Full text at `docs/rgpd-token-flow.md`, written for counsel and marked BUILT or
SPECIFIED section by section. Binding summary:

- **Action tokens are single-use**, enforced by **server-side consumption state**.
  A signature alone cannot express single use: a correctly signed token verifies
  identically every time. The consumption record is keyed by a **hash of the
  token, never the token itself**, and is written **in the same database
  transaction as the action it authorises**, so a crash cannot leave an action
  performed with a still-redeemable token, nor a token burned with no action
  taken (§6).
- **Validity is 24 to 72 hours from issuance and never past appointment start.**
  Adopted rule: expiry is tied to appointment start, which satisfies both
  constraints with one rule and kills the token the moment it could no longer be
  acted on meaningfully (§4).
- **Cryptographically signed**, HMAC-SHA256 over the encoded payload, keyed by
  `REMINDERS_LINK_SECRET`, verified with a **constant-time** comparison. Every
  failure mode — malformed, forged, expired, unknown appointment, already
  consumed — returns an **identical generic rejection** (§2, §3, §6).
- **One action scope, no session.** A token authorises exactly one action on
  exactly one appointment. It is not a login and cannot be exchanged for one.
- **The token landing page shows date, time and location only.** No service or
  treatment name, ever, for any appointment: several service names identify a
  treatment type, and a page whose contents vary by service leaks by omission
  (§7). No clinical notes, no diagnosis, no practitioner-authored content.
- **A confirmation screen precedes execution.** Opening a link performs nothing.
  One tap to open, one tap to confirm, then the action executes (§7).
- **An audit log for every patient-triggered write**, covering both token
  redemption and authenticated portal actions, with: author, **authentication
  means** (`signed_token` or `otp_session`), **UTC** timestamp, **IP**,
  appointment id, action, and result. **Refusals are logged as well as
  successes** — a rejected cancellation inside the cutoff is exactly what a later
  dispute turns on. **Append-only and integrity-protected**: no `UPDATE` or
  `DELETE` grant for the application role, enforced at the database level rather
  than by convention, plus a trigger refusing modification. A retention hook (a
  timestamp column suitable for a scheduled purge) is provided; the retention
  period itself is open with counsel (§8).
- **Inngest payloads stay identifiers-only**, contacts fetched at execution.
  This is **a documented compliance property that must not regress** (§9),
  enforced by `apps/web/lib/reminders/payload-minimization.test.ts`.
- **The 50% fee line ships only after a recorded per-patient acceptance
  exists.** The gate is **per-patient acceptance AND the global flag, never the
  flag alone** — a global flag on its own would announce a fee to patients who
  never accepted it, which is the exact thing counsel warned about. Wording:
  **"nos termos aceites na marcacao"**.

### 1.3.1 Per-offset action matrix (counsel spec §5, owner cutoff)

| Reminder | Actions offered | Reason |
|---|---|---|
| 48h email | Confirm **and** cancel | Sent outside the 24h cutoff |
| 24h SMS | **Confirm only** | Arrives at or inside the cutoff; cancelling is no longer permitted |

**The cutoff is enforced at redemption, not only at issuance.** A cancel link
issued at 48h is legitimately outside the cutoff when created, but the patient may
click it 30 hours later, inside the cutoff. The server re-evaluates against the
clock **at redemption** and refuses with pt-PT copy directing the patient to
telephone. Enforcing only at issuance leaves a window in which a link that was
valid when sent performs an action the clinic has ruled out.

## 1.4 Engineering decisions in force

**This subsection is the canonical committed home for Decisions B, C and D.**
Before this file, Decision D was cited from code
(`apps/api/lib/notify/registry.ts:12`) and from
`docs/notifications-work-notes.md:67` while its text existed nowhere; B and C
appeared nowhere at all.

- **Decision D — patient login is a 6-digit SMS OTP, phone only, with a trusted
  device of 30 days.** No password, no magic link, no session minted from any
  other artefact.
- **Decision B — `patient_bookable` replaces the name allowlist.** It **does not
  ship without the `internalOnly` check at both call sites plus a refusal test in
  the same PR.** See §1.4.1: this is not a style preference, it is the only thing
  standing between deleting the allowlist and opening a live exposure.
- **Decision C — service preselection from the most recent completed
  appointment, never restriction.** The patient's history preselects; it never
  removes an option they are entitled to book.
- **Request-mode only for:** Massagem 4 Mãos, Sessão Família, and the four
  Pilates mensal tiers. These are multi-resource services that cannot be
  auto-confirmed against a single therapist's calendar; the patient submits a
  *pedido de marcação* and reception confirms.
- **Reminder links are one-action, never a session.**
- **Availability warnings never block saves.**
- **Notes are never patient-facing.**
- **`AppointmentView` stays at 8 keys.**
- **Live sends are opt-in and template-gated.** `REMINDERS_LIVE_SEND` is now the
  only thing between an approved body and a real patient's phone; the test
  `sends NOTHING with live send off, even though all 10 are approved` is
  load-bearing from here on.
- **Env failures in the notification path are loud**, never silent degradation.

### 1.4.1 Why Decision B carries a precondition — verified, not asserted

Re-derived at authoring time from `ffe1e33`:

- `apps/api/lib/appointments/store.ts:262-268` — the **catalog list** query
  filters `eq(services.internalOnly, false)` at `:266`.
- `apps/api/lib/appointments/store.ts:294-309` — `getBookableService`, the
  **single-service resolve**, filters by id and tenant, checks `isActive` and
  `isBookableServiceName(row.name)`, and **never checks `internalOnly`**. It does
  not even select the column.
- `getBookableService` is called on **both patient write paths**:
  `apps/api/lib/appointments/booking.ts:257` (book) and `:291` (reschedule).
- Today the gap is **masked by the name allowlist**
  (`apps/api/lib/appointments/services.ts:39-44` and `:53-55`,
  `BOOKABLE_SERVICE_NAMES` =
  osteopatia, fisioterapia, massagem terapeutica, pilates terapeutico). "Diversos"
  is not on that list, so `isBookableServiceName` refuses it before the missing
  `internalOnly` check matters.

**Deleting the allowlist without adding the `internalOnly` check at
`store.ts:307` opens the exposure.** A patient POSTing a known `internal_only`
service id would book it. This is the one MUST-NEVER gap LOOP 6 expects to find,
and it is the reason LOOP 4 and LOOP 6 are ordered the way they are.

## 1.5 Standing rule — migration numbering is GLOBAL

**Migration numbers and the one-in-flight rule are global across the platform and
portal workstreams. Two boards, one shared line, one production database.**

Every loop that authors a migration **re-derives the actual next free number from
the committed journal at authoring time**
(`packages/db/migrations/meta/_journal.json`, plus the mirrored file set in
`packages/db/migrations/` and `supabase/migrations/`). **Wave-doc reservations in
§5 are intent, not truth.**

**The incident this rule exists to prevent.** A session-held plan reserved 0053
for the patient audit log. While that plan sat in a session, PL-31 authored and
merged `0053_patients_nif_exemption.sql` (#759, `a33db11`, journal idx 52). The
reservation was invisible to the other lane because it had never been committed.
Nothing detected the collision; it was caught only by re-deriving the number from
the journal during Wave 13 authoring. Cite this incident in any loop that queries
a reservation.

**Migration protocol, restated in full for every loop that authors one:**

1. The **executor authors** the migration. The executor **never applies** it.
2. **Ivan applies it from his prod-apply worktree, BEFORE the PR merges.**
3. **Applied counts only with pasted journal output.** A claim of "applied" with
   no pasted evidence is not an apply. Migrations have been shown "applied" in
   this project when they were not; see the 0038-0041 incident in
   `docs/handoff/WAVE-12-CLOSE-20260727.md`.
4. In the prod-apply worktree, check out the branch **detached**
   (`git checkout origin/<branch>`). On `main`, `db:migrate` silently no-ops.
5. **One migration in flight at a time, globally.** A second loop does not begin
   authoring a migration until the first is applied and merged.

## 1.6 Standing rule — re-derive before building

Eight times in the sessions preceding this wave, a claimed protection or decision
turned out not to exist in committed code. The pattern is stable enough to plan
around, and it is recorded in `docs/notifications-work-notes.md` under the
reschedule lane.

**The rule.** Re-derive from committed files before building on any handoff
claim, any board note, any prior-session number, or any statement in this
document. **When a claim cannot be re-derived, halt and report. Never resolve a
mismatch by inventing.**

Wave 13 is itself an instance: the DoR (§1.1) and Decisions B, C, D (§1.4) are
committed here for the first time precisely so the next lane can re-derive them
instead of trusting a relay. **This register ends that class of defect only for
the rulings it carries.** Anything not in this file is still a claim.
