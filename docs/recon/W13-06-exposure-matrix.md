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
| MN-06 | read another patient's ficha | `packages/db/tests/patient-rls-selfscope.test.ts:173,196,205` — DB-gated, `clinical_records` is one of its probe tables, with a negative control proving the owner CAN see the rows **CITATION CORRECTED 2026-08-12, see §9** | PRESENT |
| MN-07 | read or download another patient's document | `patient/documents/route.test.ts`, `download/route.test.ts` | PRESENT |
| MN-08 | read another patient's profile | `patient/profile/route.test.ts` | PRESENT |
| MN-09 | see staff notes, comments or histórico on an appointment | `notes-privacy.test.ts` (sentinel through the real DTO) | PRESENT |
| MN-10 | see therapist-private clinical fields (`private_notes`, `red_flags`, …) | `fichas/redaction.test.ts` (adversarial sentinel + allow-list) | PRESENT |
| **MN-11** | **book an `internal_only` service by knowing its id** | `services.ts:52-58` `isServiceBookableByPatient`; `internal-only-refusal.test.ts` (14 tests) | **PRESENT — was the claimed gap, see §4** |
| MN-12 | book a service not marked `patient_bookable` | same guard; `patient-bookable.db.test.ts` (DB-gated) | PRESENT |
| MN-13 | book an inactive service | `internal-only-refusal.test.ts:67` ("REFUSES an inactive service") + `patient-bookable.db.test.ts:258` (same, DB-gated) **CITATION CORRECTED 2026-08-12, see §9** | PRESENT |
| MN-14 | reach any row of another tenant | every store query filters `tenantId`; RLS isolation tests in CI | PRESENT |
| MN-15 | book a slot in the past | `booking.test.ts:500-530` — refuses with `slot_in_past` **even when the store is forced to report the slot conflict-free**, on both the book and reschedule arms. `past-slot-floor.test.ts` is a source-level companion, not the proof. **CITATION CORRECTED 2026-08-12, see §9** | PRESENT |
| MN-16 | book inside the cut-off window | `cutoff.test.ts` | PRESENT |
| MN-17 | create a double booking on a confirmed slot | `packages/db/tests/no-double-confirmed.test.ts:141,155` — DB-gated REFUSES on both the insert and the update path, with four PERMITS negative controls. `slot-lock.test.ts` proves bucket scoping only and would **not** have carried this row alone. | PRESENT |
| MN-18 | enumerate the patient list through the login screen | `auth/otp/request` answers 204 for known and unknown alike and never queries the patient table; `routes.test.ts` | PRESENT |
| MN-19 | make the clinic pay to send unbounded SMS | per-IP, per-phone and two global ceilings; `sms-pump.test.ts`, `limiter.test.ts` | PRESENT |
| MN-20 | make the clinic text a number that cannot receive SMS | `isSmsCapablePT`; `otp-sms-capability.test.ts` | PRESENT |
| MN-21 | distinguish a wrong code from an unknown number | one 401, one body, six failure modes; `otp.test.ts`, `degradation-copy.test.ts` | PRESENT |
| MN-22 | receive contact data in a notification payload | `payload-minimization.test.ts` (counsel requires this maintained) | PRESENT |
| MN-23 | **have a new `appointments` writer added without a decision about the slot lock** — RESCOPED 2026-08-12, see §9 | `write-paths.test.ts` — repo-wide enumeration of every INSERT and time/therapist UPDATE, pinned to an allowlist that records a decision per path, comment-stripped | PRESENT |

**23 MUST-NEVER rows. 23 enforcement points. ZERO rows without one.**

**EVERY CITATION ABOVE WAS READ LINE BY LINE ON 2026-08-12 and graded REFUSAL or
EXISTENCE. Four were wrong and are corrected in place. The audit is §9 and it is
part of this deliverable, not an appendix to it.**

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

---

## 9. THE CITATION AUDIT — every cited enforcement point read line by line

**Ordered by strategy on 2026-08-12, and it was the right order.** LOOP 6 shipped
with **one** enforcement point built and proven (MN-01, seven negative arms) and
**22 cited from existing tests, checked only for the PRESENCE of refusal
assertions rather than read.** That is the same shape as the 123 assertions this
project has counted that cannot fail, and PG6 was held pending this audit.

**The test applied to each row:** does the cited test prove the row's stated
property is **REFUSED**, or does it merely prove the mechanism **EXISTS**?

**Result: 18 of 22 citations were correct. FOUR WERE WRONG.** Every one of the
four has a correct citation available, now verified and substituted in §3 — so
**no row lost its enforcement point**, but four rows were being carried by a
citation that would not have survived an audit by anyone else. Recorded in full
because a matrix is worth exactly what its citations are worth.

### 9.1 The 22 rows

| MN | Cited (as shipped) | Verdict | Reasoning |
|---|---|---|---|
| MN-02 | `principal.test.ts:33-69`, `forged-token.test.ts:136` | **REFUSAL** | Six explicit `toBeNull()` rejections: staff token, wrong role, non-uuid ids, missing `sub`, null/empty claims. `forged-token.test.ts:136` is literally "does not let an attacker choose which patient they are". |
| MN-03 | `no-session-minting.test.ts:75-118` | **REFUSAL** | Source scan asserting no file calls the forbidden mint symbols and the activation module is deleted, **with an explicit anti-vacuous guard** at :75 ("finds source files to scan"). Refusal by proven absence. |
| MN-04 | `jwt.test.ts:87-146`, `patient-session.test.ts:99-178` | **REFUSAL** | Eight `rejects` in jwt (wrong key, tampered payload, HS256/ES256 key confusion, expired) and six `refuses` in patient-session (different secret, `alg:none`, wrong issuer, garbage, non-uuid ids, expiry, and does-not-slide). |
| MN-05 | `booking.test.ts:193-222` | **REFUSAL** | `describe("self-scope")`: Alice reading, cancelling and rescheduling Bob's row each returns `not_found`, and the cancel arm additionally asserts Bob's row is **left untouched**. Mock-level, not DB-level — noted, but the orchestration is the cited boundary. |
| **MN-06** | ~~`fichas/read.test.ts`~~ | **EXISTENCE — WRONG** | `expect(runAsPatient).toHaveBeenCalledTimes(1)` proves the self-scope wrapper was **invoked**. The store is mocked with `fakeTxReturning(rows)`, so the mock decides what comes back: **`listOwnFichas` with no scoping at all would still pass.** Self-mocking. Corrected to `patient-rls-selfscope.test.ts:173,196,205`, which is DB-gated, names `clinical_records` as a probe table, refuses a same-tenant other patient's row *by id*, refuses the cross-tenant row, and carries a negative control proving the owner CAN see both. |
| MN-07 | `documents/route.test.ts:19`, `download/route.test.ts:36`, `patient/documents.test.ts:63-90`, `patient/download.test.ts:44-58` | **REFUSAL** | Strongest set in the matrix. 401 fail-closed, "ADVERSARIAL: 404s when the document is not the caller's own", null for a cross-patient row, null for a cross-tenant row, and **refuses to sign a path outside the caller's tenant prefix**. |
| MN-08 | `profile/route.test.ts:31,60`, `patient/profile.test.ts:74` | **REFUSAL** | 401 on both GET and PATCH, plus "ADVERSARIAL: drops a foreign row that slips past RLS (explicit id guard)" — a refusal that assumes RLS has already failed. |
| MN-09 | `notes-privacy.test.ts:154,164` | **REFUSAL** | A note sentinel placed on the underlying store row is asserted absent from the serialized envelope on both `listOwn` and `getOwn`, through the real DTO. Leak-refusal, not existence. |
| MN-10 | `redaction.test.ts:35-72` | **REFUSAL** | Adversarial record stuffed with `private_notes`, `red_flags`, `signedBy`, `secret`; default-deny allow-list; "drops the entire freeform data blob by default". |
| MN-11 | `internal-only-refusal.test.ts:56-91` | **REFUSAL** | Five REFUSES arms including "internal_only combined with patient_bookable — the dangerous row", **plus :81 "every clause is load-bearing (the negative arms)"**, plus source-level guards that the deleted allowlist cannot return. |
| MN-12 | `patient-bookable.db.test.ts:254` | **REFUSAL** | DB-gated against real Postgres, and :141 is an explicit "is not vacuous - the fixture contains both answers" guard. |
| **MN-13** | ~~`services.test.ts`~~ | **EXISTENCE — WRONG** | `services.test.ts` tests `normalizeServiceName` and `effectivePriceCents`. **It contains nothing about `isActive` and nothing about refusal.** An auditor opening it would have found pricing tests. Corrected to `internal-only-refusal.test.ts:67` and `patient-bookable.db.test.ts:258`, both of which are literally "REFUSES an inactive service". |
| MN-14 | `patient-rls-selfscope.test.ts`, `cross-tenant-rls-isolation.test.ts` | **REFUSAL** | DB-gated, per-table probes, SELECT/INSERT/UPDATE/DELETE arms, WITH CHECK rejections, and negative controls at :145 and :206 proving the data is visible to someone. |
| **MN-15** | ~~`past-slot-floor.test.ts`~~ | **EXISTENCE — WRONG** | That file asserts the **SQL source text** carries a floor and generates its grid forward. It has an anti-vacuous guard and is a legitimate structural test, but it proves the code is *shaped* right, not that a past slot is *refused*. Corrected to `booking.test.ts:500-530`, which returns `slot_in_past` on both book and reschedule **while forcing `hasWindowConflict` to report the slot free**, so only the past guard can be doing the work. |
| MN-16 | `cutoff.test.ts:19,33` | **REFUSAL** | "rejects (within cutoff)", "rejects an appointment that already started or passed", with the half-open boundary pinned at exactly 24h. |
| MN-17 | `no-double-confirmed.test.ts:141,155` | **REFUSAL** | DB-gated REFUSES on the insert path and on the UPDATE path (the 17:00:01 move from the incident), with four PERMITS negative controls. **`slot-lock.test.ts`, which the shipped row also cited, is bucket arithmetic and would NOT have carried this row alone** — dropped from the citation. |
| MN-18 | `routes.test.ts:118,163,194` | **REFUSAL** | 204 for known and unknown alike, byte-identical status *and* body across every verify failure, and "never reaches the patient table when the code fails". |
| MN-19 | `sms-pump.test.ts:97-198` | **REFUSAL** | REFUSES on both ceilings, cannot be reset by rotating tenantId or phone, keys on a constant, checked last so garbage cannot spend budget — **and :80 "a permitted request really does reach the send"** as the anti-vacuous control. |
| MN-20 | `otp-sms-capability.test.ts:13` | **REFUSAL** | "refuses PT geographic numbers", with :20 accepting mobiles as the positive control so the refusal is not "everything fails". |
| MN-21 | `degradation-copy.test.ts:52,60`, `routes.test.ts:163` | **REFUSAL** | "names no predicate, so it cannot become an enumeration oracle", and the byte-identical-failure assertion. |
| MN-22 | `payload-minimization.test.ts:43,58` | **REFUSAL** *(structural)* | Allow-list denial over the declared payload types, with an anti-vacuous guard at :43. **Limitation stated honestly:** it reads type definitions, so it binds typed code paths and would not catch a field smuggled through an `any`. |
| **MN-23** | ~~`write-paths.test.ts`~~ for "unauthenticated write" | **EXISTENCE — WRONG, AND THE ROW WAS A DUPLICATE** | `write-paths.test.ts` enumerates appointment writers and pins them to an allowlist. **It never asserts that any writer authenticates**, so it did not prove the row as stated — and the row as stated was already carried by MN-01. **RESCOPED** to the property the test actually proves, which is a real and separate MUST-NEVER: a new `appointments` writer must never be added without a decision about the slot lock. |

### 9.2 What this audit says about the loop that produced it

**Four wrong citations out of 23 is a 17% error rate on the deliverable's core
claim**, and it was found by an outside instruction to go and read, not by the
loop that wrote it. Two lessons, both recorded rather than absorbed:

1. **"Contains refusal assertions" is not "proves this row".** MN-13 is the
   clearest case: `services.test.ts` was cited because it is the tests file next
   to `services.ts`, which is proximity, not evidence.
2. **A self-mocking test reads as a strong test.** MN-06's
   `toHaveBeenCalledTimes(1)` looks like rigour and proves nothing about the
   property, because the mock supplies the answer. That is exactly the shape
   `ACC-vacuous-guard-sweep` exists to find, and it was sitting inside a matrix
   written to close an exposure gate.

**`ACC-vacuous-guard-sweep` stays OPEN.** This audit covered the 22 rows this
matrix cites. It did not audit the rest of the suite.
