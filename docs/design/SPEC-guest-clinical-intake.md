# SPEC — the clinical intake form, once per patient, at first online booking

**Status: DESIGN REPORT. NOTHING IS BUILT. HELD UNTIL MIGRATION 0082 EXISTS.**
Author: PURPLE, 2026-09-07. Re-derived from `origin/main` at `380e1023`.
Amended 2026-09-07 to carry STRATEGY'S THREE RULINGS (§0.1). The build stays
held: BLUE's storage is migration `0082` and this document is written against
it, so building before it exists would be building against a shape nobody has.

**Division of labour, from the dispatch:** BLUE owns STORAGE and RETENTION.
This document owns the FORM and the FLOW, and it states precisely what it needs
from BLUE at the seam rather than assuming a shape.

---

## 0. The one-paragraph answer

**It is a FIFTH STEP in the existing guest flow, and it must be, because there
is no other place it can go that is once-per-patient.** Everything it collects
is carried the way the existing four steps carry their answers — hidden fields
in one `<form>` posting to one server action — so it works with JavaScript
turned off, exactly as the four steps do today. **An abandonment writes
nothing**, because the whole flow already writes nothing until the final submit.
It reaches BLUE's storage as ONE extra field on the SAME `POST
/api/v1/booking/guest` call that already creates the row, so there is no second
write to keep in step with the first. **A phone number that already belongs to
a patient changes NOTHING the visitor sees** — that is the no-oracle property
the endpoint was built with, and breaking it would turn a public form into a
patient-list lookup for anyone with a phone book.

---

## 0.1 THE THREE RULINGS, AND WHAT THEY CHANGED IN THIS DOCUMENT

**Stamped by strategy 2026-09-07. They CLOSE the three questions this report
opened. Each is recorded here with what it replaced, because two of them
overturn a recommendation this document made and a reader who only saw the new
text would not know that.**

**RULING 1 — ASK EVERYONE, RESOLVE AT CONVERSION.** Closes `Q-INTAKE-2`. It is
the recommendation §7 made and it is now the rule rather than a proposal. The
form never varies by phone number, so the no-oracle property is preserved by
construction. §7 is unchanged in substance and now states it as ruled.

**RULING 2 — PACEMAKER AND PREGNANCY CARRY THREE STATES, NEVER-ASKED DISTINCT
FROM NO, AND BOTH ARE REQUIRED ON THE FORM.** This is the one that CHANGES the
design, and it changes it twice:

  - it CONFIRMS §5's three-state storage, against the two-state boolean columns
    that exist today; and
  - it makes both questions **REQUIRED**, which §3 had them as optional.

**THE SECOND HALF IS THE SUBTLE ONE AND IT IS WHY THE RULING IS BETTER THAN
WHAT I PROPOSED.** Three states plus an optional field means a guest submission
can WRITE never-asked - a clinical safety question left blank, stored, and
carried into the ficha as a permanent unknown that nobody was ever prompted to
resolve. Requiring both on the form means **never-asked is unreachable through
this door**. The third state still exists in storage, and it must, for the rows
that arrive by every other route: a patient created by reception at the desk, a
migrated record, a submission from before this form existed. So the state is
storable and the form cannot produce it, which is exactly the right split.

**RULING 3 — RETENTION IS SEVEN DAYS, WITH ALL FOUR CONDITIONS, AND IT IS
ALREADY JP'S.** Closes `Q-INTAKE-3`, which this report wrongly listed as open.
§8 is corrected: it is not a question for BLUE and the owner, it is a ruling to
implement, and the consent copy can be written against it now rather than
waiting.

---

## 1. What exists today, re-derived rather than remembered

| Fact | Where |
|---|---|
| Four steps, ONE `<form>`, ONE server action, earlier answers as hidden fields | `apps/portal/app/marcacao/GuestBookingForm.tsx` |
| The step machine, the `GuestValues` shape, `GUEST_TOTAL_STEPS = 4` | `apps/portal/app/marcacao/state.ts` |
| Server-side per-step validation, RGPD consent checked on the server | `apps/portal/app/marcacao/actions.ts` |
| The write: `POST /api/v1/booking/guest` → `guest_booking_requests`, 202 | `apps/api/app/api/v1/booking/guest/route.ts` |
| Reception's queue and the possible-existing-patient COUNT | `apps/web/lib/scheduling/guest-requests.ts` |
| The e2e that walks the flow anonymously and pins the native date input | `apps/web/e2e/guest-booking-flow.spec.ts` |

**THE FORM POSTS TO `action=""`.** Verified by reading the rendered HTML from
the running portal rather than by reasoning about React:

```
<form class="flex flex-col gap-4" action="" encType="multipart/form-data" method="POST">
```

An empty `action` posts to the CURRENT URL. That is the mechanism the whole
no-JavaScript claim rests on, and it is why a fifth step costs nothing
structurally: the wizard is one form that re-renders, not four pages.

**A CORRECTION TO THE BRIEF, AND IT MATTERS FOR WHAT WE MAY CLAIM.** The
dispatch says the four steps "POST WITHOUT JAVASCRIPT and you pinned that with
an e2e deliberately." The e2e pins the CONTROL — that `preferredDate` is
`input[type="date"]` and posts by name — and its header explains why the shared
DatePicker was not used there. **It does not run with JavaScript disabled.**
There is no `javaScriptEnabled: false` anywhere in `apps/web/e2e`. So the
property is real (one form, hidden fields, native inputs, `action=""`, server
validation) and it is pinned by SHAPE, not by execution. **If a fifth step is
built, the honest thing is to add the run that was never there** — one
`test.use({ javaScriptEnabled: false })` walk of all five steps — rather than
inherit a claim nothing has ever executed. That is a small addition and it is
listed in §9.

---

## 2. WHERE IT SITS. A fifth step, after the details, before the submit.

```
1 clinic   2 service   3 when   4 name + phone   5 CLINICAL INTAKE + RGPD   [submit]
```

**WHY NOT FOLDED INTO STEP 4.** Step 4 is already the longest screen in the
flow — two fields, a review block, the RGPD panel and the submit. Nine clinical
questions on top of it makes one screen somebody abandons, on a phone, which is
where a public booking form is read. The step counter exists precisely so a
visitor can see the end.

**WHY NOT EARLIER.** Two reasons, and the second is the one that decides.

1. A visitor who abandons at step 2 has told the clinic nothing about their
   health. Putting health questions before the identity questions means every
   abandoned attempt is one that got further into special-category data than it
   needed to.
2. **THE RGPD TICK MOVES WITH IT AND MUST STAY LAST.** The consent panel is
   currently the last thing above the submit, and that placement is described as
   ratified in `GuestBookingForm.tsx`. Consent has to cover what is being
   collected, and once clinical answers are collected the consent that covers
   them cannot precede them. So the clinical questions go on the LAST step, with
   the RGPD tick beneath them, and the tick's wording becomes a question for
   whoever owns the copy (§7).

**WHAT `state.ts` NEEDS.** `GUEST_TOTAL_STEPS` becomes 5; `GuestStep` becomes
`1|2|3|4|5`; `GuestValues` grows the intake fields; `firstIncompleteStep` grows
one clause. The step-counter string `guest.step_label` already interpolates
`{{total}}`, so "Passo 5 de 5" needs no new key.

---

## 3. THE FIELDS, and what each one is on the wire

JP's list, with the control each needs and the shape it posts as. **Every one
of these works with no JavaScript**, which is the constraint that picked them.

| # | Field | Control | Posts as | Required? |
|---|---|---|---|---|
| 1 | Data de nascimento | `<input type="date">`, native, `min`/`max` from the server in Lisbon | `YYYY-MM-DD` | yes |
| 2 | Motivo da consulta | `<textarea>` | free text | yes |
| 3 | Problemas de saúde | `<textarea>` | free text | no |
| 4 | Medicação habitual | `<textarea>` | free text | no |
| 5 | Quedas e acidentes | `<textarea>` | free text | no |
| 6 | Cirurgias | `<textarea>` | free text | no |
| 7 | Pacemaker | **two radios**: Sim / Não, `required` | `"sim" \| "nao"` | **YES — RULING 2** |
| 8 | Gravidez | two radios, same | `"sim" \| "nao"` | **YES — RULING 2** |
| 9 | RGPD | `<input type="checkbox" name="consent">` | `"on"` or absent | yes, server-checked |

**THE DATE OF BIRTH IS NATIVE, LIKE `preferredDate` AND FOR THE SAME REASON.**
SCHED-07 converted 22 native date inputs to the shared picker across 13 files and
left exactly one alone — this form's — because the picker is a client component
that posts through React state. A second native date input here is consistent
with that decision rather than an exception to it, and the existing e2e assertion
(`input[type="date"][name="preferredDate"]`) should gain a twin.

**NOTHING NEEDS JAVASCRIPT.** Radios, textareas, a native date input and a
checkbox all post from a plain form. There is no field on JP's list that cannot
work without it, so the dispatch's "say so rather than quietly converting the
form" does not need to be exercised. **The one thing that would break it is a
signature canvas, and the dispatch has already ruled that out.**

**THE CONTROL, CONCRETELY, AS RULING 2 SHAPES IT.** Two radios sharing a
`name`, neither pre-checked, and `required`:

```html
<fieldset>
  <legend>Portador de pacemaker</legend>
  <label><input type="radio" name="pacemaker" value="sim" required> Sim</label>
  <label><input type="radio" name="pacemaker" value="nao" required> Não</label>
</fieldset>
```

**NEITHER IS PRE-CHECKED, AND THAT IS THE HALF A `required` DOES NOT COVER.** A
default of "Não" would answer a clinical safety question on the visitor's behalf
and post an affirmative denial they never made — the exact conflation the
dispatch forbids, arriving through a convenience rather than through a blank.

**AND THE SERVER CHECKS IT INDEPENDENTLY**, exactly as the RGPD tick already is:
`required` is a hint to a browser and this form is built to work without one.
`firstIncompleteStep` gains the two fields, so a post that omits either comes
back to step 5 with `missing_field` rather than being stored as never-asked.

**SO THREE STATES ARE STORABLE AND THIS FORM CANNOT PRODUCE THE THIRD.** That
is the split Ruling 2 draws and it is worth restating because it looks like a
contradiction: the never-asked state is real and must be storable, for rows that
arrive by any other route — a patient created at the desk, a migrated record, a
submission from before this form existed. What it must never be is something a
GUEST SUBMISSION writes, because there is nobody to go back and ask.

**A CHECKBOX WOULD STILL BE WRONG**, for the record, and not only because of the
third state: a checkbox conflates "not ticked" with "no", so an unticked
pacemaker box is an affirmative denial nobody made. Radios make "Não" a thing
the visitor pressed.

---

## 4. WHAT HAPPENS IF SOMEBODY ABANDONS MIDWAY

**Nothing is written. Not a partial row, not a draft, not a log line.**

That is not a new property to build; it is how the flow already works and the
fifth step must not change it. The evidence:

- `guestBookingAction` writes NOTHING on `intent=next` or `intent=back`. It
  returns a new `GuestFormState` and the browser re-renders. Every answer lives
  in the FORM, in hidden fields, and in the browser's own memory.
- The only write in the whole flow is `submitGuestRequest`, called once, after
  every step is complete AND consent is ticked AND the commitment copy exists.
- There is no draft table, no session store and no cookie carrying answers.

**SO THE ABANDONMENT CASES ARE:**

| What the visitor does | What the clinic keeps |
|---|---|
| Closes the tab at any step | nothing |
| Presses Back to an earlier step | nothing; the answers are still in the form |
| Reloads the page | nothing; the form resets to step 1 and the answers are gone |
| Loses connectivity mid-step | nothing |
| Completes step 5 and does not press submit | nothing |

**THE RELOAD CASE IS THE ONE WORTH STATING OUT LOUD, BECAUSE IT IS A COST AND
NOT ONLY A SAFETY PROPERTY.** A visitor who reloads at step 5 loses nine
answers, including free text they may have spent minutes on. Today they lose
four short ones, so the cost of the same behaviour goes up sharply with this
change. Three options, and I recommend the first:

1. **ACCEPT IT.** No storage, no recovery, and the form says so implicitly by
   being short-lived. This keeps the "nothing is written until submit" property
   absolutely, which is the strongest privacy claim available on a form
   collecting Article 9 data from somebody who is not a patient.
2. `sessionStorage` draft, client-side. **REJECTED:** it puts health data on the
   device's disk with no expiry the clinic controls, it needs JavaScript (so the
   no-JS path silently gets a different product), and it is the kind of thing a
   DPIA has to describe for a benefit measured in typing.
3. A server-side draft row. **REJECTED, harder:** it is the partial-row storage
   this design exists to avoid, and it turns every abandonment into retained
   health data about a person who never became a patient.

**RECOMMENDATION: option 1**, and the mitigation is layout rather than storage —
one screen, no sub-steps, so there is nothing to lose by moving between them.

---

## 5. THE THREE-STATE QUESTIONS, AND THE COLUMN THAT CANNOT HOLD THEM

**THIS IS A PREMISE MISMATCH WITH THE PATIENT SCHEMA AND IT IS REPORTED RATHER
THAN RESOLVED.**

The dispatch: "Pacemaker and pregnancy are CONFIRM OR DENY, three states each
including unanswered. A blank is not a 'no' on a clinical safety question."

What the patient table holds today, from `packages/db/migrations/0031_nesa_contraindications.sql`
and `0034_pacemaker_contraindication.sql`:

```sql
ADD COLUMN IF NOT EXISTS contraindication_pregnancy boolean NOT NULL DEFAULT false;
ADD COLUMN IF NOT EXISTS contraindication_pacemaker boolean NOT NULL DEFAULT false;
```

**`boolean NOT NULL DEFAULT false` HAS TWO STATES, AND THE MISSING ONE IS
EXACTLY THE ONE THE DISPATCH NAMES.** These flags drive the NESA
contraindication warning on the booking drawer
(`getPatientContraindications`, `apps/web/lib/patients/actions.ts`), which
already reads `row?.pacemaker ?? false` — so an absent patient row and a patient
who answered "no" produce the same screen.

**THE CONSEQUENCE FOR THIS FORM.** Whatever BLUE builds for intake storage, the
answers must reach it as three states. What must NOT happen is the obvious
convenience: mapping an unanswered pacemaker question to `false` on conversion.
That is `PORTAL-REHYDRATE §1.3` in its purest form — an unknown case written as
the benign known one — and here the benign-looking value is what tells a
therapist it is safe to proceed with NESA.

**RULED 2026-09-07 (RULING 2). This is no longer a question.**

- **intake storage keeps three states** (`'sim' | 'nao' | never-asked`), in
  BLUE's `0082`, and NOT in the two-state boolean columns above;
- **both questions are REQUIRED on the form**, so a guest submission can never
  produce never-asked. See §3 for the control and for why neither radio is
  pre-checked;
- **conversion NEVER writes `contraindication_*` from an intake answer at all.**
  Not for "sim", not for "nao", not for never-asked. Those columns are a
  clinician's assertion about a patient, and an import is not a clinician.

**WHY THAT LAST LINE IS STRONGER THAN WHAT THIS REPORT FIRST PROPOSED.** The
first draft said conversion should write `true` for "sim" and leave the column
alone otherwise. That is defensible and it is still a machine deciding a
clinical flag from a form a stranger filled in on a phone. The intake answer and
the contraindication flag are DIFFERENT CLAIMS — "the person said they have a
pacemaker" and "this patient has a pacemaker, and a therapist has confirmed it"
— and collapsing them is the same conflation one layer up.

**SO THE ANSWERS RENDER AS THEIR OWN READ-ONLY BLOCK ON THE FICHA**, verbatim,
attributed to the patient and dated, and a clinician sets the flags. The
never-asked state still has to render there, in words, for the rows that carry
it from other routes — a blank is not a "no" on a clinical safety question, and
that is as true on the screen as it is in the column.

---

## 6. HOW IT REACHES BLUE'S STORAGE

### 6.1 It cannot go where patient intake goes today

`patient_form_submissions` is the existing intake relation, and it **cannot hold
this**:

```ts
patientId: uuid("patient_id").notNull().references(() => patients.id),
```

`NOT NULL`, with a self-scope RLS policy keyed on the patient principal
(`packages/db/src/schema.ts`, migrations 0011/0013). **A guest has no patient row
and no principal.** So intake at first booking is not a variant of the portal
form; it is a different relation with a different owner, and that is BLUE's to
build.

### 6.2 The seam: ONE field on the call that already exists

```
GuestBookingForm  --(one <form>, five steps, hidden fields)-->  guestBookingAction
guestBookingAction  --(server-to-server)-->  submitGuestRequest
submitGuestRequest  --(POST, JSON body)-->  /api/v1/booking/guest
route  --(one INSERT)-->  guest_booking_requests   +  <BLUE's intake row>
```

**THE INTAKE TRAVELS AS ONE NESTED OBJECT ON THE EXISTING BODY**, not as a
second request:

```jsonc
{ "fullName": "...", "phone": "...", "serviceId": "...", "locationId": "...",
  "preferredDate": "...", "preferredPeriod": "...",
  "intake": { "dateOfBirth": "...", "reason": "...", "conditions": "...",
              "medication": "...", "falls": "...", "surgeries": "...",
              "pacemaker": "sim"|"nao"|null, "pregnancy": "sim"|"nao"|null,
              "consentAt": "<server timestamp>" } }
```

**WHY ONE CALL AND NOT TWO.** Two writes need a transaction or they need a
reconciliation, and a booking request that exists without its intake — or an
intake with no request — is a row nobody can act on and nobody will notice. The
route already performs exactly one INSERT inside one request; the intake write
belongs in the same transaction, which is BLUE's call to shape.

**WHAT I NEED FROM BLUE, stated as the seam rather than as a design:**

1. the relation and its columns, including the three-state representation;
2. whether the intake row is keyed on the `guest_booking_requests.id` (my
   recommendation: yes — it is one act, and it makes the FK the retention
   handle) or stands alone;
3. the RLS: who reads it before conversion. **My input:** the same principals
   who read the guest queue — `guest_requests:read`, owner/admin/reception,
   location-scoped — and NOT therapists, because before conversion there is no
   patient and therefore no own-patient scope to bound them by;
4. **nothing** — what conversion does with it is ruled (§5): the
   `contraindication_*` columns are never written from an intake answer.

### 6.3 The Article 9 rules, and where each is enforced

> "This is special-category health data under GDPR Article 9. It must never
> appear in a URL, a query string, a log line, or an error message."

| Rule | Why it holds, in this design |
|---|---|
| Never in a URL | the form is `method="POST"` to `action=""`. No answer is ever a query param, at any step, with or without JavaScript. The step number is a hidden field, not a route |
| Never in a query string | same mechanism. **The one thing that must be resisted is putting `?step=5` in the URL for shareability** — it is harmless alone and it is the first crack |
| Never in a log line | `submitGuestRequest`'s failure logger already carries the rule: "Names only, never values, and never the name or the number (PII rule #7)". The intake must be held to the same rule, and the API route must not log the body |
| Never in an error message | the screen's error vocabulary is a closed union (`GuestError`) of five values rendered from the dictionary. **No server value ever reaches the visitor's screen as text**, so an error cannot echo an answer back. A sixth member for an intake-specific refusal is fine; a free-text error is not |

**ONE MORE THAT IS NOT ON THE LIST AND SHOULD BE.** Sentry. The portal scrubs
frame variables (`apps/web/lib/observability/sentry-scrub.ts`, #856), and a
server action that throws mid-submit has the whole `FormData` in scope. Before
this ships, that scrub must be checked against a five-step form — not assumed to
cover it because it covers today's four short strings.

---

## 7. THE PHONE NUMBER THAT ALREADY BELONGS TO A PATIENT

**THE FORM DOES NOTHING DIFFERENT. NOT ONE PIXEL. THAT IS THE DESIGN.**

From the endpoint's own header:

> IT ANSWERS 202 WHETHER OR NOT THE PHONE MATCHES A PATIENT, and that is the
> whole no-oracle property. The duplicate flag is computed for RECEPTION and
> never reaches the caller — a response that differed would turn a public form
> into a patient-list oracle for anyone with a phone book.

So a returning patient who books through the public form gets the same 202, the
same confirmation screen and the same words as a stranger.

**WHAT ACTUALLY HAPPENS, on reception's side:** `guest_booking_requests.phone_e164`
is a GENERATED column using 0062's expression verbatim, and
`listPendingGuestRequests` reports `possiblePatientMatches` — a COUNT, never a
link, because `resolvePatientByProvenPhone` refuses when several patients share a
number rather than picking one. Reception sees "you may already have them" and
decides.

**THE INTAKE MAKES ONE THING WORSE AND IT NEEDS A RULING.** Today a duplicate
costs reception a lookup. With intake attached, a returning patient fills in nine
clinical questions the clinic already has answers to, and the clinic ends up with
TWO sets of answers of different ages for one person. The dispatch says the form
is once per patient — but the form cannot know who is a patient without becoming
the oracle it must not be.

**RULED 2026-09-07 (RULING 1): ASK EVERYONE, RESOLVE AT CONVERSION.** The
visitor's experience is identical either way; reception already sees the match
count; and when they convert a request onto an EXISTING patient, the new intake
is attached as a DATED submission rather than overwriting anything. Two dated
answers to "medicação habitual" is a clinical record; one silently replaced is a
lost one.

**REJECTED ALTERNATIVE, and the reason is the point:** skipping the intake step
when the phone matches. It would leak, exactly. A visitor could type any number
and read whether the clinic knows it from whether step 5 appears — a patient-list
oracle built out of the form's own navigation, which is precisely the shape the
202 was designed to prevent.

---

## 8. RETENTION — RULED, NOT OPEN. SEVEN DAYS, JP's, WITH ALL FOUR CONDITIONS.

**THIS REPORT LISTED IT AS AN OPEN QUESTION AND THAT WAS WRONG.** It was already
ruled by JP. `Q-INTAKE-3` is struck; what follows is an implementation
requirement, and the consent copy can be written against it now rather than
waiting on an answer that had already been given.

**SEVEN DAYS, AND ALL FOUR CONDITIONS HOLD TOGETHER.** A retention rule with
three of four implemented is not a shorter rule, it is a different one, so the
four are listed as a set that BLUE's `0082` and its deletion path must satisfy
together rather than as a checklist to work through:

1. an unconverted intake is deleted seven days after it arrives;
2. conversion ENDS the clock — once the person is a patient the submission is
   part of their record and this rule stops applying to it;
3. the deletion takes the ANSWERS, not the request: `guest_booking_requests`
   survives as the audit trail of what was asked for, which carries no Article 9
   data;
4. the clock runs on arrival, not on last touch, so a request nobody works does
   not live longer than one somebody looked at.

**THE CONSENT TEXT MUST SAY SEVEN DAYS.** That is why this was on the critical
path for the copy: a consent that describes an indefinite hold would be wrong
about the clinic's own rule, and one that says nothing leaves the visitor unable
to know.

**WHAT IS STILL BLUE'S:** the mechanism. Whether it is a scheduled job, a
partial index with a sweep, or a check on read is a storage decision, and the
only thing this document requires of it is that the four conditions above are
true of what it does.

---

## 9. WHAT BUILDING IT ACTUALLY COSTS

Listed so the stamp is informed. Nothing here is started.

| | Change | Files |
|---|---|---|
| 1 | Five steps: constant, union, values, `firstIncompleteStep` | `apps/portal/app/marcacao/state.ts` |
| 2 | The step-5 fieldset, the three-state radios, the DOB input | `apps/portal/app/marcacao/GuestBookingForm.tsx` |
| 3 | Server validation for step 5, intake read out of `FormData` | `apps/portal/app/marcacao/actions.ts` |
| 4 | `intake` on the request body | `apps/portal/lib/guest/api.ts` |
| 5 | Accept, validate and hand to BLUE's write | `apps/api/app/api/v1/booking/guest/route.ts` |
| 6 | ~20 new keys, pt AND en (see the English report) | `packages/i18n/src/portal/strings.*.json` |
| 7 | **The no-JS e2e that has never existed**, five steps, `javaScriptEnabled: false` | `apps/web/e2e/guest-booking-flow.spec.ts` |
| 8 | The three-state unit suite: unanswered survives as a third value end to end | new |
| 9 | The Article 9 guard: a suite asserting no answer reaches a URL, a log or an error string | new |
| — | storage, RLS, retention, conversion | **BLUE** |

**ITEM 9 IS NOT CEREMONY.** The four rules in §6.3 are properties nothing
currently checks, and three of the four are the kind that hold on the day they
are written and break silently later — a `console.error` added during a
debugging session, an error message that starts interpolating a value, a
`?step=` added for convenience. A guard over the source is what this repo uses
for exactly that class (`scripts/pack-sessions-remaining-is-frozen.test.mjs` is
the worked example) and it belongs here.

---

## 10. NOTHING IS OPEN. WHAT THE BUILD WAITS ON IS A MIGRATION.

**ALL THREE QUESTIONS THIS REPORT RAISED ARE CLOSED** — see §0.1. They are kept
here struck rather than deleted, because a reader who remembers the questions
needs to find the answers in the place they were asked:

- ~~**Q-INTAKE-1** — an unanswered pacemaker/pregnancy question at conversion.~~
  **RULED (2).** Three states in storage, both questions REQUIRED on the form so
  a guest submission cannot write never-asked, and `contraindication_*` is never
  written from an intake answer at all. §5.
- ~~**Q-INTAKE-2** — a phone number that already belongs to a patient.~~
  **RULED (1).** Ask everyone, resolve at conversion. §7.
- ~~**Q-INTAKE-3** — how long does an unconverted intake live?~~ **IT WAS NEVER
  OPEN.** JP had already ruled seven days with four conditions; this report was
  wrong to list it. §8.

## THE BUILD IS HELD ON `0082`, AND THAT IS A DIFFERENT KIND OF HOLD

It is not waiting on a decision any more. It is waiting on BLUE's storage
migration to EXIST, because every field shape in §3, the three-state
representation in §5 and the retention clock in §8 are written against a table
nobody has created yet.

**BUILDING AGAINST A SHAPE THAT DOES NOT EXIST IS HOW THE TWO HALVES COME APART.**
The form would post a body the write path cannot store, and the mismatch would
surface as a runtime failure on a PUBLIC form with a stranger's health data in
the request. So the order is: `0082` lands, this document is re-derived against
what it actually created, and only then does the form get built.

**WHAT PURPLE CAN DO BEFORE THEN: NOTHING IN THIS FLOW.** Stated so it is not
mistaken for an invitation to start the parts that look independent — the fifth
step, the radios and the validation all encode the storage contract, and writing
them first only moves the re-derivation later.

**STOP.**
