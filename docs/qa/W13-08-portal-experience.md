# W13-08 — portal experience audit (PG9)

**LOOP 8. Started 2026-08-12 against `origin/main` @ `ac2ae5c`.** Closes **PG9**:
*"EXPERIENCE: 3E. Mobile-first, WCAG 2.2 AA, pt-PT, 24h format, one primary
action on landing, patient-readable empty and error states, minimum field
count."*

> ## STATUS: IN PROGRESS. PG9 IS NOT CLOSED BY THIS DOCUMENT.
> The automated half is built. The human half is **partially filled** (§3), and
> reading the copy has already produced **one real gap**: no portal error state
> carries the clinic's telephone, which the DoD names explicitly. §5 states what
> remains.

---

## 1. Tool and ruleset, and what they do not cover

**`@axe-core/playwright`, tags `wcag2a wcag2aa wcag21aa wcag22aa`.** Ruled by the
owner on 2026-08-12 (`LE-pg9-a11y-tool-decision`) on the reasoning that the e2e
harness is already Playwright, so this adds a **library** rather than a second
runner, a second config and a second CI job.

**AUTOMATED a11y CATCHES ROUGHLY A THIRD TO A HALF OF WCAG FAILURES.** Stated
first, because a gate that reads "axe is green" and means "the portal is
accessible" is exactly the kind of overclaim this project has spent a day
removing.

| Axe decides | Axe cannot decide |
|---|---|
| contrast ratios | whether copy is comprehensible to a patient |
| accessible names, roles, landmarks | **2.2 focus-not-obscured** in practice |
| target size (2.5.8) | **2.2 consistent help** across screens |
| form labels, heading order | whether an error state tells you what to *do* |
| duplicate ids, lang attributes | minimum field count |

**So the DoD asks for both**, and §3 is the half a machine cannot supply.

---

## 2. The screens, and why the list is pinned in code

Eight patient-facing screens, enumerated from the filesystem at authoring time
and **pinned in `apps/web/e2e/portal-a11y-experience.spec.ts`**:

| # | Route | Screen |
|---|---|---|
| 1 | `/portal/dashboard` | Dashboard — the landing screen |
| 2 | `/portal/appointments` | Consultas |
| 3 | `/portal/booking` | Marcar consulta (5-step flow) |
| 4 | `/portal/booking/pending` | Pedido recebido |
| 5 | `/portal/clinics` | Clínicas |
| 6 | `/portal/documents` | Documentos |
| 7 | `/portal/forms` | Fichas |
| 8 | `/portal/account` | Conta |

**Two routes are deliberately outside this list**, and the reason is stated so it
is not read as an omission:

- **`/auth/login`** — audited under **PG1**, which closed on the owner's
  deployed-screen check of exactly that screen on 2026-08-12.
- **`/portal/appointments/[id]`** — a detail route with no static instance; it
  needs a run-created appointment to render, which makes it a criterion-F problem
  rather than a screen audit. Carded rather than skipped silently.

**A new portal screen must be added to the list in the spec**, and the count
assertion there is what makes forgetting it a red rather than a silent gap in
this gate's coverage.

---

## 3. Per-screen audit — the half axe cannot judge

**PARTIALLY FILLED, 2026-08-12, by reading the screens and their copy.** `CI`
means the criterion is machine-checked on every commit by
`portal-a11y-experience.spec.ts`. The columns below carry a **verdict** where one
can be reached from the source, and a blank where it genuinely needs a rendered
screen at 390×844.

| # | Screen | A: axe | Mobile-first | pt-PT | 24h | One primary | Empty/error readable | Min. fields |
|---|---|---|---|---|---|---|---|---|
| 1 | Dashboard | `CI` | `____` | `CI` | `CI` | `CI` | **GAP** | n/a |
| 2 | Consultas | `CI` | `____` | `CI` | `CI` | n/a | **GAP** | n/a |
| 3 | Marcar consulta | `CI` | `____` | `CI` | `CI` | n/a | **GAP** | `____` |
| 4 | Pedido recebido | `CI` | `____` | `CI` | `CI` | n/a | **SEE SEC card** | n/a |
| 5 | Clínicas | `CI` | `____` | `CI` | `CI` | n/a | n/a — no error route | n/a |
| 6 | Documentos | `CI` | `____` | `CI` | `CI` | n/a | **GAP** | n/a |
| 7 | Fichas | `CI` | `____` | `CI` | `CI` | n/a | **GAP** | `____` |
| 8 | Conta | `CI` | `____` | `CI` | `CI` | n/a | **GAP** | `____` |

### 3.1 The error-state finding, and it is a real PG9 gap

**The DoD line reads:** *"Empty and error states that a patient can read and act
on: what happened, what to do, and **the clinic's telephone where the answer is
'call us'**."*

**Every portal error state satisfies the first two and none satisfies the third.**
Read from `packages/i18n/src/portal/strings.pt.json`, `errors.*`, all six route
boundaries (`account`, `appointments`, `booking`, `dashboard`, `documents`,
`forms`) rendering `ErrorState` with a title, a description and a retry:

| String | What happened | What to do | Telephone |
|---|---|---|---|
| `load_appointments` / `_desc` | yes | "Tente novamente" | **no** |
| `load_documents` / `_desc` | yes | "Tente novamente" | **no** |
| `load_forms` / `_desc` | yes | "Tente novamente" | **no** |
| `load_dashboard` / `_desc` | yes | "Tente novamente" | **no** |
| `load_account` / `_desc` | yes | "Tente novamente" | **no** |
| `403_title` / `403_body` | yes | **nothing at all** | **no** |
| `500_body` | yes | "tente mais tarde" | **no** |

**And five strings elsewhere say "contacte a clínica" without giving a number.**
Telling a patient to call and not saying what to call is the shape of the defect,
not a nicety: the portal already knows the numbers — they are in
`apps/portal/app/portal/clinics/page.tsx:12,26` — so the information exists and
does not reach the screen where it is needed.

**`403` is the worst of them.** "Não tem permissão para ver esta página" offers
**no action of any kind**: no retry, no navigation, no telephone. A patient who
reaches it has nothing to do next.

### 3.2 HALF BUILT, 2026-08-12, and the other half is a HALT

**BUILT — the case that actually locks a patient out.** `apps/portal/lib/clinics.ts`
now holds the contact details, `clinics/page.tsx` imports them instead of holding
them, and **the login screen's degradation block renders every clinic telephone
as a `tel:` link**.

That is where the dead end really was. `otp_no_phone`, `otp_landline` and
`otp_shared_number` all end in *"Contacte a clínica"*, they are shown on the
**login** screen, and Decision D leaves **no other door** — a patient with no
mobile on record cannot get in by any other route. The numbers were in the app
the whole time and that screen could not see them.

**No new sentence was written.** The heading is `clinics.phone_label`
("Telefone"), which already existed; the numbers are data. Every clinic's number
is shown deliberately: the login screen runs **before** authentication, so it
does not know which clinic the patient belongs to and must not appear to —
narrowing the list would leak the membership the OTP endpoint refuses to
disclose. Guarded by `apps/portal/lib/clinics.test.ts`, 8 assertions, 4 negative
arms.

**HALTED — the route error boundaries.** Giving `errors.*` a telephone requires
**new patient-facing copy**, and the dispatch forbids drafting it.

| String | Says today | To add a phone would need |
|---|---|---|
| `load_appointments_desc` and the four siblings | *"Tente novamente."* | a new sentence telling the patient to call |
| `500_body` | *"Tente novamente mais tarde."* | a new sentence |
| `403_body` | *"Não tem permissão para ver esta página."* | a new sentence, **and an action where there is none at all** |

**None of the `errors.*` strings mentions the clinic**, so there is no existing
sentence to wire a number into — unlike the five that already say *"contacte a
clínica"*. Writing one is authoring patient copy, which a person must approve.

**`403` is the one to approve first.** It offers no retry, no navigation and no
telephone. A patient who reaches it has nothing to do next.

**`CI` means the criterion is machine-checked on every commit**, not that it has
passed. The run that fills those cells is the one that closes them.

---

## 4. What is already true before this loop changes anything

Recorded so the loop is not started from zero, and so any regression here is
visible as a regression:

- **pt-PT is the default** and every user-facing string routes through
  `packages/i18n`.
- **24h format shipped as W12-31**, product-wide.
- **`loading.tsx` and `error.tsx` exist per route** across appointments, booking,
  dashboard and documents, so the error and empty surfaces are present.
- **`EmptyState` and `ErrorState` primitives exist** in `packages/ui`, and the
  brief forbids inventing a third.
- **`PortalShell` already records AA contrast decisions in source** — 64px bottom
  tab bar, ≤5 tabs, 44px targets.
- **The June QA records** (`docs/qa-a11y-portal-2026-06-17.md`,
  `docs/qa-e2e-portal-2026-06-19.md`) predate this build by eight weeks and were
  taken against WCAG 2.1-era checks. **They are a starting point, not evidence.**

---

## 5. What remains before PG9 can close

| DoD line | State |
|---|---|
| Automated a11y check on every portal screen, tool and ruleset named | **BUILT**, first CI run pending |
| A test proves no untranslated string reaches a patient, including error paths | **BUILT** for the eight screens. **The error paths are not yet covered** — they need a forced failure per route. |
| A test proves 24h formatting on every time render | **BUILT** |
| A test proves exactly one primary action on the landing screen | **BUILT** |
| Every empty and error state asserted to contain actionable pt-PT text | **NOT BUILT, AND A GAP FOUND** — no error state carries the clinic's telephone; `403` offers no action at all. See §3.1. |
| The per-screen audit table committed | **COMMITTED, NOT FILLED** — §3 |
| Mobile-viewport screenshots of every screen | **NOT TAKEN** |
| Lint, typecheck, unit, e2e, build pass | lint/typecheck/build green; **e2e not yet run** |

**Six of nine DoD lines are built. Three are not**, and PG9 does not close on
six. The machine-checkable half of this gate exists; the human half is started
and has already paid for itself by finding §3.1.

### 5.1 The slot-lock template, and where it fits here

`BOARD-SPEC.md` records the preferred standard: **a gate row whose property can
be disabled by a flag should carry a CI arm that disables it and requires the
check to fail.**

**It does not fit most of PG9**, and that is worth saying rather than
manufacturing a switch to satisfy a standard — the note in `BOARD-SPEC.md`
explicitly warns against adding a production path that exists only for a test.
Contrast, landmarks and target size have no disable flag; they are properties of
the markup.

**Where it does fit is the axe scan itself**, and that arm is worth building: a
run with the ruleset narrowed to a tag the portal provably violates should turn
the check RED. Without it, "axe found no violations" is indistinguishable from
"axe was misconfigured and scanned nothing" — the same class as a skipped test
inside a green shard. **Not yet built.**
