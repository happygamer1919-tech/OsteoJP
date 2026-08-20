# Wave 13 — Portal Definition of Ready, execution loop set

Authored 2026-08-04 against `origin/main` at `ffe1e33` (#766).

This file is the single human-readable source of truth for Wave 13, in the shape
of `docs/design/wave-01/WAVE-01.md`. It differs from waves 02 through 12 in one
way, deliberately: those waves put one loop per file under
`docs/loops/wave-NN/`. Wave 13's loops are carried **inside this one file**
because each loop must be dispatchable into a **stateless terminal that has read
nothing else**. A loop that points at a sibling file for its rulings is not
self-contained. The 7-field Loop Package required by `docs/loops/README.md` is
carried in full by every loop below.

**Ground truth is committed files. Never a chat claim, never a handoff summary,
never this document where it disagrees with the code.** Where this document
states a fact about the codebase it cites the path and line so you can re-derive
it. If a citation does not match what you read, that is a halt, not a discrepancy
to smooth over. See §1.6.

---

## 0. How to run this wave

1. Read §1 in full. It is the rulings register. Every loop assumes it.
2. Read §3. The wave does not start until its preconditions are met.
3. Run loops in the order given. **One at a time.** The next loop does not begin
   until the previous loop's PR is merged to `main`.
4. Each loop opens with a **BRIEFING** block. That block plus §1 is everything a
   fresh terminal needs. Paste both.
5. Migrations: **one in flight across the whole platform**, and the number is
   re-derived at authoring time, never taken from §5. See §1.5.

---

# 1. BINDING RULINGS REGISTER — MOVED, 2026-08-20

**The register now lives at [`docs/state/rulings-register.md`](../../state/rulings-register.md).**
It was moved there verbatim: the 284 lines that stood here, byte for byte, with
a provenance header added above them and nothing else changed. Read it there.

**WHY IT MOVED, and it is not tidying.** Board card `WF-01` carries the owner's
ruling of 2026-08-04: *wave docs end after Wave 13; from the next authored loop
onward, the board card IS the loop spec.* The register outlives the wave doc, so
it needed a home that is not inside a document about to stop being written. The
ruling's own stated reason is the one that matters: **one committed home, never
two that can drift.** That is why this is a pointer and not a second copy.

**READ THIS BEFORE YOU DISPATCH ANYTHING OUT OF THIS FILE.** §0 above tells you
to read §1 in full and paste it with the loop briefing, and this file's header
argues that a loop pointing at a sibling file for its rulings is not
self-contained. **Taken literally, that forbids the pointer you are reading.**
The rationale was correct for the wave and it is spent: all eight Wave 13 loops
are shipped, no further loop is dispatched from this document, and what
self-containment protected — a stateless terminal getting everything in one
paste — is now the board card's `spec` field's job.

**EVERY LINE NUMBER CITED AGAINST THIS FILE BEFORE 2026-08-20 IS NOW WRONG, AND
THE CORRECTION IS ARITHMETIC.** The register was lines 35-318. Removing it and
leaving this pointer moved everything below by exactly **258 lines**:

| A citation written before 2026-08-20 | Where it is now |
|---|---|
| below the register (line > 318) | **subtract 258** from the line number; same file |
| inside the register (lines 35-318) | **subtract 3** and read `docs/state/rulings-register.md` instead |

Verified against all four distinct targets cited on the portal board: old 233
(register §1.4) -> register line 230; old 932 -> 674; old 949-967 -> 691-709;
old 1006 -> 748. The ten citations on the board itself were rewritten in the
same commit, so **this table is for citations OUTSIDE the board** - a chat
transcript, a PR body, a session report - which cannot be rewritten and which
would otherwise land on the wrong line while looking perfectly plausible.

**If you are re-opening Wave 13 as a LIVE document, that is a premise mismatch.**
Halt and report it rather than reading this pointer as though the loops here were
still dispatchable. The contradiction is recorded, not resolved away, at the top
of the register itself.

---

# 2. THE LOOPS

Eight loops, in dispatch order. **Strictly one at a time.** The next loop starts
only after the prior loop's PR merges. No stacking on unmerged branches.

---

## LOOP 1 — One-action token endpoint, audit log, consumption state

> ### BRIEFING — LOOP 1
>
> You are a stateless executor on repo `happygamer1919-tech/OsteoJP`. You have
> read nothing else. Read §1 of `docs/loops/wave-13/WAVE-13.md` in full before
> starting; it is the binding rulings register and this loop assumes all of it.
>
> **Task.** Build the one-action token redemption endpoint to the RGPD counsel
> spec in §1.3, and author the migration that gives it the two tables it needs:
> the patient audit log and the token consumption state. **One migration, both
> tables.**
>
> **You author the migration. You never apply it.** Ivan applies from his
> prod-apply worktree BEFORE the PR merges. Applied counts only with pasted
> journal output. Re-derive the migration number per §1.5; §5 reserves 0054 as
> *intent*, and PL-31 already consumed a number a session-held plan had reserved.
>
> Ground truth is committed files. Where §1 cites a path and line, verify it. A
> citation that does not match is a halt, not a discrepancy to smooth over.

**Closes:** PG3 (token half). **Depends on:** §3 preconditions.

### 1. Scope and ground truth

Build:

- `GET`/`POST` token landing and redemption under the API app, alongside the
  existing patient routes in `apps/api/app/api/v1/`.
- One migration creating (a) the patient audit log table and (b) the token
  consumption table.

Ground truth to read first:

| Path | What it gives you |
|---|---|
| `docs/rgpd-token-flow.md` | The counsel spec. §2 issuance, §3 verification, §4 validity, §5 scope + per-offset matrix, §6 single use, §7 landing page, §8 audit log fields and integrity |
| `apps/web/lib/reminders/link-token.ts` | `signRescheduleToken` / `verifyRescheduleToken`. Signing and verification are **BUILT**. Note `:81`: a missing `REMINDERS_LINK_SECRET` logs loudly and still returns `null`, so a misconfiguration is indistinguishable from a forgery to the caller. Preserve that property |
| `apps/web/lib/reminders/link-token.test.ts` | The existing token test shape |
| `apps/api/lib/appointments/booking.ts` | `rescheduleAppointment`, `cancelAppointment`, the cutoff calls, `AppointmentView` (8 keys, `:33-41`) |
| `apps/api/lib/appointments/cutoff.ts` | `isWithinCancellationCutoff`, `CANCELLATION_CUTOFF_HOURS` |
| `apps/api/lib/appointments/http.ts`, `errors.ts` | The established error-response shape. Reuse; do not invent a second one |
| `packages/db/migrations/0053_patients_nif_exemption.sql` | The migration file shape to mirror |
| `packages/db/migrations/meta/_journal.json` | The journal. Re-derive the next free idx and tag from here |
| `packages/db/src/schema.ts` | Drizzle schema; add the two tables here too |
| `packages/i18n/src/portal/strings.pt.json` | pt-PT strings. All patient-facing copy goes here |

### 2. Ordered steps

1. Re-derive the next free migration number from
   `packages/db/migrations/meta/_journal.json`. Record what you derived and what
   §5 predicted. If they differ, follow the journal and say so in the report.
2. Author the migration: patient audit log + token consumption, **one file**,
   mirrored into `packages/db/migrations/` and `supabase/migrations/` with the
   journal entry, matching how 0053 is laid out.
   - Audit log columns per §1.3: author (patient id), authentication means
     (`signed_token` | `otp_session`), UTC timestamp, IP, appointment id, action,
     result, plus the retention timestamp hook.
   - **Append-only, enforced at the database level**: revoke `UPDATE`/`DELETE`
     from the application role and add a trigger refusing modification. Not a
     convention, not application code.
   - Consumption table keyed by a **hash of the token**, never the token.
3. **Stop. Hand the migration to Ivan for apply.** Paste the file and the derived
   number. Do not proceed to step 4 until you have his pasted journal output.
4. Build redemption. Verification reuses `verifyRescheduleToken`; on top of it:
   - consumption check and **consumption write in the same transaction as the
     action**;
   - **cutoff re-check at redemption** against the clock now, per §1.3.1;
   - **identical generic rejection** for malformed, forged, expired, unknown, and
     already-consumed. Prove they are indistinguishable.
5. Build the landing page: **date, time, location only**. No service name, no
   clinical content, for any appointment. Then a **confirmation screen** before
   execution.
6. Per-offset action wiring: the **48h email link offers confirm and cancel**;
   the **24h SMS link is confirm-only** because it arrives inside the cancel
   cutoff. The offered action set is derived from the token scope, and the server
   re-checks the cutoff regardless of what the client sends.
7. Write every audit row: **successes and refusals both.**
8. pt-PT copy for the cutoff refusal, directing the patient to telephone the
   clinic.

### 3. Definition of done — machine-verifiable

- A test proves a second redemption of the same token is refused, and refused
  with the **same response body and status** as a forged token.
- A test proves the action and the consumption record commit or roll back
  **together**: force a failure between them and assert neither landed.
- A test proves a cancel token issued at 48h and redeemed at 30h before start is
  **refused** with the pt-PT telephone copy.
- A test proves the 24h SMS token **cannot** cancel even if the request asks for
  cancel.
- A test proves the landing payload contains no service name and no clinical
  field, for a service whose name identifies a treatment type.
- A test proves a refusal writes an audit row.
- A DB-gated test proves `UPDATE` and `DELETE` on the audit table are refused for
  the application role.
- `payload-minimization.test.ts` still passes: no contact detail entered any
  event payload.
- Lint, typecheck, unit, DB-gated tests, build all pass.

### 4. Evidence — pasted output required

- The derived migration number and the journal lines you derived it from.
- **Ivan's pasted apply output**, with the journal idx after apply.
- Full test output for the DoD tests above, named, not summarised.
- The two rejection bodies side by side (consumed vs forged) showing they are
  byte-identical.
- The landing-page payload for a treatment-identifying service.

### 5. Restrictions and scope boundary

- **Do not apply the migration.** Author only.
- **Do not build the reschedule UI.** That is the precondition PR's follow-up.
- **Do not touch the notification registry or any template body.** All ten are
  approved and merged; changing one re-opens a clinical review.
- **Do not add fields to any Inngest event payload.** §1.3, compliance property.
- **Do not mint a session from a token, ever, under any flag.**
- **Do not add `serviceId` or `locationId` to `AppointmentView`.** Owner ruled
  option 2 on 2026-08-04; it stays at 8 keys.
- No new third-party dependency without asking.

### 6. Halt-loud protocol

Halt and report, do not work around, if:

- The derived migration number is already consumed by another lane mid-loop.
- `verifyRescheduleToken`'s behaviour differs from `docs/rgpd-token-flow.md` §3.
- Append-only cannot be enforced at the database level with the grants available.
- Transactional coupling of action and consumption is not achievable through the
  existing store abstraction — say so rather than shipping a two-write sequence
  that looks atomic.
- Three distinct fix attempts fail on the same defect (global failure ceiling).

### 7. Report-back format

`LOOP 1 — <SHIPPED|HALTED>`, then: migration number derived vs reserved; apply
evidence (pasted, or "NOT APPLIED"); DoD checklist with pass/fail per line; test
output; PR number; anything found that contradicts §1, quoted with its path.

---

## LOOP 2 — In-app notification centre, and the bell

> ### BRIEFING — LOOP 2
>
> Stateless executor, repo `happygamer1919-tech/OsteoJP`. Read §1 of
> `docs/loops/wave-13/WAVE-13.md` first.
>
> **Task.** Close PG4. Build the in-app notification centre, wire the four
> patient-initiated events to it, fan out to reception and the assigned
> therapist, in-app only. **First** verify the reported bell symptom against the
> code, because the report and the code do not obviously agree.
>
> This loop is **verify-symptom-then-build**. If the symptom is not real, you
> record it void and build the centre anyway. You never fix a symptom you could
> not reproduce, and you never skip the build because the symptom evaporated.

**Closes:** PG4. **Depends on:** LOOP 1 merged; the reschedule-UI follow-up PR
merged (§3), which stubs the event contract this loop consumes.

### 1. Scope and ground truth

**The reported symptom.** The owner observed, in the running UI, that the
notification bell navigates to the same destination as "O meu perfil".

**What authoring-time recon found, for you to verify rather than trust:**

| Path | Finding |
|---|---|
| `packages/ui/src/components/UserAreaCluster.tsx:2,41-48` | The bell exists here. `import { Bell } from "lucide-react"`. It is rendered inside a `<span aria-hidden="true">` with **no href and no handler**. Its own doc comment says it is **decorative until a notifications surface exists**, so the foundation "never ships a control that looks interactive but does nothing" |
| `apps/web/components/app-shell.tsx:77-88` | `<UserAreaCluster>` (`:83-87`) is wrapped in `<Link href="/perfil">` (opens `:77`, closes `:88`). **A click on the decorative bell therefore hits the enclosing profile link.** This is a complete mechanism for the reported symptom |
| `apps/portal/components/layout/PortalChrome.tsx:3,23-29` | **The patient portal has no bell at all.** Its tabs are Home, Calendar, FileText, MapPin, User |

**Two things to note about the locus.** The bell is in the **staff web app**, not
the portal, though the symptom was reported as portal UI. That is consistent with
the feature itself: PG4 fans out to **reception and the assigned therapist**, who
are staff. The centre belongs in `apps/web`. Verify this before building on it.

**A search caveat that cost time during authoring, recorded so you do not repeat
it.** A repo-wide `git grep -ilE "\bbell\b"` returned **nothing**, which produced
a false "no bell anywhere" conclusion. `git grep -E` does not honour `\b` as a
word boundary. Use a plain literal (`git grep -n "Bell"`) and search
**`packages/` as well as `apps/`** — the component is in `packages/ui`, and icons
arrive as `lucide-react` imports that need not be literally named for what they
depict.

Other ground truth: `packages/ui/src/components/AppShell.tsx` (`PortalShell` and
the staff shell header), `packages/ui/index.ts` (export surface),
`packages/i18n/src/strings.pt.json` (staff pt-PT strings), the event contract
stub from the precondition PR.

### 2. Ordered steps

1. **Recon the icon across `apps/` AND `packages/`.** Locate every notification
   icon in the codebase. Confirm or refute the three findings above by reading
   the files.
2. **Verify the routing claim.** Establish whether a click on the bell reaches
   `/perfil`. A test that asserts the bell is inside the profile link is
   sufficient; a browser check is better if the app is running.
3. **Then one of:**
   - **Symptom real** → fix it. The bell becomes a real control with its own
     destination, or is removed from the enclosing link. It stops being
     `aria-hidden` at the moment it becomes interactive, with an accessible name
     and a 44px target.
   - **Symptom void** → record it void in the loop report with the evidence, and
     continue. Do not fabricate a fix.
4. Build the notification centre UI: the list, read/unread state, empty state,
   and the route it opens from the bell.
5. Consume the event contract stubbed by the precondition PR. **Consume it; do
   not redesign it.** If it is insufficient, halt and say what is missing rather
   than forking a second contract.
6. Emit and handle the four events: **booked, cancelled, rescheduled, pedido de
   marcação**.
7. Fan out each to **reception and the assigned therapist**.
8. pt-PT strings for every string you add.

### 3. Definition of done — machine-verifiable

- A test proves each of the four events produces a centre entry for **both**
  reception and the assigned therapist.
- A test proves a therapist who is **not** assigned receives nothing.
- A test proves the centre is **in-app only**: no email and no SMS is dispatched
  by any of the four events. Assert on the transport, not on intent.
- A test proves the bell's destination (post-fix) or its non-interactivity
  (symptom void), whichever applies.
- Unread count is derived from data, never from a client-only counter that a
  reload resets.
- Empty state and error state are patient-readable — here, staff-readable pt-PT,
  not a stack trace.
- Lint, typecheck, unit, build pass.

### 4. Evidence — pasted output required

- The recon output locating every notification icon, across both `apps/` and
  `packages/`.
- The routing verdict with the evidence that produced it, including the case
  where the symptom is void.
- Test output for each DoD line.
- A screenshot or rendered output of the centre with entries, and empty.

### 5. Restrictions and scope boundary

- **In-app only.** No email, no SMS, no push, not behind a flag, not "for later".
- Do not change any reminder template or registry entry.
- Do not redesign the event contract from the precondition PR.
- Do not surface **any** clinical content in a notification entry. Notes are
  never patient-facing and a notification is not a note viewer.
- Do not add a notification surface to the patient portal in this loop. PG4 is
  reception and therapist.

### 6. Halt-loud protocol

Halt if: the event contract stub is absent or does not carry what fan-out needs;
the bell's mechanism differs from the finding above **and** you cannot establish
what the owner saw; fan-out to "assigned therapist" is ambiguous for
multi-therapist appointments (dual-participant services exist — Massagem 4 Mãos —
and the primary/secondary model is locked; ask, do not guess); or three distinct
fix attempts fail on the same defect.

### 7. Report-back format

`LOOP 2 — <SHIPPED|HALTED>`, then: bell verdict (REAL+FIXED | VOID) with
evidence; the four events with their fan-out proof; the in-app-only proof; DoD
checklist; PR number.

---

## LOOP 3 — Patient AUTH, 6-digit SMS OTP

> ### BRIEFING — LOOP 3
>
> Stateless executor, repo `happygamer1919-tech/OsteoJP`. Read §1 of
> `docs/loops/wave-13/WAVE-13.md` first, especially **Decision D** in §1.4.
>
> **Task.** Close PG1. Patient login is a 6-digit SMS OTP, phone only, trusted
> device 30 days. **Scaffolding first**: transport behind an interface, a test
> sink, the Twilio adapter behind a flag left **OFF**, rate limits, trusted
> device, and pt-PT degradation copy for the three real-world cases the clinic
> will hit: no phone, landline, shared number.
>
> This loop also carries a **deletion decision** you must resolve with evidence,
> not opinion. See step 7.

**Closes:** PG1. **Depends on:** LOOP 2 merged.

### 1. Scope and ground truth

| Path | What it gives you |
|---|---|
| `apps/api/lib/auth/patient.ts` | `getPatientPrincipal`, the patient trust boundary |
| `apps/api/lib/auth/jwt.ts`, `forged-token.test.ts` | Token verification and its adversarial tests. A patient portal that accepted unverified tokens was a real incident (board card `SEC-W1-patient-jwt-verify`); read those tests before touching auth |
| `apps/api/app/api/v1/auth/session/route.ts` | The session identity endpoint. Note its posture: **rate-limited BEFORE the auth check**, so an unauthenticated attacker cannot spend the verification budget for free. Copy that ordering |
| `apps/api/lib/rate-limit/limiter.ts` | `checkRateLimit`, `clientKey`, `RULES`, `createMemoryStore`. **Read its header comment**: the store is **in-memory** and it says a **durable shared store is a pending decision before it ships**. See step 4 |
| `apps/api/lib/auth/activation.ts` | `sendPatientActivation`. The subject of step 7 |
| `apps/api/lib/notify/registry.ts:12` | Records that activation conflicts with Decision D |
| `apps/portal/app/auth/login/page.tsx`, `activate/page.tsx`, `reset-password/page.tsx` | The portal auth screens as they stand |
| `packages/i18n/src/portal/strings.pt.json` | pt-PT patient copy |

### 2. Ordered steps

1. Define the **transport interface** first: send a code to a phone number.
   Nothing above it knows about Twilio.
2. Implement the **test sink** adapter: captures codes in-process for tests, sends
   nothing.
3. Implement the **Twilio adapter behind a flag, left OFF.** The flag defaults
   off and the loop does not turn it on. Env failures on this path are **loud**
   (§1.1.1, PG7).
4. **Rate limits.** Per phone number and per client key, on both request-code and
   verify-code, with request-code limited **before** any lookup. **Read the
   limiter's own caveat about the in-memory store and state your verdict
   explicitly in the report**: either the memory store is adequate for the OTP
   threat model on this deployment topology and why, or it is not and this loop
   halts on a durable-store decision. Do not ship a rate limit that a second
   instance silently voids without saying so.
5. **6-digit code**: cryptographically random, short expiry, attempt cap,
   single-use, and constant-time comparison. A wrong code and an unknown phone
   return the **same** response — enumeration is the obvious attack here.
6. **Trusted device, 30 days.** Bound to the device, revocable, and it does not
   extend itself silently on use beyond the ruled window.
7. **The `sendPatientActivation` decision.** It mints a Supabase recovery link and
   delivers it by SMS: it **grants a session by design**, which conflicts with
   Decision D and with the one-action-token ruling. It is currently registered
   `approved:false` so wiring a route to it cannot make it live.
   **Decide deletion inside this loop, with evidence it has no caller.** Search
   `apps/` and `packages/` for every reference; paste the search. If it has no
   caller, delete it and its registry entries. If it has one, do not delete it —
   report the caller and halt.
8. **pt-PT degradation copy** for: patient has **no phone** on record; the number
   on record is a **landline**; the number is **shared** with another patient.
   Each states what the patient should do (telephone the clinic), never a raw
   error.

### 3. Definition of done — machine-verifiable

- A test proves an unknown phone and a wrong code are **indistinguishable** in
  status and body.
- A test proves the attempt cap and the expiry both refuse.
- A test proves a code is single-use.
- A test proves the rate limit refuses at the configured threshold on both
  request and verify.
- A test proves the trusted device is accepted for 30 days and refused at 31.
- A test proves **no session is minted by any path other than a verified OTP**.
- A test proves the Twilio adapter is not invoked with the flag off, and the test
  sink is.
- The three degradation copies render in pt-PT, asserted.
- `sendPatientActivation`: either deleted with a pasted no-caller search, or
  retained with the caller named.
- Lint, typecheck, unit, build pass.

### 4. Evidence — pasted output required

- The full caller search for `sendPatientActivation`, across `apps/` and
  `packages/`.
- Your explicit rate-limit-store verdict with reasoning.
- Test output per DoD line.
- The three degradation screens, rendered.

### 5. Restrictions and scope boundary

- **Do not turn the Twilio flag on.** Do not send a live SMS.
- **Do not add a password, a magic link, or an email OTP.** Decision D is phone
  only.
- Do not weaken any existing patient-token verification.
- Do not change reminder templates or the registry, beyond removing activation
  entries **if and only if** activation is deleted.
- Do not author a migration in this loop unless the trusted-device record
  requires one; if it does, that migration takes the global in-flight slot and
  §1.5 applies in full.

### 6. Halt-loud protocol

Halt if: `sendPatientActivation` has a live caller; the rate-limit store is
inadequate and a durable store is needed (that is a dependency decision, not a
workaround); the OTP cannot be made enumeration-safe within the existing auth
boundary; or three distinct fix attempts fail on the same defect.

### 7. Report-back format

`LOOP 3 — <SHIPPED|HALTED>`, then: the activation verdict with its search; the
rate-limit-store verdict; DoD checklist; the flag's committed default; PR number.

---

## LOOP 4 — Booking: `patient_bookable`, preselection, request-mode

> ### BRIEFING — LOOP 4
>
> Stateless executor, repo `happygamer1919-tech/OsteoJP`. Read §1 of
> `docs/loops/wave-13/WAVE-13.md` first, **especially §1.4.1**, which is the
> verified reason this loop's precondition is not negotiable.
>
> **Task.** Close PG2. Replace the service name allowlist with a
> `patient_bookable` column, implement preselection per Decision C, and add
> request-mode for the multi-resource set.
>
> **Decision B does not ship without the `internalOnly` check at both call sites
> plus a refusal test in the same PR.** Deleting the allowlist is what removes the
> mask over an existing exposure. The two must land together or neither lands.
>
> You author a migration. You never apply it. §1.5 in full.

**Closes:** PG2, and the MUST-NEVER gap LOOP 6 verifies.
**Depends on:** LOOP 3 merged, **and LOOP 1's migration cycle fully complete**
(applied and merged) — §1.5, one migration in flight globally.

### 1. Scope and ground truth

| Path | Finding to verify |
|---|---|
| `apps/api/lib/appointments/services.ts:39-44`, `:53-55` | `BOOKABLE_SERVICE_NAMES` (4 names) and `isBookableServiceName`. This is the allowlist Decision B deletes |
| `apps/api/lib/appointments/store.ts:262-268` | Catalog list query `.where`. **Has** `eq(services.internalOnly, false)` at `:266` |
| `apps/api/lib/appointments/store.ts:276` | Call site 1: `.filter((s) => isBookableServiceName(s.name))` |
| `apps/api/lib/appointments/store.ts:294-309` | `getBookableService`. Call site 2 at `:307`. **No `internalOnly` check, does not select the column** |
| `apps/api/lib/appointments/booking.ts:257,291` | Both patient write paths calling `getBookableService`: book and reschedule |
| `packages/db/src/schema.ts:285-287` | `internalOnly` column definition |
| `packages/db/migrations/0039_services_internal_only.sql` | Its migration, and the comment stating `internal_only` controls **portal visibility only** |
| `apps/api/lib/appointments/services.test.ts` | Existing allowlist tests; they change shape with the column |
| `apps/web/e2e/booking-service-preselection.spec.ts` | Preselection e2e as it stands (Decision C) |
| `docs/loops/prelaunch/PL-06-service-preselection-not-restriction.md` | The preselection loop |
| `docs/loops/wave-08/W8-01a-services-catalog-packs-schema-seed.md:63,65` | Catalog entries: "Sessao Familia/Amigos (2 pessoas ao mesmo tempo) 60.00", "Massagem 4 Maos (2 terapeutas) 70.00" |
| `docs/design/DECISIONS.md:618` | Ruling Q-W9-00-2: dual-therapist booking **stays**; Massagem 4 Mãos structurally needs two therapists; the dual-participant model is locked |

### 2. Ordered steps

1. Re-derive the next free migration number (§1.5). Confirm LOOP 1's migration is
   applied and merged first; if it is not, **stop** — the global in-flight slot is
   occupied.
2. Author the migration adding `patient_bookable` to `services`, with a backfill
   that reproduces the current allowlist exactly: the four names in
   `BOOKABLE_SERVICE_NAMES` become `true`, everything else `false`.
   **The backfill must not change what any patient can book on the day it
   applies.** Prove that in the DoD.
3. **Stop. Hand to Ivan for apply.** Do not proceed without pasted journal output.
4. **In one PR**: delete `isBookableServiceName` and `BOOKABLE_SERVICE_NAMES`,
   replace both call sites with `patient_bookable`, **and add the `internalOnly`
   check at `getBookableService`**, **and** add the refusal test. Not staged, not
   follow-up. One PR.
5. Preselection per Decision C: preselect from the **most recent completed
   appointment**, never restrict. A patient with history sees their usual service
   preselected and every other bookable service still selectable.
6. Request-mode for **Massagem 4 Mãos, Sessão Família, and the four Pilates
   mensal tiers**. These submit a *pedido de marcação* rather than confirming a
   slot. The pedido emits the event LOOP 2's centre consumes.
7. Admin surface for `patient_bookable` if the column is to be maintainable by
   staff, matching how `is_bookable` is surfaced for therapists
   (`packages/db/migrations/0046_users_is_bookable.sql`, Equipa checkbox).

### 3. Definition of done — machine-verifiable

- **The refusal test**: a patient POSTing a known `internal_only` service id to
  **both** book and reschedule is refused. This test must **fail** if the
  `internalOnly` check is removed — demonstrate that by removing it once and
  pasting the failure.
- A test proves the backfill is behaviour-neutral: the set of services a patient
  can book before and after is identical.
- A test proves preselection never removes an option: a patient whose history
  preselects service X can still select every other `patient_bookable` service.
- A test proves each of the six request-mode services produces a **pedido**, not a
  confirmed appointment.
- A test proves a non-request-mode service still books directly.
- A test proves the pedido emits the event LOOP 2 consumes.
- `grep` proves `isBookableServiceName` and `BOOKABLE_SERVICE_NAMES` no longer
  exist anywhere.
- Lint, typecheck, unit, DB-gated, e2e, build pass.

### 4. Evidence — pasted output required

- Derived migration number, journal lines, and **Ivan's pasted apply output**.
- The refusal test passing, **and** its failure with the check removed. Both.
- The behaviour-neutral backfill proof.
- The `grep` showing the allowlist is gone.
- e2e output for preselection and request-mode.

### 5. Restrictions and scope boundary

- **Do not apply the migration.**
- **Do not ship the allowlist deletion without the `internalOnly` check and its
  refusal test in the same PR.** This is the whole precondition.
- **Do not remove dual-therapist booking.** Ruled: it stays
  (`docs/design/DECISIONS.md:618`). Request-mode is not a route to removing it.
- Do not turn preselection into restriction, in the UI or in the query.
- Do not change what staff can book. `internal_only` is **portal visibility
  only**; staff booking does not apply the filter and must keep not applying it.
- Do not invent a price or a catalog entry. Unpriced catalog gaps are an open
  owner question (`docs/design/QUESTIONS.md`, Q-W8-01-1).

### 6. Halt-loud protocol

Halt if: LOOP 1's migration is not yet applied and merged; the six request-mode
services cannot be identified unambiguously in the catalog (names differ per
location — do not guess a match); the backfill cannot be proven behaviour-neutral;
or three distinct fix attempts fail on the same defect.

### 7. Report-back format

`LOOP 4 — <SHIPPED|HALTED>`, then: migration number derived vs reserved; apply
evidence; the refusal test in both states; the allowlist-gone grep; the six
request-mode services as matched in the catalog, by id; DoD checklist; PR number.

---

## LOOP 5 — Ficha clínica terms acceptance, and the fee line gate

> ### BRIEFING — LOOP 5
>
> Stateless executor, repo `happygamer1919-tech/OsteoJP`. Read §1 of
> `docs/loops/wave-13/WAVE-13.md` first, especially the fee-acceptance ruling in
> §1.2 and the counsel gate in §1.3.
>
> **Task.** Build the staff-side terms-acceptance checkbox on the ficha clínica,
> the per-patient acceptance record, and the **double gate** on the 50% fee line:
> per-patient acceptance **AND** the global flag, never the flag alone.
>
> You author a migration. You never apply it. §1.5 in full.

**Closes:** the PG5 residue. **Depends on:** LOOP 4 merged and its migration
cycle complete.

### 1. Scope and ground truth

| Path | What it gives you |
|---|---|
| `docs/notifications-work-notes.md`, "Fee acceptance — SPEC ONLY, DO NOT BUILD" | The ruling in the owner's terms. That heading's prohibition is lifted **by this loop and only for this scope** |
| `apps/web/app/clinical/[id]/RecordForm.tsx`, `RecordForm.test.tsx` | The ficha clínica form and where the existing confirmations sit |
| `docs/loops/wave-05/W5-16-ficha-signature-consent.md`, `W5-33-consent-texts-final.md` | The existing consent/confirmation pattern to sit alongside, not duplicate |
| `apps/web/lib/reminders/templates.ts` | The ten approved bodies. The fee line is a **conditional addition**, not an edit to an approved body |
| `apps/web/lib/reminders/notification-registry.ts` | The approval gate |
| `packages/db/src/schema.ts` | Schema |

### 2. Ordered steps

1. Re-derive the migration number (§1.5); confirm LOOP 4's migration is applied
   and merged.
2. Author the acceptance table: **`patient_id`, `accepted_at`, `terms_version`,
   `recorded_by`.** One record per patient per terms version.
3. **Stop. Hand to Ivan for apply.**
4. Add the checkbox to the end of the ficha clínica, **alongside the existing
   confirmations**, **staff-side**, **not pre-checked**, captured when staff
   complete or update the ficha.
5. Gate the fee line: it renders **only** when the patient has a recorded
   acceptance **AND** `REMINDERS_FEE_NOTICE_ENABLED` is on. Default the flag OFF.
6. Wording, exactly: **"nos termos aceites na marcacao"**.
7. Route the fee-line variant through the approval gate like any other copy: a
   new body enters the registry `approved: false` until JP approves it.

### 3. Definition of done — machine-verifiable

- A test proves the fee line does **not** render with the global flag ON and no
  per-patient acceptance. This is the counsel-critical case; name it explicitly.
- A test proves it does not render with acceptance and the flag OFF.
- A test proves it renders only with **both**.
- A test proves the checkbox is **never** pre-checked, on create and on update.
- A test proves the acceptance record captures all four fields, with
  `recorded_by` = the acting staff member, not the patient.
- A test proves the wording is exactly "nos termos aceites na marcacao".
- A test proves the fee-line body is registry-gated and unapproved by default.
- Lint, typecheck, unit, DB-gated, build pass.

### 4. Evidence — pasted output required

- Derived migration number and **Ivan's pasted apply output**.
- The three gate-combination tests, output pasted.
- The rendered ficha section showing the unchecked checkbox alongside the
  existing confirmations.

### 5. Restrictions and scope boundary

- **Do not apply the migration.**
- **Do not add an acceptance step to the portal booking flow.** JP moved the
  location to the ficha. Whether the portal *also* needs one is an **open
  question with counsel** (`docs/rgpd-token-flow.md` §12.3) — flag it, do not
  answer it.
- **Do not enable the global flag.**
- **Do not edit any of the ten approved bodies.** The fee line is conditional
  additional content.
- Do not build a patient-facing acceptance UI. Staff-side only.
- Phone and walk-in bookings are handled on paper by the clinic and are out of
  scope.

### 6. Halt-loud protocol

Halt if: the double gate cannot be enforced at the render site without
duplicating the condition in more than one place; the fee wording as ruled does
not fit the SMS segment budget (`docs/notifications-work-notes.md` measured
facts: variant B sits at exactly 160 chars with **zero margin**, so an added line
can silently cost a segment) — report the measured segment count rather than
trimming approved copy; or three distinct fix attempts fail.

### 7. Report-back format

`LOOP 5 — <SHIPPED|HALTED>`, then: migration number and apply evidence; the three
gate tests; measured segment counts for any SMS body the fee line can reach; the
flag's committed default; DoD checklist; PR number.

---

## LOOP 6 — Exposure matrix: rebuild it, then close it

> ### BRIEFING — LOOP 6
>
> Stateless executor, repo `happygamer1919-tech/OsteoJP`. Read §1 of
> `docs/loops/wave-13/WAVE-13.md` first.
>
> **Task.** Close PG6. **This loop has two phases and the first one is not a
> formality.** The exposure matrix this gate refers to existed only in a dead
> session and cannot be pasted. You rebuild it from the code, commit it, reconcile
> it against the prior session's claimed numbers, and only then close the rows it
> marks deficient.
>
> **Treat every claimed number below as an unverified number to check, never as
> truth. Any divergence is reported, not reconciled silently.**

**Closes:** PG6. **Depends on:** LOOP 5 merged. LOOP 4 must already have shipped
the `internalOnly` fix this loop verifies.

### 1. Scope and ground truth

**Phase A rebuilds the matrix from the complete patient-facing API surface.**
That surface, at authoring time:

- `apps/api/app/api/v1/appointments/route.ts` (list, create)
- `apps/api/app/api/v1/appointments/[id]/route.ts`
- `apps/api/app/api/v1/appointments/[id]/cancel/route.ts`
- `apps/api/app/api/v1/appointments/[id]/reschedule/route.ts`
- `apps/api/app/api/v1/appointments/[id]/reschedule-options/route.ts` (arrives
  with #767)
- `apps/api/app/api/v1/auth/session/route.ts`
- `apps/api/app/api/v1/booking/catalog/route.ts`
- `apps/api/app/api/v1/booking/slots/route.ts`
- `apps/api/app/api/v1/me/fichas/route.ts`
- `apps/api/app/api/v1/me/forms/route.ts`, `me/forms/catalog/route.ts`
- `apps/api/app/api/v1/patient/documents/route.ts`,
  `patient/documents/[id]/download/route.ts`
- `apps/api/app/api/v1/patient/profile/route.ts`
- plus the token endpoints from LOOP 1
- plus the **portal server actions**, which are patient-facing write paths and
  are easy to miss because they are not routes:
  `apps/portal/app/portal/account/actions.ts`,
  `appointments/actions.ts`, `booking/actions.ts`, `documents/actions.ts`

Supporting ground truth: `apps/api/lib/appointments/store.ts` (the trust
boundary), `apps/api/lib/auth/patient.ts`, `apps/api/lib/appointments/write-paths.test.ts`,
`apps/api/lib/appointments/notes-privacy.test.ts`, `docs/permissions-matrix.md`
(the staff-side analogue, for format precedent), `docs/api/openapi.yaml`.

**Prior-session claims to check, not to trust:**

| Claim | Verify |
|---|---|
| 34 rows total | Count yours |
| 14 MUST-HAVE | Count yours |
| 13 MUST-NEVER | Count yours |
| 7 STAFF-ONLY | Count yours |
| 6 MUST-HAVE rows ABSENT or BROKEN over working endpoints | Count yours |
| exactly 1 MUST-NEVER gap | Count yours |
| the gap is `getBookableService` never checking `internalOnly`, masked by the allowlist Decision B deletes | Verify |

**Independent corroboration of the claimed gap, found during Wave 13 authoring
and recorded here as a second source:** `getBookableService` at
`apps/api/lib/appointments/store.ts:294-309` does not check or even select
`internal_only`, while the catalog query at `:255-268` does; it is reached from
both patient write paths at `apps/api/lib/appointments/booking.ts:257,291`; and
`isBookableServiceName` masks it today. Two independent derivations agreeing does
not make the count of 13 MUST-NEVER rows correct — it makes **this one row**
well-evidenced. Check the rest yourself.

### 2. Ordered steps

**Phase A — rebuild and reconcile.**

1. Enumerate the complete patient-facing surface: every route above, every portal
   server action, every token endpoint. Do not work from this list alone;
   re-derive it, because routes have been added since authoring.
2. For each, write the row: what a patient MUST be able to reach (MUST-HAVE),
   what a patient MUST NEVER reach (MUST-NEVER), what is STAFF-ONLY, the
   enforcement point (file and line), and the state (PRESENT / ABSENT / BROKEN).
3. Commit the matrix as a document. **Location per repo convention:**
   `docs/recon/W13-06-exposure-matrix.md` — `docs/recon/` is where this project
   commits derived findings (`W9-01-findings.md`, `W10-01-findings.md`,
   `W11-03-migration-evidence.md`). Confirm that convention still holds before
   writing; if it has moved, follow the repo and say so.
4. **Reconcile against the claimed numbers.** Produce a table: claimed vs found,
   per figure. **Report every divergence. Do not adjust your count to match the
   claim, and do not adjust the claim.**

**Phase B — close.**

5. Build every MUST-HAVE row the rebuilt matrix marks ABSENT or BROKEN over a
   working endpoint.
6. **Verify the MUST-NEVER gap is closed by LOOP 4's `internalOnly` work.** If
   LOOP 4 closed it, prove it with LOOP 4's refusal test plus your own row-level
   check. If your rebuilt matrix finds a **second** MUST-NEVER gap, that is a
   divergence from "gap count 1": report it and close it.
7. Re-run the matrix as evidence. Every MUST-NEVER row must name an enforcement
   point, which is the literal text of PG6.

### 3. Definition of done — machine-verifiable

- The matrix is committed, with an enforcement point named for **every**
  MUST-NEVER row.
- The reconciliation table is committed alongside it, claimed vs found.
- Every MUST-HAVE row marked ABSENT or BROKEN is built, each with a test.
- Every MUST-NEVER row has a test proving refusal, not merely an assertion that
  the code path exists.
- The re-run matrix shows zero MUST-NEVER rows without an enforcement point.
- Lint, typecheck, unit, DB-gated, build pass.

### 4. Evidence — pasted output required

- The enumerated surface, with the command that produced it.
- The committed matrix.
- The reconciliation table, claimed vs found, with every divergence called out in
  words.
- Test output for each newly built row and each MUST-NEVER refusal.
- The re-run matrix.

### 5. Restrictions and scope boundary

- **Do not reconcile silently.** A number that differs from the claim is a
  finding, and the finding is the deliverable.
- Do not treat a prior-session number as a target to hit.
- Do not build STAFF-ONLY rows into the portal.
- Do not change the staff permissions matrix; `docs/permissions-matrix.md` is a
  different surface.
- Do not weaken any existing refusal to make a row pass.

### 6. Halt-loud protocol

Halt if: the rebuilt matrix finds a MUST-NEVER gap that is **live and
unmasked today** (that is an incident, not a loop item — report before building);
the surface cannot be enumerated completely because a route's patient-reachability
is genuinely ambiguous; divergence from the claimed numbers is large enough that
the two matrices are describing different surfaces; or three distinct fix
attempts fail on the same row.

### 7. Report-back format

`LOOP 6 — <SHIPPED|HALTED>`, then: matrix path; row counts found; the
reconciliation table; the MUST-NEVER gap verdict with LOOP 4 cross-reference;
rows built; DoD checklist; PR number.

---

## LOOP 7 — SYNC 3C proof, hop by hop

> ### BRIEFING — LOOP 7
>
> Stateless executor, repo `happygamer1919-tech/OsteoJP`. Read §1 of
> `docs/loops/wave-13/WAVE-13.md` first.
>
> **Task.** Close PG8. Prove that a portal booking removes the slot from the
> staff agenda, and that a staff booking removes it from the portal. **A
> hop-by-hop trace with timing, each hop named.** Not "it works" — the trace is
> the deliverable.

**Closes:** PG8. **Depends on:** LOOP 6 merged.

### 1. Scope and ground truth

| Path | What it gives you |
|---|---|
| `apps/api/app/api/v1/booking/slots/route.ts` | The portal's slot source |
| `apps/api/lib/appointments/store.ts` | `listOpenSlots`, the booking source of truth for **both** portal and staff (per `docs/design/QUESTIONS.md` Q-W9-00-3, a platform-wide change here silently halves a location's slots) |
| `apps/api/lib/appointments/slot-lock.ts`, `slot-lock.test.ts` | The slot lock. #747/#749 brought unprotected write paths to zero |
| `apps/web/app/agenda/` | The staff agenda |
| `apps/portal/app/portal/booking/slots.ts`, `BookingFlow.tsx` | The portal booking flow |
| `packages/db/migrations/0052_conflicts_no_show_releases_slot.sql` | The conflict predicate; a `no_show` releases its slot |
| `apps/web/e2e/` | Where e2e lives. **Note: there are no portal e2e specs at all today.** If this proof needs one, you are creating the first |

### 2. Ordered steps

1. Name the hops, in both directions. A hop is a named boundary: client action →
   server action → store write → lock acquisition → commit → the other surface's
   read → its cache or revalidation → its render.
2. Instrument or trace each hop with a timing. Where a hop is a Next.js cache or
   revalidation boundary, name the mechanism, not "it refreshes".
3. Prove **portal → staff agenda**: a patient books, the slot disappears from the
   staff agenda. Trace every hop with its timing.
4. Prove **staff agenda → portal**: staff books, the slot disappears from the
   portal. Same.
5. Prove the **negative control**: two real sessions contending for one slot, one
   wins, one is refused. There is precedent for this test shape at
   `apps/web/e2e/` and in the A4 contention test (#754) — read it before writing
   a weaker one.
6. Commit the trace as a document under `docs/recon/`, per the convention LOOP 6
   confirms.

### 3. Definition of done — machine-verifiable

- An automated test proves each direction, not a manual observation.
- The trace names every hop and its timing, in both directions.
- The contention negative control passes, and **the losing session is refused,
  not silently overwritten**.
- Any hop whose latency is unbounded (a cache with no revalidation trigger, a
  poll) is named as such rather than reported with a lucky measurement.
- Lint, typecheck, unit, DB-gated, e2e, build pass.

### 4. Evidence — pasted output required

- The committed trace document.
- e2e output for both directions and the contention control.
- The timing table.

### 5. Restrictions and scope boundary

- **Do not change `listOpenSlots` semantics to make the proof easier.** It feeds
  both surfaces; a change there is a platform-wide behaviour change.
- Do not weaken the slot lock.
- Do not prove this against seeded fixtures only if a real path differs; say which
  you used.
- **One green e2e run proves nothing that can race.** Run it enough times to mean
  something and say how many.

### 6. Halt-loud protocol

Halt if: a hop's latency is unbounded and cannot be made bounded within this
loop's scope (that is a design decision); the two surfaces disagree about slot
availability under any ordering (that is an incident); or three distinct fix
attempts fail.

### 7. Report-back format

`LOOP 7 — <SHIPPED|HALTED>`, then: the hop list with timings, both directions;
the contention result and run count; trace document path; DoD checklist; PR
number.

---

## LOOP 8 — 3E experience pass

> ### BRIEFING — LOOP 8
>
> Stateless executor, repo `happygamer1919-tech/OsteoJP`. Read §1 of
> `docs/loops/wave-13/WAVE-13.md` first.
>
> **Task.** Close PG9, the last gate. A patient-facing experience pass across the
> portal: mobile-first, WCAG 2.2 AA, pt-PT throughout, 24h time format, one
> primary action on the landing screen, patient-readable empty and error states,
> minimum field count.

**Closes:** PG9. **Depends on:** LOOP 7 merged. Runs last deliberately: it audits
everything the previous seven loops shipped.

### 1. Scope and ground truth

| Path | What it gives you |
|---|---|
| `apps/portal/app/portal/` | Every patient screen: dashboard, appointments, booking, forms, documents, clinics, account |
| `apps/portal/components/layout/PortalChrome.tsx` | The chrome, the skip link, the `<main>` landmark |
| `packages/ui/src/components/AppShell.tsx` | `PortalShell`: 64px bottom tab bar, ≤5 tabs, 24px icon over caption, 44px targets. Its comments already record AA contrast decisions at `:256` |
| `packages/ui/src/components/EmptyState.tsx`, `ErrorState.tsx` | The existing empty/error primitives. Reuse; do not invent a third |
| `packages/i18n/src/portal/strings.pt.json` / `.en.json` | Patient copy, both locales |
| `docs/design/SPEC-portal.md` | The portal spec, including §1.4 chrome |
| `docs/qa-a11y-portal-2026-06-17.md` | The prior portal a11y pass. Read it: some findings may have regressed, some may already be closed |
| `docs/design/UI-STYLE.md`, `docs/brand-tokens.md` | Tokens. AA-safe tokens exist; use them rather than new values |
| `docs/loops/wave-12/W12-31-24h-time-format.md` | The 24h format sweep. Verify the portal is inside its coverage |

### 2. Ordered steps

1. Audit every portal screen against the seven PG9 criteria. Produce a per-screen
   table before changing anything.
2. Fix mobile-first breakages: the portal is the patient's phone, not a desktop
   afterthought.
3. Fix WCAG 2.2 AA failures: contrast, target size, focus visibility, landmarks,
   accessible names, and the 2.2-specific criteria (focus not obscured,
   dragging alternatives, consistent help).
4. pt-PT sweep: **every** patient-visible string, including errors thrown from
   the API layer. An English error reaching a patient is a failure of this gate.
5. 24h format everywhere a time is shown.
6. **One primary action on the landing screen.** Not two competing ones.
7. Empty and error states that a patient can read and act on: what happened, what
   to do, and the clinic's telephone where the answer is "call us".
8. **Minimum field count**: remove every field the portal asks for that the
   patient record already holds. There is precedent — PL-20 stopped the
   declaração asking for a NIF it already had.

### 3. Definition of done — machine-verifiable

- An automated a11y check passes on every portal screen, with the tool and
  ruleset named.
- A test proves no untranslated string reaches a patient surface, including error
  paths.
- A test proves 24h formatting on every time render.
- A test proves exactly one primary action on the landing screen.
- Every empty and error state is asserted to contain actionable pt-PT text, not a
  code or a stack trace.
- The per-screen audit table is committed under `docs/qa/`, matching the existing
  QA doc convention.
- Lint, typecheck, unit, e2e, build pass.

### 4. Evidence — pasted output required

- The committed per-screen audit table, before and after.
- a11y tool output per screen.
- Mobile-viewport screenshots of every screen.
- Test output per DoD line.

### 5. Restrictions and scope boundary

- **Do not redesign.** This is a conformance pass, not a visual redesign. Visual
  redesign is an owner visual gate and a separate loop.
- Do not add a new UI primitive when `EmptyState` / `ErrorState` exist.
- Do not invent tokens; AA-safe ones exist.
- Do not remove a field that is legally required (NIF is mandatory on ficha
  creation with an audited exemption, PL-31) — minimum field count is about
  **re-asking for what is already held**, not dropping obligations.
- Do not surface clinical content to the patient that was not already surfaced.

### 6. Halt-loud protocol

Halt if: a WCAG 2.2 AA failure cannot be fixed without a design change that needs
an owner visual gate; a required pt-PT string does not exist and inventing clinic
copy would put unreviewed words in front of a patient (that is an owner/JP copy
question); or three distinct fix attempts fail on the same screen.

### 7. Report-back format

`LOOP 8 — <SHIPPED|HALTED>`, then: the per-screen table before/after; a11y
results; the pt-PT gap list, if any, as owner questions; DoD checklist; PR number;
**and a wave-close statement: all nine PGs with their closing evidence.**

---

# 3. PRECONDITIONS

**The wave does not start until every item below is verified.** Verify by reading
the repository. Do not trust this list, and do not trust a report that it is done.

### 3.1 PR #767 merged to `main`

`feat(portal): reschedule options endpoint + 24h minimum notice on the new slot`,
branch `portal/PL-32-reschedule-ui`. At authoring time it was OPEN, mergeable,
with `Validate spec + drift check` **failing** — very likely
`docs/api/openapi.yaml` missing the new route.

Verify by file, not by PR status:

| Path | What must be true |
|---|---|
| `apps/api/app/api/v1/appointments/[id]/reschedule-options/route.ts` | Exists |
| `apps/api/lib/appointments/cutoff.ts` | Exports `RESCHEDULE_MIN_NOTICE_HOURS` as a **constant distinct from** `CANCELLATION_CUTOFF_HOURS` |
| `apps/api/lib/appointments/reschedule-options.test.ts` | Exists and passes |
| `apps/api/lib/appointments/booking.ts` | `rescheduleAppointment` enforces the minimum notice on the **new** slot, not only rejecting a past start |
| `docs/notifications-work-notes.md` | Contains the "Minimum notice, 24h on the new slot (JP, 2026-08-03)" section. **Until it does, §1.2's minimum-notice ruling is not committed ground truth** |
| `packages/i18n/src/strings.pt.json` | Carries the new refusal copy |

### 3.2 The reschedule-UI follow-up PR merged to `main`

Named in #767's own notes as the next PR: **reschedule UI plus the B4 events** —
patient-initiated change to in-app notification for reception and the assigned
therapist, **fixed contract plus stub consumer**.

**LOOP 2 consumes that stub.** It does not exist at authoring time. Verify:

- a portal reschedule UI reachable from
  `apps/portal/app/portal/appointments/[id]/`;
- an event contract with a stub consumer, for booked / cancelled / rescheduled /
  pedido de marcação;
- the contract carries enough to fan out to reception **and** the assigned
  therapist.

If the stub exists but cannot express the fan-out, **LOOP 2 halts** rather than
forking a second contract.

### 3.3 Already merged — verify, do not rebuild

| Item | PR | Verify at |
|---|---|---|
| Registry flips, all ten bodies approved | #766 `ffe1e33` | `apps/web/lib/reminders/notification-registry.ts:61,87` |
| Cancel cutoff, server-enforced + pt-PT copy | already on main | `apps/api/lib/appointments/cutoff.ts`, `booking.ts`, `apps/portal/app/portal/appointments/[id]/AppointmentActions.tsx` |
| Per-channel offsets + channel in idempotency key | #764 `6023b2a` | `apps/web/lib/reminders/offsets.ts`, `channel-idempotency.test.ts` |
| Loud-at-boot env posture | #763 `64124c1` | `apps/web/lib/reminders/loud-env.test.ts` |
| Approval packet, 10 sections | #765 `46e074e` | `docs/notifications-approval-packet.md`, `approval-packet.test.ts` |
| Payload minimisation | on main | `apps/web/lib/reminders/payload-minimization.test.ts` |

### 3.4 Migration line clear

`packages/db/migrations/meta/_journal.json` shows **no migration in flight**
across either workstream, and the last entry is applied to production. At
authoring time the last entry was idx 52, `0053_patients_nif_exemption`. **Apply
state of 0053 is not established by this document** — #759's title carries
`[HOLD: migration 0053]`. Confirm with Ivan before LOOP 1 authors 0054.

### 3.5 Open owner and counsel items that do NOT block this wave

Recorded so no loop stalls on them, and so none of them gets guessed:

- **Retention period** for the patient audit log (counsel). LOOP 1 ships the
  retention **hook**; the period is not set in code.
- **Whether ficha clínica acceptance satisfies the pre-contractual communication
  duty for portal-concluded bookings**, or whether the portal needs its own
  acceptance step (counsel). LOOP 5 flags it, does not answer it.
- **Supabase and Vercel regions** verified from provider consoles rather than
  from committed configuration (owner).
- **JP's choice between the shipped 24h SMS body and variant A.** If he picks
  variant A it enters the registry `approved: false` and goes through the gate.
- **Unpriced catalog gaps** (Q-W8-01-1). No loop invents a price.

---

# 4. SEQUENCING RULES

1. **Strictly one loop at a time.**
2. **The next loop starts only after the prior loop's PR merges to `main`.**
3. **Migrations: one in flight, globally, across both workstreams.** §1.5.
4. **No stacking on unmerged branches.** Branch from `main`, always.
5. A loop that halts **stops the wave** for its dependents. Loops with no
   dependency on the halted one may proceed only if their own preconditions hold.
6. Branch naming: `<area>/<ticket-id>-<short-slug>`, matching this repo's
   existing pattern (`portal/PL-32-reschedule-ui`,
   `notify/NS-06-jp-approvals-rgpd-docs`).
7. **Never commit to `main` directly.**

---

# 5. MIGRATION RESERVATIONS — INTENT, NOT TRUTH

Per §1.5, every loop re-derives the real number from the committed journal at
authoring time. These are the numbers this wave *expects*, recorded so a
divergence is visible rather than silent.

| Loop | Purpose | Reserved | Re-derive from |
|---|---|---|---|
| LOOP 1 | Patient audit log **plus** token consumption state — **one migration** | `0054` | `packages/db/migrations/meta/_journal.json` |
| LOOP 4 | `services.patient_bookable` + behaviour-neutral backfill | `0055` | same |
| LOOP 5 | Ficha terms acceptance record | `0056` | same |

Last committed at authoring time: `0053_patients_nif_exemption`, journal idx 52,
53 entries.

**Why these are intent.** A session-held plan reserved 0053 for the audit log.
PL-31 merged `0053_patients_nif_exemption.sql` (#759) while that plan sat
uncommitted, and nothing detected the collision. The reservation was invisible
because it was never in the repository. That is the incident §1.5 exists to
prevent, and it is why this table is labelled the way it is.

---

# Appendix A — Recon findings backing this document

Derived from `origin/main` at `ffe1e33` on 2026-08-04. Each is stated so it can be
re-checked, not taken on trust.

1. **The DoR had never been committed.** Referenced by number at
   `docs/notifications-work-notes.md:72` and `:206`; the list existed in no file,
   no branch, and no deleted file in history. §1.1 is its first committed home.
2. **The exposure matrix does not exist.** Zero occurrences of "exposure matrix"
   or "MUST-HAVE" anywhere in the repository or any branch. LOOP 6 Phase A
   rebuilds it.
3. **Decisions B, C and D had never been committed.** Decision D was cited from
   `apps/api/lib/notify/registry.ts:12` and
   `docs/notifications-work-notes.md:67`; B and C appeared nowhere. §1.4 is their
   first committed home.
4. **Migration 0053 was consumed by PL-31** (`a33db11`, #759), journal idx 52,
   mirrored in `packages/db/migrations/` and `supabase/migrations/`. The audit-log
   reservation moves to 0054. §1.5, §5.
5. **The bell exists in `packages/ui`, not `apps/`**, at
   `UserAreaCluster.tsx:2,41-48`, decorative and `aria-hidden`, wrapped in
   `<Link href="/perfil">` at `apps/web/components/app-shell.tsx:77-88`. That is a
   complete mechanism for the reported symptom. The **patient portal has no bell
   at all** (`PortalChrome.tsx:23-29`). LOOP 2 verifies before fixing.
6. **The MUST-NEVER gap is corroborated.** `getBookableService`
   (`store.ts:294-309`) never checks `internal_only` while the catalog query
   (`:262-268`, filter at `:266`) does; both patient write paths reach it (`booking.ts:257,291`);
   `isBookableServiceName` masks it today. §1.4.1.
7. **`AppointmentView` has 8 keys**, `booking.ts:33-41`, mirrored in
   `apps/portal/lib/api/client.ts`. The "approved to 10" claim was false in both
   halves.
8. **The rate limiter is in-memory** and its own header comment records that a
   durable shared store is a **pending decision before it ships**
   (`apps/api/lib/rate-limit/limiter.ts`). LOOP 3 must state a verdict rather than
   inherit it silently.
9. **There are no portal e2e specs.** All e2e lives in `apps/web/e2e/`. LOOP 7 or
   LOOP 8 may be creating the first portal spec.
10. **Loop-set precedent.** `docs/loops/README.md` fixes the 7-field Loop Package;
    `docs/design/wave-01/WAVE-01.md` is the umbrella-wave-doc precedent; wave loop
    sets land in a single authoring PR (#632 for wave-12, #667 for prelaunch).
    Wave 12 was the highest wave, and
    `docs/handoff/WAVE-12-CLOSE-20260727.md:6` states board maintenance continues
    into **Wave 13**. Hence this file's number and location.
