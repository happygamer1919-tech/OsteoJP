# W13-06 — Patient exposure matrix

**LOOP 6, Phase A. Rebuilt from the code on 2026-08-12 against `origin/main`
@ `225edfc`.** Closes PG6: *"every MUST-NEVER row has an enforcement point."*

**This matrix is REBUILT, not transcribed.** The prior session's matrix existed
only in a dead session and could not be pasted. Every row below was derived from
the committed tree. The prior session's claimed figures are reconciled in §5 and
**every divergence is reported rather than reconciled away** — the wave doc's own
instruction on each claimed number is "Count yours".

**An enforcement point is a TEST or a DATABASE CONSTRAINT. A code comment is not
one, and neither is an assertion that a code path exists.**

---

## 1. The enumerated surface, and the commands that produced it

```
find apps/api/app/api/v1 -name route.ts | sort            # 19 routes
grep -rl "^'use server'" apps/portal/app | sort           #  5 server-action files
find apps/web/app/r -type f                               #  1 token page
```

### 1.1 API routes — 19

| # | Route | Methods | Auth |
|---|---|---|---|
| 1 | `appointments` | GET, POST | `getPatientPrincipal` |
| 2 | `appointments/[id]` | GET | `getPatientPrincipal` |
| 3 | `appointments/[id]/cancel` | POST | `getPatientPrincipal` |
| 4 | `appointments/[id]/reschedule` | POST | `getPatientPrincipal` |
| 5 | `appointments/[id]/reschedule-options` | GET | `getPatientPrincipal` |
| 6 | `auth/session` | GET | `getPatientPrincipal` |
| 7 | `booking/catalog` | GET | `getPatientPrincipal` |
| 8 | `booking/slots` | GET | `getPatientPrincipal` |
| 9 | `booking/therapists` | GET | `getPatientPrincipal` |
| 10 | `me/fichas` | GET | `getPatientPrincipal` |
| 11 | `me/forms` | GET, POST | `getPatientPrincipal` |
| 12 | `me/forms/catalog` | GET | `getPatientPrincipal` |
| 13 | `patient/documents` | GET | `getPatientPrincipal` |
| 14 | `patient/documents/[id]/download` | GET | `getPatientPrincipal` |
| 15 | `patient/profile` | GET, PATCH | `getPatientPrincipal` |
| 16 | `auth/otp/request` | POST | **pre-auth**, rate limited |
| 17 | `auth/otp/verify` | POST | **pre-auth**, rate limited |
| 18 | `auth/otp/trusted` | POST | **pre-auth**, rate limited |
| 19 | `auth/otp/revoke` | POST | **pre-auth**, device cookie + rate limited |

### 1.2 Portal server actions — 5 files

`apps/portal/app/auth/login/actions.ts`, `portal/account/actions.ts`,
`portal/appointments/actions.ts`, `portal/booking/actions.ts`,
`portal/documents/actions.ts`.

### 1.3 The token surface — 1

`apps/web/app/r/[token]/page.tsx` (LOOP 1). Unauthenticated by design: a
one-action signed token from a reminder.

### 1.4 THREE SURFACES THE WAVE DOC'S LIST DOES NOT CONTAIN

Reported as divergences, not silently absorbed. The brief said "re-derive it,
because routes have been added since authoring", and three had been.

1. **`booking/therapists`** — arrived with **A2 / #857** (`5e45653`). It is the
   therapist roster the portal's step 3 reads. **This is the row that made the
   A2/LOOP 6 ordering rule real**: a matrix built before #857 would have been
   missing a patient-facing route, exactly as the rehydrate doc predicted.
2. **The four `auth/otp/*` routes.** The brief said "the token endpoints from
   LOOP 1", which is the `/r/[token]` reminder surface. The OTP routes are
   LOOP 3's and are a different, larger unauthenticated surface.
3. **`apps/portal/app/auth/login/actions.ts`** — not in the brief's list of four
   portal action files. It is the most exposed of the five: it runs for a caller
   with no session at all.

---

## 2. MUST-HAVE — what a patient must be able to reach

Every row is PRESENT. **No row is ABSENT or BROKEN**, which is itself a
divergence from the claimed figure and is reported in §5.

| id | A patient must be able to… | Endpoint | Enforcement / proof | State |
|---|---|---|---|---|
| MH-01 | obtain a login code by phone | `auth/otp/request` | `otp.test.ts`, `routes.test.ts` | PRESENT |
| MH-02 | exchange the code for a session | `auth/otp/verify` | `otp-claim.db.test.ts`, `patient-linkage.test.ts` | PRESENT |
| MH-03 | re-enter on a trusted device | `auth/otp/trusted` | `otp-store.test.ts`, `patient-session.test.ts` | PRESENT |
| MH-04 | revoke that device on sign-out | `auth/otp/revoke` | `otp-revoke.db.test.ts` (8 DB-gated) | PRESENT |
| MH-05 | read own session identity | `auth/session` | `auth/session/route.test.ts` | PRESENT |
| MH-06 | list own appointments | `GET appointments` | `booking.test.ts`, `notes-privacy.test.ts` | PRESENT |
| MH-07 | read one own appointment | `GET appointments/[id]` | `booking.test.ts` | PRESENT |
| MH-08 | book an appointment | `POST appointments` | `booking.test.ts`, `slot-lock.test.ts` | PRESENT |
| MH-09 | cancel own appointment | `appointments/[id]/cancel` | `booking.test.ts` | PRESENT |
| MH-10 | reschedule own appointment | `appointments/[id]/reschedule` | `booking.test.ts` | PRESENT |
| MH-11 | see reschedule options | `appointments/[id]/reschedule-options` | `reschedule-options.test.ts` | PRESENT |
| MH-12 | browse the bookable catalog | `booking/catalog` | `services.test.ts`, `bookable-parity.test.ts` | PRESENT |
| MH-13 | see open slots | `booking/slots` | `past-slot-floor.test.ts`, `cutoff.test.ts` | PRESENT |
| MH-14 | choose a therapist | `booking/therapists` | `therapist-choice.test.ts`, `therapist.test.ts` | PRESENT |
| MH-15 | read own fichas | `me/fichas` | `me/fichas/route.test.ts`, `fichas/read.test.ts` | PRESENT |
| MH-16 | see the intake form catalog | `me/forms/catalog` | `intake/catalog.test.ts` | PRESENT |
| MH-17 | submit an intake form | `POST me/forms` | `intake/submit.test.ts`, `me/forms/route.test.ts` | PRESENT |
| MH-18 | list own documents | `patient/documents` | `patient/documents/route.test.ts` | PRESENT |
| MH-19 | download an own document | `patient/documents/[id]/download` | `download/route.test.ts`, `patient/download.test.ts` | PRESENT |
| MH-20 | read and update own profile | `patient/profile` | `patient/profile/route.test.ts`, `patient/profile.test.ts` | PRESENT |
| MH-21 | act on a reminder link without logging in | `apps/web/app/r/[token]` | W13-01; owner deployed-screen check 2026-08-05 (PG3 evidence) | PRESENT |

**21 MUST-HAVE rows, all PRESENT.**

---

## 3. MUST-NEVER — what a patient must never reach

**Every row names an enforcement point. That is the literal text of PG6.**

| id | A patient must NEVER… | Enforcement point | State |
|---|---|---|---|
| **MN-01** | **reach any patient-facing route without a verified principal** | **`apps/api/lib/exposure/patient-surface.test.ts` (NEW, this loop)** | **PRESENT** |
| MN-02 | present a patient id of their choosing | `lib/auth/patient.ts` derives it from a verified JWT only; `principal.test.ts`, `forged-token.test.ts` | PRESENT |
| MN-03 | hold a session minted from anything but OTP or the trusted device | `no-session-minting.test.ts` | PRESENT |
| MN-04 | have a forged or unsigned token accepted | `jwt.test.ts`, `forged-token.test.ts`, `patient-session.test.ts` | PRESENT |
| MN-05 | read another patient's appointment | `booking.ts` scopes every read to `principal.patientId` (:580, :618, :725) + RLS; `booking.test.ts` | PRESENT |
| MN-06 | read another patient's ficha | `fichas/read.test.ts` + RLS | PRESENT |
| MN-07 | read or download another patient's document | `patient/documents/route.test.ts`, `download/route.test.ts` | PRESENT |
| MN-08 | read another patient's profile | `patient/profile/route.test.ts` | PRESENT |
| MN-09 | see staff notes, comments or histórico on an appointment | `notes-privacy.test.ts` (sentinel through the real DTO) | PRESENT |
| MN-10 | see therapist-private clinical fields (`private_notes`, `red_flags`, …) | `fichas/redaction.test.ts` (adversarial sentinel + allow-list) | PRESENT |
| **MN-11** | **book an `internal_only` service by knowing its id** | `services.ts:52-58` `isServiceBookableByPatient`; `internal-only-refusal.test.ts` (14 tests) | **PRESENT — was the claimed gap, see §4** |
| MN-12 | book a service not marked `patient_bookable` | same guard; `patient-bookable.db.test.ts` (DB-gated) | PRESENT |
| MN-13 | book an inactive service | same guard, `isActive` clause; `services.test.ts` | PRESENT |
| MN-14 | reach any row of another tenant | every store query filters `tenantId`; RLS isolation tests in CI | PRESENT |
| MN-15 | book a slot in the past | `past-slot-floor.test.ts` (floor applied three times) | PRESENT |
| MN-16 | book inside the cut-off window | `cutoff.test.ts` | PRESENT |
| MN-17 | create a double booking on a confirmed slot | `slot-lock.ts` + **migration 0061** `appointments_no_double_confirmed`; `packages/db/tests/no-double-confirmed.test.ts` | PRESENT |
| MN-18 | enumerate the patient list through the login screen | `auth/otp/request` answers 204 for known and unknown alike and never queries the patient table; `routes.test.ts` | PRESENT |
| MN-19 | make the clinic pay to send unbounded SMS | per-IP, per-phone and two global ceilings; `sms-pump.test.ts`, `limiter.test.ts` | PRESENT |
| MN-20 | make the clinic text a number that cannot receive SMS | `isSmsCapablePT`; `otp-sms-capability.test.ts` | PRESENT |
| MN-21 | distinguish a wrong code from an unknown number | one 401, one body, six failure modes; `otp.test.ts`, `degradation-copy.test.ts` | PRESENT |
| MN-22 | receive contact data in a notification payload | `payload-minimization.test.ts` (counsel requires this maintained) | PRESENT |
| MN-23 | run an unauthenticated write against `appointments` | `write-paths.test.ts` — every writer enumerated, allowlist is a decision per path | PRESENT |

**23 MUST-NEVER rows. 23 enforcement points. ZERO rows without one.**

---

## 4. The claimed gap: CLOSED by LOOP 4, verified here

**The claim:** *"the gap is `getBookableService` never checking `internalOnly`,
masked by the allowlist Decision B deletes."*

**Verdict: the claim was TRUE and the gap is now CLOSED.** Both halves verified
against `225edfc`, not taken from LOOP 4's report:

1. **`getBookableService` now selects BOTH columns.**
   `apps/api/lib/appointments/store.ts:342-343` selects `internalOnly` **and**
   `patientBookable`, and `:355` refuses through
   `isServiceBookableByPatient(row)`. The function's own comment records that
   `internalOnly` "was not selected here AT ALL before".
2. **The mask is GONE, not merely bypassed.** `isBookableServiceName` and
   `BOOKABLE_SERVICE_NAMES` are deleted. `internal-only-refusal.test.ts:113,132`
   asserts at source level that neither `store.ts` nor `booking.ts` mentions the
   symbol again — so the allowlist cannot creep back.
3. **The refusal is proven, not asserted.** `isServiceBookableByPatient`
   (`services.ts:52-58`) is three clauses, and each has its own test:
   `internal-only-refusal.test.ts` (14 tests), `patient-bookable.db.test.ts`
   (DB-gated, against real Postgres), `services.test.ts` (7 tests).

**NO SECOND MUST-NEVER GAP WAS FOUND.** Every one of the 23 rows above resolved
to a named enforcement point. The one row that had **no** enforcement point at
the start of this loop was **MN-01**, and it is built by this loop — see §6.

**Halt-loud protocol not triggered:** no MUST-NEVER gap is live and unmasked
today.

---

## 5. Reconciliation — claimed versus found

**Do not adjust a count to match a claim, and do not adjust the claim.** Both
columns stand as they are.

| Figure | Claimed | Found | Divergence |
|---|---|---|---|
| Rows total | 34 | **51** | **+17** |
| MUST-HAVE | 14 | **21** | **+7** |
| MUST-NEVER | 13 | **23** | **+10** |
| STAFF-ONLY | 7 | **7** | **0** |
| MUST-HAVE rows ABSENT or BROKEN | 6 | **0** | **−6** |
| MUST-NEVER gaps | exactly 1 | **1** | **0**, and it is a different row — see below |
| the gap is `getBookableService` / `internalOnly` | — | **CONFIRMED, and CLOSED** | claim was correct |

### The divergences, in words

**+17 rows total, and the two matrices are still describing the same surface.**
The halt condition asks whether the divergence is large enough that they describe
different things. It is not, and the reason is datable: the surface has grown by
five patient-facing routes since the claimed matrix was counted — four
`auth/otp/*` (LOOP 3, #817/#828) and `booking/therapists` (A2, #857) — and this
matrix counts obligations per property rather than per endpoint. The **claimed
gap row reproduces exactly**, which is the strongest single check that the two
are the same surface.

**−6 on ABSENT-or-BROKEN MUST-HAVE rows, and this is the largest divergence.**
The claim was 6 rows absent or broken over working endpoints; this rebuild finds
**0**. That is not a discrepancy in counting, it is five days of shipping: LOOP 1
(token actions), LOOP 3 (the whole OTP surface), LOOP 4 (`patient_bookable`,
reception confirm), LOOP 5 (ficha terms) and A2 (therapist choice) all landed
after the claimed matrix was written. **Phase B step 5 therefore builds nothing:
there is nothing marked ABSENT or BROKEN to build.** Recorded plainly because "we
built the six" and "there were none left" are very different reports.

**"exactly 1 MUST-NEVER gap" reproduces as a number, with a different subject.**
The claimed gap (`getBookableService` / `internalOnly`) is **closed**. This
rebuild found exactly one row with no enforcement point — **MN-01** — and it is
not the same row. The count agreeing is a coincidence and is recorded as one
rather than allowed to read as confirmation.

**STAFF-ONLY reproduces exactly at 7**, listed in §7.

---

## 6. What this loop built: MN-01

**MN-01 was the one MUST-NEVER row with no enforcement point.**

Fifteen patient-facing routes authenticate through `getPatientPrincipal`, and
that was true before this loop — **nothing proved it, and nothing would have
noticed a sixteenth route that did not.** Eight of the fifteen have no route-level
test file at all: the five `appointments*` routes and the three `booking/*`
routes. Coverage by inspection is coverage until the next commit.

**`apps/api/lib/exposure/patient-surface.test.ts`** enumerates the surface from
the **filesystem** and asserts, for every route it finds:

- it calls `getPatientPrincipal` **in code** — comments, string literals and
  template literals are stripped first, which is load-bearing in this repo
  because several route files discuss the symbol at length in prose without
  calling it;
- it **refuses** on an absent principal, in both brace spellings live here;
- it refuses **before any other awaited work**, which is the authenticate-then-
  work-then-check defect;
- or it is one of exactly **four** allowlisted pre-authentication routes, each
  carrying a written reason and each **proven to be rate limited**, because a
  limiter is what stands in for authentication on an unauthenticated surface and
  its absence is `SEC-otp-unauthenticated-sms-pump`;
- and the allowlist is checked **both ways**: no undeclared unauthenticated
  route, and no stale entry outliving its route.

It also asserts **this document names every route**, so a new route cannot ship
without a matrix row.

**Why a filesystem scan and not per-route tests.** Per-route tests prove the
routes somebody thought of. This is the same argument migration `0061` made for a
state-level constraint over three application checks: patch the paths you found
and the fourth is written next month. Format precedent is
`write-paths.test.ts`, which does exactly this for appointment writers.

**51 assertions, 51 passing.** Negative arms in §8.

---

## 7. STAFF-ONLY — 7 rows, reproducing the claim exactly

Not built into the portal, and this loop does not touch them (§5 of the brief).

| id | Staff-only surface | Why it is not a portal row |
|---|---|---|
| SO-01 | `/notificações` staff queue | per-recipient inbox; `resolveRecipients` = RECEPTION + named practitioners (`centre.ts:56-88`), pinned at the DB by 0055 |
| SO-02 | `/agenda` | the clinic diary across all patients |
| SO-03 | Estado transitions | `isLegalEstadoTransition`, server-enforced (#869) |
| SO-04 | pedido confirm | `appointments:write` capability (`permissions.ts:148`) |
| SO-05 | invoicing | admin/reception only, per the permission matrix |
| SO-06 | patient management | `docs/permissions-matrix.md` |
| SO-07 | tenant settings | admin only |

---

## 8. Evidence

### 8.1 Negative arms — every assertion proven to fail against a real defect

**No assertion in this suite is taken on trust.** Each mutation below was applied
to a real file, the suite was run, the failure was observed, and the mutation was
reverted. **Baseline: 51 passed (51).**

| # | The defect introduced | Result |
|---|---|---|
| 1 | delete `if (!principal) return unauthorized();` from `booking/slots` | **2 failed** |
| 2 | keep the guard but move an `await` in front of it — authenticate, work, then check | **1 failed** |
| 3 | replace the call with a **comment** naming it, and a hardcoded principal | **3 failed** |
| 4 | add a new unauthenticated route `app/api/v1/leaky/route.ts` | **5 failed** (54 total: it is in scope the moment it exists) |
| 5 | leave a stale allowlist entry for a route that no longer exists | **2 failed** |
| 6 | remove the rate limiter from an allowlisted pre-auth route | **1 failed** |
| 7 | drop one route from this document | **1 failed** |

**Arm 3 is the one that matters most.** It is the vacuous-guard proof: without
`stripComments`, a route that only *mentions* `getPatientPrincipal` in prose
would pass every assertion above, and this repo's route files are heavily
commented — several discuss the symbol at length without calling it. Three
assertions redden, so the stripping is load-bearing rather than decorative.

**Arm 4 is the reason this is a filesystem scan.** A brand-new unauthenticated
route is caught with no edit to the test, which is precisely what a per-route
suite cannot do.

**The suite is hard-required**, not merely present: it runs in the api package's
`vitest run` and fails the `Lint + typecheck + test` required check.

**Re-run the matrix:** `cd apps/api && npx vitest run lib/exposure/patient-surface.test.ts`.
Zero MUST-NEVER rows without an enforcement point is asserted by §3 of this
document plus the suite above.
