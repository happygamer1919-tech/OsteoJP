# Wave 13 acceptance session — the plan

> **THIS FILE IS A PLAN, NOT A RECORD. RESULTS LIVE IN
> `docs/acceptance-session-wave-13-results.md`.**
>
> Added 2026-08-11. This file was read as a status update and it is not one — it
> says so itself at line 1259: *"it is the stop condition, not a status update."*
> Nothing here records what was observed. Line 1241's "Readiness **can** reach
> 6/9 **if** every gate item passes" is a projection, not a result, and reading
> it as one produced a gate ledger that disagreed with the board in two
> directions at once.
>
> **A gate moves when a row in the results file carries an observation.** Never
> because this file describes what an observation would look like.
> Card: `ACC-13-results-uncommitted`.

**One sitting. Numbered. Every item is a URL, an expected screen, a failure
signal, and the gate it closes.**

This is the session WF-16 rules the wave ends on. Everything built since
2026-08-05 that closes on an owner screen (WF-03) has been accumulating silently
instead of interrupting you; this is where it all resolves at once.

**Budget: about 50 minutes.**

> **Revised six times**, each after a review found something that would have cost
> the sitting: **[2a]**–**[2d]**, **[4a]**–**[4e]**, **[R2a]**–**[R2d]**,
> **[3a]**–**[3d]**, then **[1]**–**[1e]** with **[2]**–**[5]**, and now
> **[6a]**–**[6h]**. The fourth round found that **the session consumed a pedido
> nothing in it created**, which would have lost PG2 and half of PG4 to ordering
> alone, and renumbered the whole checklist.
>
> **The sixth round is the first driven by the setup that actually exists rather
> than by another re-read of the plan.** Two things did not match: **one patient
> record serves both the canary and the terms roles** (0d and 0f assumed two, and
> the text sent a reader toward the duplicate-phone trap this same file documents),
> and **the test therapist is unconfigured to the point where items 9, 11 and 14
> would each have failed for setup reasons and read as product defects.** Pre-flight
> gains **0h**; the checklist itself is unchanged except for three corrections of
> fact. Each change is marked where it applies.

---

# PRE-FLIGHT

Everything here happens **before item 1**, except **0e**, which is performed at
**item 4** for the reason 0e gives. Two of these start clocks that run in the
background across the middle of the session.

> **[6c] 0h IS THE ONE THAT TAKES REAL TIME, so do it while the 0c recovery clock
> runs.** It configures the test therapist, and without it **items 9, 11 and 14
> all misbehave for setup reasons that look like product defects**. **0i** is a
> single read: it records that the "Ficha incompleta" banner blocks nothing, so
> you do not stop on it mid-session.
>
> **Suggested order: 0c (start the clock) → 0h → 0d → 0f → 0i → 0g → item 1.**

## 0a–0b. Already done — no action **[4e]**

- **`PORTAL_TENANT_ID` is set** on the portal deployment. ✅
- **Both auth templates are pasted** (post-#840, the trimmed versions). ✅

## 0c. START THE RECOVERY CLOCK — trigger only, do not open it **[R2a]**

**Trigger a password recovery to a real Gmail address. Then leave it completely
alone and carry on.**

### The click path **[7b]**

> **[7b] ADDED 2026-08-09. This step named an outcome and no surface** — the only
> pre-flight block without a click path, and item 21's failure branch then said
> "trigger a new recovery" with the same gap. **There is nowhere in the product to
> do it from:** the staff login screen carries no "forgot password" link (carded
> as `LE-staff-no-forgot-password`), so the Supabase dashboard is currently the
> ONLY way to start this clock.

1. **supabase.com** → the **`dfotoodqvmjhbdcxyaxf`** project.
   > **STOP if the ref differs** — `jaxmkwoxjcgzkwxgbayx` is the retired old prod.
2. **Authentication** → **Users**.
3. Find **your own** account row. **Read the email address before you act on it.**
4. The row's **⋯** menu → **Send password recovery**.
   > **Expected:** a success toast. The mail arrives at that address.
   > **Failure signal:** an error, or no mail within a few minutes — check the
   > project's SMTP settings before assuming the template is at fault.

> **[R2a] Its ONLY job is to start the clock.** You read the link at **item 21**,
> in sequence. **The wait IS the test** — a mail-provider scanner has to have
> followed the link before you click it. Clicking immediately proves nothing, and
> five previous verification rounds failed for want of this step.

**RECOVERY IS RUN AGAINST YOUR OWN ACCOUNT AND NO OTHER. [R2c]**

> A recovery run against **Rodica, Lurdes or Carlos** changes their password and
> **locks a real person out mid-week**, with no undo that restores the old one.

- **Account used:** `_______________________` (must be your own)
- **Triggered at:** `__________`

## 0d. CONFIRM A PATIENT RECORD CARRIES YOUR MOBILE **[3b]**

> **[3b] Without this, item 12 cannot work and its failure looks like a code
> fault.** OTP login resolves the phone to a patient row at claim time
> (`resolvePatientByProvenPhone`, WF-07). If no row matches, the refusal is the
> **same generic message** as a wrong code — by design, so nobody can enumerate
> patients by phone number. **You would see "Não foi possível entrar" and have no
> way to tell it apart from a broken canary.**

> **[6a] ONE PATIENT RECORD SERVES BOTH 0d AND 0f. THAT IS THE EXPECTED
> CONFIGURATION, NOT A SHORTCUT.** An earlier draft said the 0f test patient "is
> NOT the one — it is created with no phone, deliberately", which read as an
> instruction to hold two records. **It is withdrawn.**
>
> **Why the split was never needed.** 0f exists for exactly two reasons: keep a
> permanent, unremovable acceptance off a **real** patient, and keep session
> messages away from a **stranger's** handset. A single record named for what it
> is, carrying **your own** mobile, satisfies both — it is not a real patient and
> the only phone it can reach is yours.
>
> **Why holding two would have been actively dangerous.** The obvious way to give
> the 0f patient a phone is to put **your** number on it, and then two records
> share one number. **`resolvePatientByProvenPhone` selects `LIMIT 2` and refuses
> on anything but exactly one row** (`patient-linkage.ts:59-79`). There is no
> unique constraint on `patients.phone` to stop you, so the duplicate is accepted
> and **neither** patient can ever log in — silently, with the same generic
> refusal as a wrong code. The warning further down this section describes that
> trap; the withdrawn sentence walked you into it.
>
> **So: one record. It is the canary at items 12–14 and the terms subject at
> items 5–8.** Nothing in the terms path can tell the difference — see 0f.

**THE NUMBER MUST BE STORED IN EXACTLY THIS FORMAT.** From the code, not from
memory: the submitted number is normalised by `normalizePhonePT`
(`phone.ts:37-50`) to **`+351` followed by nine digits, no spaces and no
punctuation**, and the lookup is an **exact string equality** against
`patients.phone` (`patient-linkage.ts:69`).

```
+351912345678        ✅  what the lookup matches
+351 912 345 678     ❌  spaces — equality fails, refusal is silent
912345678            ❌  no country code
00351912345678       ❌  normalised on input, but NOT on what is stored
```

**Check it:**

1. Staff platform → **Pacientes** → search for your own patient record.
   > If you do not have one, create it: **Novo Paciente**, your name, your mobile.
2. Open it → **Editar** → look at the **Telemóvel / Telefone** field.
   > **Expected:** exactly `+351` + 9 digits, no spaces.
3. If it has spaces or is missing the prefix, **retype it in the exact format
   above** and **Guardar**.

**Two more conditions the lookup requires, both invisible on screen:**

- The record must be in the **portal tenant** (`PORTAL_TENANT_ID`).
  **[6f] THERE IS NOTHING TO CHECK HERE AND NO BLANK TO FILL. Read the note below
  before looking for one.**
- The record must carry **exactly one** row with that number in that tenant —
  see the warning below, which matters more than it looks.

> **[6f] THE TENANT QUESTION, ANSWERED SO IT STOPS BEING A STEP.**
>
> **First, the screen does not say what it looks like it says.** The
> `OsteoJP (LV)` on a patient record is the **primary LOCATION name**, resolved
> from `patient.primaryLocationId` (`app/patients/[id]/page.tsx:104-105`, rendered
> by `identityLine` at `:569-576`). **It is not the tenant**, and no patient screen
> anywhere renders a tenant. Reading it as one would be a false confirmation, which
> is worse than no confirmation.
>
> **Second, production has one tenant.** Committed statement:
> `docs/cutover-runbook.md:162` — "there is only one production tenant". Corroborated
> by the only tenant id that appears in any migration backfill
> (`0046_users_is_bookable.sql`, the attested, owner-signed-off prod id-map).
> **This is repo-derived, not a live read** — rule 1 forbids a prod-connected query,
> and no live count was taken.
>
> **Third, and this is what makes the check unnecessary rather than merely
> awkward: items 12 and 13 ARE the tenant check.** The lookup filters
> `patients.tenant_id = <tenantId>` in the query itself (`patient-linkage.ts:69`),
> where `tenantId` is `PORTAL_TENANT_ID` (`apps/portal/lib/auth/otp.ts:53-59`). A
> patient in the wrong tenant is refused — same generic message, no exception. So
> **a successful login at item 13 proves this record sits in the tenant the portal
> resolves to**, and nothing you could do beforehand proves it earlier or better.
>
> **Do not look for a surface. There is no blank on this line.**

> **[4b] CORRECTION — an earlier draft of this section was WRONG, and following
> it would have broken the canary.** It said a record "already linked to an auth
> user will refuse", and implied that logging in once would lock you out of
> logging in again.
>
> **That is not how it works.** Verified in the code: the OTP claim path
> (`verify/route.ts:125-167`) proves the code, resolves the patient, spends the
> code and issues a trusted-device row — **it never writes `patients.auth_user_id`**.
> Nothing in `apps/api` does; the column is only ever READ, by the linkage filter
> (`patient-linkage.ts:71`). It exists from migration 0010, the pre-Decision-D
> model where a patient had a Supabase auth user, and Decision D retired that.
> **So an OTP patient's `auth_user_id` stays NULL permanently and you can log in
> as often as you like.**
>
> **DO NOT "SOLVE" THIS BY CREATING A SECOND PATIENT WITH THE SAME MOBILE.** That
> is the move the wrong text invited, and it is worse than the problem it was
> meant to avoid. There is **no unique constraint on `patients.phone`** (checked:
> 0015 adds a non-unique `phone_digits` index and nothing else), so the duplicate
> would be accepted — and then `resolvePatientByProvenPhone` selects with
> `LIMIT 2` and **refuses on anything but exactly one row**
> (`patient-linkage.ts:77`). Two records sharing a number means **neither patient
> can ever log in**, silently, with the same generic refusal. It is not
> first-row-wins and it is not a constraint error; it is an ambiguous match that
> fails closed, and it would be genuinely hard to diagnose afterwards.
>
> **If your number appears on more than one patient record, fix the data — do not
> add another.**

- **Patient record used:** `_______________________`
- **Number as stored:** `_______________________`

## 0e. ARM THE CANARY — full click path **[R2d]**

> **WHY ARMING IS NOT AT THE VERY TOP.** Reaching the code screen at item 3
> triggers a send. Armed, item 3 would fire a **real SMS before the supervised
> canary** — an incidental send, which R9 does not authorise. **Items 1–3 run
> first on the OFF state**, and this is performed **at item 4**.

**THE FLAG LIVES ON THE API PROJECT, NOT THE PORTAL. [R2d]** `OTP_LIVE_SEND` is
read by `apps/api` (`lib/auth/otp-transport.ts:62`), which serves
**`api.osteojp.pt`**. Arming it on the portal or the staff project does
**nothing at all**.

1. **vercel.com** → your team → the project serving **`api.osteojp.pt`**.
   > **Expected:** the project overview with `api.osteojp.pt` under Domains.
   > **STOP if that domain is not there — wrong project.**
2. **Settings** → **Environment Variables**.
3. **`OTP_LIVE_SEND`** → **Edit**, or **Add New** if absent.
4. Value: exactly **`true`** — lowercase, no spaces, no quotes.
   > **STOP if you type `TRUE` or `1`.** The code tests the exact string `"true"`,
   > so anything else leaves it **silently off**.
5. Environment: **Production** only. **STOP if Preview or Development is ticked.**
6. **Save.**

**THE VALUE IS NOT LIVE UNTIL A REDEPLOY FINISHES.**

7. **Deployments** → most recent **Production** → **⋯** → **Redeploy**.
8. **Confirm:** that entry shows **Ready** with a green dot, timestamped **after**
   your save.
   > **STOP if Error or Canceled.** Do not proceed to item 12.

- **Armed at:** `__________`  **Redeploy Ready at:** `__________`

## 0f. The designated test patient — THE SAME ONE AS 0d **[4a] [6a]**

**Items 5–8 write a PERMANENT, UNREMOVABLE legal record.**
`patient_terms_acceptances` is append-only by ruling: no UPDATE policy, no DELETE
policy, grants revoked, `recorded_by` pinned to `auth.uid()`. A test acceptance
on a real patient would be a legal record attributed to **you**, on a person who
never accepted anything, and **nothing in the product can remove it**.

**[6a] This is the record from 0d.** One patient, named for what it is, carrying
your own mobile. It is the canary at items 12–14 and the terms subject at items
5–8. **Do not create a second one** — 0d explains why a second record on the same
number locks both out of the portal permanently.

- **Name:** something that reads as a test record and sorts out of the way —
  `ZZ Teste Aceitação`, or whatever you already named it. **The name is
  cosmetic; nothing in the code reads it.**
- **How chosen:** the repo has no designated test patient (checked: no seed row,
  no fixture). This names one.
- **Create it only if you have none:** Pacientes → Novo Paciente, the name, and
  **your own mobile in the 0d format**. Email optional.
- **Its id:** `_______________________`

> **[6b] THE NIF: NOT REQUIRED, AND "Ficha incompleta" IS NOT A DEFECT.**
>
> An earlier draft said to create it with "a NIF from the test range". **The
> record you have has no NIF and that is fine** — see 0i, which walks all four
> write paths this session touches and finds no NIF gate on any of them. The
> amber **"Ficha incompleta: falta o NIF."** banner is a `role="status"` notice on
> the patient profile (`app/patients/[id]/page.tsx:293-302`) and blocks nothing.
>
> **Two ways to clear it, both optional, neither before the session:**
>
> - **Set a NIF.** Editar → NIF → **`212345672`**. That is not an arbitrary
>   number: it is the repo's own canonical synthetic individual NIF
>   (`lib/patients/nif.test.ts:14`, `nifWithCheckDigit("21234567")`, asserted
>   valid at `:19-21`). A made-up nine digits will be **rejected** — `checkNif`
>   enforces a prefix rule and a mod-11 control digit (`lib/patients/nif.ts:69-97`),
>   and `999999990` is refused by name.
> - **Tick "Estrangeiro / sem NIF"**, which records the absence as a reasoned
>   decision. `isFichaIncomplete` is `(nif empty) && !nifExempt`
>   (`lib/patients/nif.ts:112-117`), so either clears the banner.
>
> **Recommended: leave it.** It costs nothing, and 0i is the record that it costs
> nothing.

> Creating a patient is reversible. **Recording an acceptance against one is
> not.**

> **[6a] THE TERMS FLOW CANNOT TELL THE DIFFERENCE — stated plainly, because the
> withdrawn 0d sentence implied it could.**
>
> **Nothing in items 5–8 reads phone, email or NIF.** Walked, not assumed:
> `recordTermsAcceptance` inserts `tenantId, patientId, acceptedAt, termsVersion,
> recordedBy` and nothing else (`lib/clinical/terms-acceptance.ts:125-138`);
> `getLatestTermsAcceptance` and `hasAcceptedTerms` filter on `patientId` alone
> (`:56-78`, `:90-108`); the checkbox takes `readOnly / checked / onChange /
> existing` and no patient fields at all
> (`app/clinical/[id]/SignatureConsent.tsx:379-389`); and the item-8 fee gate is
> `flagEnabled && patientHasAcceptedTerms`, a two-boolean function with no third
> input (`lib/reminders/fee-notice.ts:127-134`).
>
> **A patient with a phone and an email behaves identically to one with neither.**
> Items 5–8 are unaffected by the merge.

## 0g. The cleanup ledger **[4b]**

**Write each mutation down as you make it.** Reverted at item 24.

| From item | Mutation | Revert |
|---|---|---|
| 0d | Your patient record's phone reformatted | Harmless — the correct format is the one the product expects |
| 0f | A NIF or the sem-NIF tick, **if you chose to set one [6b]** | Harmless — leave it |
| **0h [6c]** | **Test therapist marked "Disponível para marcações"** | **Deactivate the therapist — item 24 covers it** |
| **0h [6c]** | **Test therapist added to a clinic (Localizações)** | **Same — deactivation supersedes it** |
| **0h [6c]** | **Test therapist's SATURDAY single-period day** | **Same — deactivation supersedes it** |
| 5–8 | A terms acceptance on the test patient | **NOT REVERTIBLE.** Append-only by design |
| 9–11 | The test therapist's Saturday **split shift** (0h's day, edited) | **Deactivate the test therapist** |
| 14 | **TWO portal booking requests (pedidos)** | Confirmed one becomes an appointment — **cancel it**; decline the other |
| 17 | An appointment created by confirming a pedido | **Cancel it** |
| 18 | A staff appointment booked over a pedido | **Cancel it** |
| 21–22 | **Your own** staff password changed | Keep the new one |
| 23 | **A live staff AUTH USER from the dashboard invite** **[R2b]** | **Supabase dashboard delete — item 24** |

**Item 9 uses a TEST THERAPIST, not a real one.** Rewriting a real therapist's
hours changes what reception can book for them.

> **[6c] ONE DEACTIVATION UNDOES ALL THREE 0h ROWS, and no separate revert is
> needed for any of them.** `setStaffActive` has no location, schedule or
> appointment guard — only owner-tier and last-owner checks, neither of which
> applies to a therapist (`lib/admin/staff.ts:278-308`). The `is_bookable` flag,
> the membership and the Saturday hours all stay on the row, and every surface
> that would show them filters on `is_active` first: the agenda's therapist source
> reads active users only (`lib/scheduling/data.ts:277`), and the portal's
> auto-assignment requires `u.is_active = true`
> (`apps/api/lib/appointments/store.ts:471`). **Deactivating is still the clean
> revert, exactly as item 24 already says.** Full reasoning in 0h.

- **Test therapist name/id:** `_______________________`

## 0h. CONFIGURE THE TEST THERAPIST — items 9, 11 and 14 all depend on it **[6c]**

> **WHY THIS EXISTS.** A staff row that is *Ativo* with the role *Terapeuta* is
> **not yet a bookable therapist**. As it stands — no clinic, no service, no
> schedule — **item 9 has no one-period day to use as its baseline, item 11 has
> nothing to evaluate, and item 14 may quietly assign the pedidos to the very
> therapist item 24 deactivates.** Each would fail for a setup reason and read on
> screen as a product defect.

### The minimum configuration, from the code

| Requirement | Needed for | Where it is enforced |
|---|---|---|
| **`is_bookable` = true** | **Appearing in the Terapeuta dropdown at all** | `lib/scheduling/data.ts:311` applies `filterBookableTherapists`, which is the flag and nothing else (`therapist-bookable.ts:34-36`). **It ships `DEFAULT false`** (`0046_users_is_bookable.sql`), and the backfill flipped only the 16 attested practitioners — a row created after that migration is **false** |
| **`is_active` = true** | Same | `data.ts:277` |
| **≥1 working-hours row** | **Item 11**, and the location derivation | `evaluateAvailability` returns `{configured:false, covered:true}` when there is no active template, so **an unconfigured therapist is never flagged** (`lib/scheduling/availability.ts:110-116`) |
| **A location on that row** | Appearing under a *specific* clinic; item 11's evaluation | Assignment is **derived** from `availability_templates` ∪ `staff_locations` (`therapist-locations.ts:57-97`). The item-11 read is keyed on the **pair** `(practitionerId, locationId)` (`conflict.ts:112-117`) |
| **A main service** | **NOTHING in this session** | See **[6c-service]** below |

> **THE AGENDA HAS NO THERAPIST COLUMN, so "will he render a column" is the wrong
> question.** The grid's axis is DAYS (`app/agenda/agenda-grid.tsx:96`); a
> therapist is chosen in the **toolbar dropdown**, and that dropdown is where an
> unconfigured therapist is absent. Under **"Todas as localizações"** an
> unassigned therapist *does* appear and is the only view in which they do
> (`therapist-location-filter.ts:41-55`) — but they will still be missing if the
> flag is false, because the flag is applied first.

> **[6c-service] NO SERVICE ASSIGNMENT IS REQUIRED, for item 9, 11 or anything
> else here.** Owner ruling PL-06a: the therapist→service mapping is a
> **PRESELECTION, never a RESTRICTION** — the Serviço select lists **all** active
> services for every therapist (`app/agenda/appointment-drawer.tsx:439-447` and
> `:492-498`). The mapping only supplies a default. **Leave "Serviço principal"
> empty.** It changes nothing you are checking, and setting it is one more thing
> to undo. This also settles the Fisioterapia question in item 14: the twelve
> patient-bookable services are a property of the **service** (`patient_bookable`),
> not of the therapist, so no mapping is needed there either.

### Click path

**Staff platform → `/admin/staff` → find the test therapist → Gerir.**

*(0h has no checklist numbers of its own — these are lettered so they can never be
confused with items 1, 2 and 3 of the checklist.)*

**a. Contacto tab → tick "Disponível para marcações" → Guardar.**
> **[6g] EVERY LABEL IN THIS STEP IS THE LITERAL ON-SCREEN pt-PT STRING, checked
> against the component rather than paraphrased.** **`Gerir`**
> (`admin.staff.manage`, `packages/i18n/src/strings.pt.json:570`) opens the modal;
> the tab is **`Contacto`** (`admin.staff.sectionContact`, `:572`, rendered at
> `StaffManageModal.tsx:118`); the checkbox sits at the bottom of that tab's form
> (`StaffManageModal.tsx:231` for the section, `:285-299` for the control) and its
> label is exactly **`Disponível para marcações`**
> (`admin.staff.isBookableLabel`, `strings.pt.json:551`, rendered at
> `StaffManageModal.tsx:294`); the button is **`Guardar`**
> (`admin.staff.save`, `strings.pt.json:542`).
>
> **The grey line under the checkbox reads:** *"Aparece na lista Terapeuta ao
> marcar. Independente da função e dos serviços atribuídos."* (`:552`). If you can
> see that sentence you are on the right control.
>
> **Expected:** the modal saves and the checkbox stays ticked when you reopen it.
> **This is the one step that cannot be skipped.** Without it the therapist is
> absent from every Terapeuta dropdown and items 9–11 have no subject.

**b. "Locais e cor" tab → under **Localizações**, tick ONE clinic → Guardar.**
> **[6g] THE TAB IS LABELLED "Locais e cor", NOT "Localizações".** An earlier
> draft of this step said "Localizações tab" and would have sent you looking for a
> tab that does not exist. `admin.staff.sectionLocations` is **"Locais e cor"**
> (`packages/i18n/src/strings.pt.json:579`, rendered at
> `StaffManageModal.tsx:120`). **"Localizações"** is the label of the checkbox
> group *inside* that tab (`admin.staff.cardLocations`, `strings.pt.json:576`,
> rendered at `StaffManageModal.tsx:398`). The tab also holds the agenda colour
> picker, which is what the "e cor" is.
>
> **Expected:** the clinic appears as a chip on the member's card.
> **Do this BEFORE step c, not after.** If your account is a *located* admin
> rather than the owner, saving hours for a therapist who is not at one of your
> clinics is refused with a **not-found** error
> (`lib/admin/schedule-scope.ts:40-57`) — and `not_found` is deliberately
> indistinguishable from a missing therapist, so the failure would tell you
> nothing. Membership first makes the order irrelevant.

**c. Horários tab → SATURDAY only → on, `10:00`–`13:00`, location = the clinic
from step b → Guardar → reopen.**
> **Expected:** Saturday comes back with **one** period, `10:00`–`13:00`. Every
> other day off.
> **This is item 9's baseline** — the "one-period day" it says should look exactly
> as it always has, plus the "+ Adicionar 2.º período" text button.

- **Bookable ticked at:** `__________`
- **Clinic assigned:** `_______________________`
- **Saturday hours saved at:** `__________`

### Why Saturday, specifically

**Because it keeps the test therapist out of item 14's way, and nothing else
does.**

> **THE PORTAL DOES NOT LET THE PATIENT CHOOSE A THERAPIST — see [6e] at item 14.**
> The API picks one automatically from whoever has **covering working hours at
> that location** for the window (`apps/api/lib/appointments/store.ts:462-479`),
> and the tie-break is **lowest full name** (`therapist.ts:39-46`). **The
> `is_bookable` flag is not part of that query.** So a test therapist with hours
> is a genuine candidate for a real patient booking, and a short name makes them a
> likely one.
>
> **THE ISOLATION COMES FROM THE DAY, AND IT HOLDS WHATEVER YOUR ROSTER LOOKS
> LIKE.** The candidate query requires covering hours **on that weekday**. Put the
> test therapist on Saturday and they are simply not in the candidate set for any
> Monday-to-Friday window — no matter who else works, no matter what their names
> sort like, and no matter what the flag says. **Item 14 books Monday to Friday and
> the problem does not arise.** Nothing here rests on a guess about the real
> schedule; it rests on the weekday predicate.
>
> **Any unused weekday would work. Saturday is chosen because it is the one you
> are least likely to book by accident** while doing everything else in this
> session, and because if the portal offers you a Saturday slot at item 14 that is
> a legible signal — it means the test therapist is the only one covering it, so
> skip it.
>
> Saturday is a real weekday in the schedule editor (`WEEKDAY_ORDER = [1,2,3,4,5,6,0]`,
> `app/admin/staff/page.tsx:45`), and nothing in the staff booking path treats it
> differently — `createAppointment` validates the interval and the ids, never the
> day of week (`lib/scheduling/actions.ts:304-333`).
>
> **If Saturday is a working day at your clinic**, use **Sunday** instead and read
> "Saturday" as "Sunday" everywhere below. Items 9–11 are unaffected either way:
> the availability panel is scoped to the therapist you selected, so a colleague
> working the same day cannot contaminate the reading.

> **⏱ THE DROPDOWN CAN LAG UP TO 60 SECONDS. Do not report this as a defect.**
> The agenda's therapist/location/service reference data is cached for 60s
> (`lib/scheduling/data.ts:317-318` and `:334-336`), and **no staff action
> invalidates that tag** — the only `updateTag("agenda-reference-data")` call in
> the repo is in `app/admin/services/actions.ts:76`. So after steps a–c the
> therapist may not appear in the agenda dropdown immediately. **Wait a minute and
> reload.** The availability panel itself is not cached and is always current.

## 0i. THE INCOMPLETE FICHA BLOCKS NOTHING — read this once, then ignore the banner **[6b]**

**The "Ficha incompleta: falta o NIF." banner will be on screen for the whole
session. It is not a defect and it stops nothing.** All four write paths this
session exercises were walked, not inferred:

| Step | Path | Does a missing NIF block it? |
|---|---|---|
| **Item 14** — portal booking | `bookAppointment`, `apps/api/lib/appointments/booking.ts:335-376` | **No.** It validates the slot is future, resolves the service and location, picks a therapist and writes. **It never reads the patient row** — the patient is a verified `PatientPrincipal` carrying ids only |
| **Item 17** — reception confirms | `confirmAppointmentRequest`, `apps/web/lib/scheduling/actions.ts:1021-1101` | **No.** The query joins `appointments` to `staff_notifications` and **touches the patients table not at all** |
| **Item 18** — staff booking | `createAppointment`, `apps/web/lib/scheduling/actions.ts:304-333` | **No.** Validation is presence of `patientId`, `practitionerId`, `locationId`, plus a valid interval. The only patients read in the whole function is an existence check on an **optional second** patient (`:396-403`) |
| Anywhere else in items 1–25 | — | **No.** `isFichaIncomplete` has exactly two consumers, both on the patient profile: the banner (`app/patients/[id]/page.tsx:293`) and the document-issue notice (`:476`). **Neither is on this checklist** |

**The one thing a missing NIF does block is issuing a fiscal document**
(`patients.nifRequiredForDocument`). **No item in this session issues one.**

> **So: do not stop, do not fix it mid-session, and do not report it.** If you
> want it gone, 0f names the two ways and recommends neither.

---

# THE CHECKLIST

> **[3a] WHY THIS ORDER.** The earlier draft consumed a pedido that nothing in
> the session created — the only producer is a patient booking through the
> portal, which sat *after* the items that needed it. **PG2 and half of PG4 would
> both have failed on ordering alone.** So: the OFF-state checks run first, arming
> follows, the redeploy window is filled with the two blocks that need neither a
> pedido nor the portal, and **the patient logs in and creates the bookings
> before reception ever looks for one.**

## 1. Portal login screens — PG1, first half

**These run with `OTP_LIVE_SEND` still OFF, and they run FIRST for that reason.**
**[4c]**

**1.** Open the portal. **Expected:** "Entrar com o seu telemóvel" and a **single
phone field**.
> **Failure signal:** any email field, password field, or "Recuperar acesso" link.

**2.** Visit **`/auth/reset-password`**, then **`/auth/activate`**. **Expected:**
**both REDIRECT you to `/auth/login`.** You land back on the phone screen.
> **Failure signal:** either renders a form — a live session-minting entry point.
>
> **[7a] CORRECTED 2026-08-09, from the owner's observation and confirmed in the
> code.** This said "the portal's not-found page for both". It is a **redirect**,
> and the mechanism is worth knowing because it is the stronger outcome, not a
> weaker one: **the pages were deleted**, and `PUBLIC_PATHS` in
> `apps/portal/proxy.ts:35` is `['/auth/login', '/portal/clinics']` — nothing
> else. A visitor with no session on any other path hits
> `NextResponse.redirect(new URL('/auth/login', ...))` at `proxy.ts:45`, **before
> Next ever gets to render a 404**.
>
> **Same security outcome, reached earlier.** There is no route, no form and no
> session-minting entry point either way; the proxy simply turns you around at the
> edge instead of serving a not-found page. Both readings pass this item.
>
> *(With a session already established the proxy falls through and Next 404s,
> since no page file exists. Items 1–3 run before any login, so expect the
> redirect.)*

### THE RATE LIMITS, BEFORE YOU TOUCH ANYTHING **[1a]**

**Read this first. It constrains what you can safely do, and it is keyed on BOTH
your IP and the phone number.** From the code, not from memory:

| Limit | Key | Threshold | Where |
|---|---|---|---|
| OTP **request** | your **IP** | **3 per hour** | `limiter.ts:184`, applied `request/route.ts:36` |
| OTP **request** | the **phone** (hashed) | **3 per hour** | `limiter.ts:184`, applied `request/route.ts:64` |
| OTP **verify** | your **IP** | **10 per hour** | `limiter.ts:194` |
| Wrong codes | the **code row** | **5 attempts** | per-code cap, on the row itself |

**BOTH keys apply to a request — it must pass the IP check AND the phone check.**

**The binding one is your IP: three OTP requests per hour, total, whatever number
you use.** This session needs **two** of them — item 3 and item 12 — leaving
exactly **one** spare for a retry. Plan on that. If you burn all three, item 12
becomes not-runnable for up to an hour.

**It clears on its own.** The store is a fixed window on the database clock
(`durable-store.ts:59-65`): the counter resets the first time it is touched after
`reset_at`, which is at most **60 minutes** after the first request in that
window. **There is nothing to clear manually and no lockout to lift** — the only
manual option would be deleting a row from `rate_limit_counters` in production,
which is not worth doing and is not offered here. **Wait it out.**

**3.** Request a code — **using a phone number that is NOT your canary number and
has NO patient record** — reach the code screen, and enter **six wrong digits**.

> **[1b] WHY A DIFFERENT NUMBER.** The request limit is keyed on the phone as
> well as the IP. Using your own number here would spend one of the canary
> number's three, on top of the IP budget you are already spending. A number with
> no patient record is ideal: the request still succeeds and still shows you the
> code screen (that endpoint **never** queries the patient table — that is what
> makes it non-enumerable), so this costs you nothing you need later.
>
> **[5] USE A NUMBER THAT CANNOT BELONG TO A REAL SUBSCRIBER: `+351900000000`.**
> Our validator is `/^[29]\d{8}$/` (`phone.ts:19`) and deliberately does NOT
> enforce prefix assignment — its own comment says that is the carrier's call. So
> `900000000` passes and you reach the code screen, while **`90` is not an
> assigned Portuguese mobile block** (mobiles are 91/92/93/96), so no handset can
> receive it. The flag is off at item 3 so nothing sends today, but this document
> should stay safe if anyone ever runs it out of order.
>
> **This is one verify attempt, not six.** "Six wrong digits" means one wrong
> six-digit code — 1 of your 10 verify attempts.

**Expected:** one red banner, "Não foi possível entrar…".
> **Failure signal:** the message names *which* failure occurred. That is an
> enumeration oracle.

**Then, while you are on this screen [2]:** check the help text below the card.
**Expected:** "Não recebeu o código?" and three lines — no mobile on record, a
landline, a shared number — **each ending in "Contacte a clínica"**.
> **Failure signal:** any line offering a self-service route. Fail-closed linkage
> means the clinic is the only path.
>
> **[Job 2] THIS OBSERVATION MOVED HERE, from what used to be item 14.** It sat
> after the successful login, which had already taken you to the dashboard — so
> seeing it again would have meant signing out and requesting **another** code,
> burning an SMS and one of only three hourly requests. Here it is free: the
> screen is already open and the flag is still off.

**4. NOW perform the arming click path in 0e.** Then carry straight on to item 5
while the redeploy runs.

## 2. Terms flow — TEST PATIENT ONLY **[4a]**, closes NO gate

> **[3a] This block fills the redeploy window: it needs neither a pedido nor the
> portal.** **Admin or therapist** (reception has no clinical read).
>
> **[4a] Use the test patient from 0f.** **[6a] That is the SAME record as 0d** —
> the one carrying your mobile. It having a phone and an email changes nothing
> here; 0f walks the code that proves it. **[2b]** Closes the W13-05 **card**, not
> a gate. PG5 passed 2026-08-03.
>
> **[6b] Ignore the "Ficha incompleta" banner.** 0i.

**5.** Open the test patient's ficha clínica, scroll to the bottom.
**Expected:** below "Consinto", an **"Aceitação das condições"** block reading
**"Sem aceitação registada para este paciente."**, checkbox **unticked**.
> **Failure signal:** block missing, or checkbox already ticked.

**6.** Tick it, press **Gravar**. **Expected:** reloads showing "Aceitação
registada em `<date>` (2026-08)", **checkbox unticked again**.
> **Failure signal:** no acceptance line (nothing recorded), or the checkbox stays
> ticked (a second Gravar would silently record a second acceptance).

**7.** Reopen the ficha. **Expected:** still unticked, acceptance still shown.
> **Failure signal:** it comes back **ticked** — a staff member would be attesting
> by not noticing a checkbox.

**8. Expected: no fee text anywhere.**
> **Failure signal:** any mention of 50% or "nos termos aceites na marcacao". It
> cannot happen — copy is `approved: false` and the flag is off — so if you see
> it, **two independent gates have failed**. Stop-the-session.

## 3. Split-shift — TEST THERAPIST **[4b]**, closes NO gate

> **[3a] Also fills the redeploy window.**
>
> **[6c] 0h MUST BE DONE FIRST.** These three items operate on the **Saturday
> `10:00`–`13:00`** day 0h created. Without it there is no one-period day to
> compare against at item 9 and nothing configured to evaluate at item 11.

**9.** **`/admin/staff`** → **Gerir** on the **test therapist** → **Horários**.
**Expected:** **Saturday** shows the single `10:00`–`13:00` period from 0h,
looking exactly as a one-period day always has, plus a small **"+ Adicionar 2.º
período"** text button. Every other day off.
> **Failure signal:** existing single-period days render differently.
> **Not a failure:** an empty week — that means 0h step c did not save. Go back
> and do it; this item has no baseline without it.

**10.** On **Saturday**, add the second period. Set the first to **08:00–13:00**
and the second to **14:00–19:00**, **Guardar**, **reopen**.
**Expected:** both periods came back.
> **Failure signal:** only one survives.

**11. Open the NEW-APPOINTMENT DRAWER, not the agenda grid. [6d]** On the agenda,
pick the test therapist, then **Nova marcação** with **date = the next Saturday**
and **Localização = the clinic from 0h**. Read the **"Disponibilidade"** panel.

**Expected, exactly two things on screen:**

1. Under **`Horário:`** — **`08:00-13:00, 14:00-19:00`**. **Two windows, comma
   separated.** That string is built by `joinIntervals`, which renders one range
   per working window and joins them with a comma
   (`app/agenda/availability-panel.tsx:144-149`). **Two ranges means the split
   shift survived the round trip.**
2. Under **`Horários livres`** — the chips of free start times. **No chip reads
   `13:00`, and none reads `13:30`.** The gap is not free time, so no start inside
   it is offered (`:156-169`).

### THE FAILURE SIGNALS FOR ITEM 11 **[6d]**

**A bookable gap is NOT one of them. Here is the full list, and what each means:**

| What you see | Verdict | Why |
|---|---|---|
| `Horário: 08:00-19:00`, one continuous range | **FAIL** | The two periods were merged or the second was archived. Item 10 saved, item 11 proves it did not survive as two |
| `Horário: 08:00-13:00` only, second window absent | **FAIL** | The second period was dropped on save or on load. This is the W13-A defect the split-shift work exists to prevent |
| A free-slot chip reading **`13:00`** or **`13:30`** | **FAIL** | The gap is being offered as working time. `day.free` is derived from `day.working`, so a chip inside the gap means the gap is inside a working window |
| Two correct windows, **no chip in the gap** | **PASS** | Both halves of the check |
| *"O terapeuta não tem horário de trabalho definido neste dia."* | **NOT A FAIL. SETUP.** | `day.working.length === 0` (`:105-110`). The **Localização in the drawer does not match the one the hours were saved under** — the read is keyed on the `(therapist, location)` pair (`conflict.ts:112-117`). Fix the location and re-read |
| **You can book into 13:00–14:00 and it saves** | **NOT A FAIL. RULED.** | See below |

> **[6d] WHY "THE GAP IS BOOKABLE" IS NOT A FAILURE, and why the earlier draft
> naming it as one would have cost you a false defect report.**
>
> Owner ruling **PL-11, 2026-07-30**: *"availability warning is advisory, never a
> hard block."* `ADVISORY_CONFLICT_KINDS` contains `availability`, and
> `blockingConflicts` strips it before anything can refuse a save
> (`lib/scheduling/conflict-core.ts:5-19`). **Reception is deliberately allowed to
> book a patient outside a therapist's declared hours** — the clinic must be able
> to fit someone in, and a schedule is a statement of intent, not a lock.
>
> **So item 11 checks what the panel SHOWS, never what the form REFUSES.** The
> thing under test is whether the recon reads two windows out of one weekday and
> withholds the gap from the free list. **If you want to try booking 13:15 to see
> what happens: it will save, that is correct, and it is not part of this item.**
>
> **This tests the recon, not the screen. It can fail while 9 and 10 both pass** —
> the editor can round-trip two periods correctly while the availability read
> still collapses them.

> **[6d] TWO CORRECTIONS TO THIS ITEM, because as written it named the wrong
> surface and then called a correct behaviour a failure.**
>
> **The surface.** The agenda **grid has no therapist axis** — its columns are
> days (`app/agenda/agenda-grid.tsx:96`). Working hours are rendered by the
> **Disponibilidade panel inside the appointment drawer**
> (`app/agenda/appointment-drawer.tsx:999-1006`), and nowhere else. "Open the
> agenda for that therapist" had no screen to land on.
>
> **"The gap is bookable" is NOT a failure. It is the owner's own ruling.**
> PL-11, 2026-07-30: *"availability warning is advisory, never a hard block."*
> `ADVISORY_CONFLICT_KINDS` contains `availability`, and `blockingConflicts` drops
> it before anything can refuse a save
> (`lib/scheduling/conflict-core.ts:5-19`). **Booking into 13:00–14:00 will
> succeed, deliberately, and reception is allowed to do it.** Had the old wording
> stood, the correct behaviour would have been reported as a defect. **What is
> being checked is whether the panel SHOWS two windows and withholds the gap from
> the free-slot list** — that is the whole of item 11.

## 4. OTP login AND the pedidos — PG1 second half, and the producer for §5 **[3a]**

By now the 0e redeploy has had items 5–11 to land. **Confirm it shows Ready
before starting.**

**12.** On a **real handset**, request a code from the portal, using the number
you confirmed in **0d**. **Expected:** one SMS, one code.
> **Failure signal:** no SMS within a minute. **First check the 0e redeploy shows
> Ready and post-dates the save** — the single most likely cause, and not a code
> fault. Second, re-read 0d: a wrong stored format refuses **silently**. Also
> failing: **more than one** SMS for one request.

**13.** Enter it. **Expected:** you reach the portal dashboard.
> **Failure signal:** a valid code is rejected, or the screen loops.

**14. CREATE TWO BOOKING REQUESTS. This is the step everything in §5 consumes.
[3a]**

Still logged in as the patient, book **twice**, at **two different times on the
same day**, and **that day must be a MONDAY-to-FRIDAY date. [6e]**

> **[6e] YOU DO NOT CHOOSE THE THERAPIST. THE PORTAL DOES, AND IT NEVER ASKS.**
> An earlier draft said to use "a real therapist, not the test therapist", and
> "the same therapist for both if the portal lets you choose". **Neither is
> actionable: there is no therapist step in the patient booking flow.** The API
> assigns one server-side after the slot is picked — it lists whoever has covering
> working hours at that location and is free
> (`apps/api/lib/appointments/store.ts:462-479`), then takes the patient's prior
> therapist if available and otherwise **the lowest full name**
> (`apps/api/lib/appointments/therapist.ts:27-47`).
>
> **The old instruction's GOAL was right and its method was impossible.** The goal
> is to keep these two appointments off the test therapist, because item 24
> deactivates them: deactivation does not cascade, the row keeps its
> `practitioner_id`, and the agenda's therapist views are built from ACTIVE
> availability — so the appointment survives while the column stops being offered,
> which makes it fiddly to find and cancel.
>
> **The method that actually works is the DAY, not a dropdown.** The candidate
> query requires covering hours **on that weekday at that location**. 0h puts the
> test therapist on **Saturday and nothing else**, so on any Monday-to-Friday date
> they are **not in the candidate set at all** and cannot be assigned. Note the
> flag does not help you here: **`is_bookable` is absent from that query**, so an
> unticked box would not have kept them out either.
>
> **Concretely: book Monday to Friday and skip any Saturday slot the portal
> offers.** A Saturday slot appearing at all is a sign the test therapist is the
> only one covering it.
>
> **Item 24 still cancels appointments BEFORE it deactivates anything** — the
> checklist is in that order deliberately, and remains the backstop if a booking
> lands somewhere unexpected.

> **BOTH TIMES MUST BE ON THE SAME MONDAY-TO-FRIDAY DAY. [6e]** A and B are two
> different times on **one** date, and that date is **not a Saturday** (nor a
> Sunday if 0h used Sunday). The test therapist covers only that one weekday, so
> any other day puts them out of the candidate set entirely and a real therapist
> takes both pedidos. **Two times on one weekday is also what item 18 needs** —
> the double-booking check compares one therapist's day.

> **[6e] IF THE PORTAL OFFERS NO MONDAY-TO-FRIDAY SLOTS AT ALL — the branch,
> written before you hit it.**
>
> **What you will see:** step 3 of the booking flow, under the date picker,
> *"Sem horários disponíveis neste dia."*
> (`booking.no_slots_day`, `packages/i18n/src/portal/strings.pt.json:140`, rendered
> at `apps/portal/app/portal/booking/BookingFlow.tsx:268`). **That is not an
> error and not a defect** — the open-slot list is generated from availability
> templates (`apps/api/lib/appointments/booking.ts:288-317`), so an empty day means
> nobody has covering hours at that location that day.
>
> **FIRST, try the other four weekdays and the second week.** The horizon is
> **14 days** (`OPEN_SLOTS_HORIZON_DAYS = 14`, `booking.ts:286`), so you have ten
> working days to find one with slots. Also try **the other location** if the
> clinic has two. This is the likeliest fix and it costs nothing.
>
> **IF EVERY WEEKDAY IN THE HORIZON IS EMPTY, take the Saturday slot. Do not fix
> the data.**
>
> - **Do NOT give a real therapist working hours to make slots appear.** That
>   rewrites a live schedule and changes what reception can book for that person
>   for the rest of the week. It is the one mutation this session has no ledger
>   entry for and no clean revert.
> - **Do NOT add a second weekday to the test therapist.** That is the collision
>   this whole arrangement exists to avoid, reintroduced by hand.
> - **Book the Saturday slot and write down that the test therapist got it.**
>   **Nothing downstream breaks.** Items 16, 17 and 18 do not care who the
>   therapist is: the notification centre lists the pedido either way, the confirm
>   path reads `practitionerId` off the pedido row itself
>   (`lib/scheduling/actions.ts:1073`), and item 18's conflict is the same
>   therapist-overlap check whoever it names. **Item 24 already cancels both
>   appointments BEFORE deactivating the therapist**, which is exactly the order
>   this case needs.
>
> **What an empty weekday actually tells you, and it is worth recording:** the
> portal cannot offer a patient anything on a day no one has declared hours for.
> If that is most weekdays on production, **the roster's working hours are
> incomplete** and the portal will look empty to real patients at launch. **Report
> it as an observation on item 14 even when you found a slot elsewhere.** It is
> not a session failure; it is a data-entry finding, and PL-14's own note already
> records that only 5 of 11 members held hours.

- **Which service:** **Fisioterapia**. Any of the twelve patient-bookable
  services works; **only those twelve appear**, out of twenty in the catalog
  (JP's ruling, `w13-04-set-patient-bookable.mjs`). If you see the 1.ª consulta,
  Pilates Aula Experimental, NESA or R.P.G. offered, **that is a failure** — those
  four were ruled off.
- **Note both times:** A `__________`  B `__________`

> **Expected:** each booking confirms with a screen saying the request was
> **sent** and awaits the clinic — wording to the effect of a *pedido*, **not** a
> confirmed appointment.
>
> **Failure signal:** the portal says the appointment is **confirmed**. JP's
> ruling is **zero auto-confirmed** — a portal booking is a request until
> reception acts. A confirmed-sounding screen here is a stop-the-session finding.

**15.** Sign out from the account screen, then reopen the portal. **Expected:** the
phone screen.
> **Failure signal:** automatic re-entry — sign-out did not clear the session
> cookie.

*Closes: **PG1 (AUTH)** together with items 1–3.*

## 5. Reception confirm surface — PG2

Back on the **staff platform**, as reception or admin. **Both pedidos from item
14 are waiting.**

**16.** Open the **notification centre** (the bell, top right). **Expected:** it
opens `/notificações`, **and both requests from item 14 are listed**.
> **Failure signal:** it lands on `/perfil` (the original defect), or the requests
> are absent (the emit failed — note it, that is `LE-pedido-emit-best-effort`).

**17.** Open **pedido A** and press **Confirmar**. **Expected:** it confirms, and
the appointment appears on the agenda at time A.
> **Failure signal:** confirms but the agenda does not show it.

**18. The most important behavioural check in the session.** Take **pedido B**.
*First* book a staff appointment over **the therapist the server assigned to
pedido B** at **time B**, from the agenda.

> **[6h] FIND OUT WHO THAT THERAPIST IS FIRST. THE PEDIDO ROW DOES NOT SAY.**
> This is a real gap in the surface, not a step you missed. The queue row carries
> **the patient name, the appointment time and when the request was made, and
> nothing else** — `PendingRequestView` is
> `{notificationId, appointmentId, patientName, when, requestedAt}`
> (`app/notificacoes/pending-requests.tsx:26-33`, rendered at `:120-131`). **No
> therapist name anywhere on it.**
>
> **WHY IT MATTERS AND WHY GUESSING BREAKS THE ITEM.** The conflict is a
> **therapist-overlap** check: `confirmAppointmentRequest` reads
> `pedido.practitionerId` off the pedido row and asks whether anything else
> occupies **that therapist's** window (`lib/scheduling/actions.ts:1072-1079`,
> into `findConflictsForWindow` at `conflict.ts:187-207`). **Book a DIFFERENT
> therapist at time B and there is no conflict at all** — the confirm will
> succeed, and you would record a stop-the-session double-booking finding for an
> appointment that never overlapped anything. **Half two would report a defect that
> does not exist.**
>
> **WHERE TO READ IT — two surfaces, use the first:**
>
> 1. **`/marcacoes`.** Set the date filter to **pedido B's day**, find the row for
>    your test patient at time B. The row prints the **therapist name**
>    (`app/marcacoes/marcacoes-view.tsx:236`) and, next to it, **`Criado por:
>    Reserva online (portal)`** (`:240-242`, `appointment.createdByPortal`,
>    `strings.pt.json:294`) — which is how you tell a portal pedido from a staff
>    booking at a glance.
>    > **The "Abrir na agenda" link on the pedido row does NOT jump to it.** It
>    > points at `/marcacoes?appointment=<id>` (`pending-requests.tsx:152`), and
>    > **that page never reads an `appointment` param** — it reads `from`, `to`,
>    > `therapist`, `location`, `status`, `service` (`app/marcacoes/page.tsx:81-108`)
>    > and defaults to the **current Monday-to-Friday week** (`:78-83`). So the link
>    > opens the list but does not filter to your row, and if pedido B is next week
>    > it will not be on screen at all. **Set the dates by hand.**
> 2. **The agenda**, on pedido B's date. A pedido renders before confirmation —
>    nothing filters it out — carrying the **`Confirmação pendente`** clock marker
>    (`app/agenda/confirmation-indicator.tsx:19-29`,
>    `appointment.confirmationPending`, `strings.pt.json:289`). Open it and the
>    drawer names the Terapeuta.
>
> - **Therapist assigned to pedido B:** `_______________________`
>
> **Then book the staff appointment against THAT name.**

- **Half one: the staff booking SAVES with no conflict warning.** That is
  migration 0059 — an unconfirmed pedido no longer holds the slot.
- Now try to **Confirmar pedido B**. **Half two: it refuses with a conflict, and
  nothing is written.**

> **Failure signal:** *either* half alone. Blocked booking = 0059 did not take
> effect. Successful confirm = **you just created a double booking**, a
> **stop-the-session finding**.
>
> **Before reporting half two as a failure, check the therapist matched.** A
> successful confirm against the **wrong** therapist is not a double booking and
> not a defect; it is this item run on two different people. Re-read the name
> above and repeat.

*Closes: **PG2 (BOOKING)**, and the behavioural evidence for W13-04a.*

## 6. The suppression log — LE-suppression-observation **[1]**, closes NO gate

> **This card has been open for the life of the project with nothing observed,
> and item 18 has just created the conditions for free.** The suppression path is
> what stands between an unarmed deployment and a message reaching a patient, and
> it has never been seen running.
>
> **[1] A CORRECTION TO THE PREMISE, because it changes which item you watch.**
> Confirming pedido A at item 17 does **not** schedule anything —
> `confirmAppointmentRequest` updates the status, writes an audit row and
> revalidates, and never calls `enqueueRemindersAfterCommit`. **Only item 18's
> staff booking enqueues** (`actions.ts:523` → `scheduling/reminders.ts:78`). So
> this observation hangs off **item 18**, not item 17.

**19.** Open the **staff platform's** function logs and find the suppression
entry for the appointment you created at item 18.

**What you are looking for — TWO lines, not one [7d]** —
`packages/notify/src/gate.ts:76-78`, emitted via `logger.info`:

```
[notify] suppressed template=confirmation.email channel=email appointment=<uuid> reason=live_send_disabled
[notify] suppressed template=confirmation.sms   channel=sms   appointment=<uuid> reason=live_send_disabled
```

> **[7d] CORRECTED 2026-08-09. The expected string named the email template
> only.** `appointment/scheduled` triggers **two** registered confirmation
> templates, not one: `confirmation.email` (email) and `confirmation.sms` (sms),
> `apps/web/lib/reminders/notification-registry.ts:118-119`. Both hit the same
> gate, so both suppress. **Seeing the SMS line is a PASS, not an anomaly** — and
> under the old text a reader could have reported it as one.
>
> **ONE line is enough to close the item.** The check is that the gate ran and
> named a reason, not that both channels appeared; a single
> `reason=live_send_disabled` line proves the suppression path executed.
>
> **THE 48h/24h REMINDER LINES WILL NOT APPEAR TODAY, and waiting for them is the
> trap this note removes.** The two reminder offsets are `48h email` and
> `24h sms` (`apps/web/lib/reminders/offsets.ts:31-34`), and their function
> **sleeps until the send instant** before dispatching
> (`step.sleepUntil`, `inngest/functions.ts:110`). For a booking more than 48
> hours out that is days away. **Only the two confirmation lines are in scope for
> item 19.**

**Which project, and why that one [1b].** The **staff platform** project
(`apps/web`, **`app.osteojp.pt`**). The dispatcher runs inside Inngest functions
defined in `apps/web/lib/reminders/inngest/functions.ts` and served from
`apps/web/app/api/inngest/route.ts`, through the notifier in
`apps/web/lib/reminders/clients.ts`. **Not the API project** — `apps/api`'s
booking path sends nothing at all (zero notify calls under
`apps/api/lib/appointments/`), which is why item 14's portal bookings produce no
entry.

**Click path [1c]:**

1. **vercel.com** → the project serving **`app.osteojp.pt`**.
   > **STOP if you are in the `api.osteojp.pt` project** — that is where the flag
   > lives, but not where this logs.
2. **Logs** (or **Observability → Logs**).
3. Search / filter for: **`[notify] suppressed`**
4. Time window: **last 30 minutes**, or since you did item 18.

**Expected:** at least one line, `reason=live_send_disabled`, carrying the
appointment id from item 18. **Template ids and channels only — no recipient, no
subject, no body.** That absence is itself the check: rule 7.

**Timing [1e].** The confirmation fires **immediately** on `appointment/scheduled`
(`functions.ts:124`), but Inngest delivery is asynchronous — allow **a couple of
minutes**. **If nothing is there yet, carry straight on to item 20 and re-check
when you reach item 21.** The log entry does not expire, and the wait is already
spent by then.

**Failure signal [1d] — and NO ENTRY means one of three different defects.
Discriminate before reporting, because they have different fixes:**

| What you also see | What it means |
|---|---|
| A line reading **`scheduling: reminder enqueue failed`** | **NEVER SCHEDULED.** The Inngest send threw and was swallowed deliberately (`reminders.ts:85-88`) so a network blip cannot fail a booking. The appointment is fine; the reminder was never queued |
| No such line, and **no message arrived on EITHER channel [7d]** | **SCHEDULED, RUN NOT OBSERVED.** The event was sent but the confirmation run has not executed or has not logged. Check the Inngest dashboard for the run before concluding anything |
| **A message actually arrived — an email at the patient address, OR an SMS on the handset [7d]** | **SENT. STOP THE SESSION.** `REMINDERS_LIVE_SEND` is armed when it must not be. This is the one outcome the suppression path exists to prevent. **Check the phone as well as the inbox:** two templates fire and the old wording asked about only one, so an SMS could have arrived while the inbox looked clean |

> **A missing entry is NOT automatically a failure of this item** — it is a
> question about which of the three above you are in. Report which, not "no log".

*Closes: **LE-suppression-observation**. No gate.*

## 7. Notification centre, populated — PG4's second half

**20.** Reopen **`/notificações`**. **Expected:** entries for the item-14 requests
and the item-18 confirmation, visible to **reception and the assigned
therapist**, carrying **no service name and no clinical content**.
> **Failure signal:** any entry carrying a service name or clinical detail — a
> payload-minimisation breach, not a cosmetic issue.

*Closes: **PG4 (NOTIFICATIONS)** fully. The empty state passed 2026-08-05.*

## 8. The recovery link — READ it now **[2d]**

The clock started at **0c** and has had the whole session.

**21. CHECK THE LINK BEFORE YOU CLICK IT.** Hover the "Definir nova
palavra-passe" button, or copy the visible fallback address. It must read:

```
https://app.osteojp.pt/auth/update-password?token_hash=<long-string>&type=recovery
```

> **Failure signal [2d]:** the address contains **`supabase.co/auth/v1/verify`**,
> or **`token=`** without `_hash`. **That is the OLD template** — the paste did
> not take. **Stop, re-paste, trigger a new recovery.** Clicking an old-template
> link proves nothing and burns the token.
>
> Also failing: an empty `?token_hash=`, or a host other than `app.osteojp.pt`.

**22.** Only once 21 reads correctly, **open the link**. **Expected: the
set-password form renders.** Set a password and sign in.
> **Failure signal:** "Ligação inválida" or "Ligação expirada". Open **"Detalhes
> técnicos"** and paste that block.
>
> **[3d] WHAT THIS DOES TO YOUR STAFF SESSION — do it in the SAME browser.**
> Setting the password establishes a **new session in whichever browser opened
> the link** (`verifyOtp` then `updateUser`). Use the browser you have been
> working in and you are signed in as yourself, with the new password, and can
> continue straight to item 23.
>
> Whether your session in *another* browser survives is a Supabase project
> setting **that is not in this repo** — `supabase/config.toml` is the local dev
> file (`secure_password_change = false` there governs re-authentication, not
> revocation), and production is dashboard-configured. **So it is not asserted
> here.** The instruction is correct either way: **same browser**, and if any
> staff tab shows you signed out, sign in again with the new password before item
> 24.

*Closes: the **LE-auth-recovery-deadend** card. No gate.*

## 9. Staff invite — ONE half runs, ONE is deferred **[4d]**

> **[4d] Dashboard "Invite user" → RUNNABLE. It BYPASSES the flag.** Supabase
> sends it over its own SMTP using the `invite.html` you pasted; our transport is
> not involved. Proof: our code never calls `inviteUserByEmail` — zero hits, the
> only match being a test asserting we do not.
>
> **In-product invite screen → CANNOT RUN. It IS gated** at
> `lib/invites/email.ts:33` on `INVITES_LIVE_SEND`, which **R9 keeps off until
> launch day**. It would be **suppressed, not sent**.

**23.** **Click path [R2d]:**

1. **supabase.com** → the **`dfotoodqvmjhbdcxyaxf`** project.
   > **STOP if the ref differs** — `jaxmkwoxjcgzkwxgbayx` is the retired old prod.
2. **Authentication** → **Users**. **Before inviting, search the list for the
   address you intend to use.**
   > **[3] THE ADDRESS MUST HAVE NO EXISTING SUPABASE AUTH USER.** "A real inbox
   > you control" is not enough: **if it is the address your own staff account
   > uses, Supabase refuses the invite as already registered** and this item is
   > lost for the sitting. Your staff account IS a Supabase auth user.
   >
   > **Use a plus-address of your own inbox** — `yourname+invite1@gmail.com`.
   > Gmail delivers it to your normal inbox, and Supabase stores an email as
   > given with uniqueness on the **full address**, so it is a distinct user from
   > `yourname@gmail.com`.
   >
   > **This is not asserted blind — step 3 VERIFIES it**, so you do not have to
   > take the plus-addressing behaviour on trust. If Supabase had collapsed the
   > address onto your existing account, **no new row appears** and you see the
   > refusal immediately, before spending any time on the link. If that happens,
   > use a genuinely different mailbox instead.
3. **Invite user** → the address → **Send invite**.
   > **Expected:** a **NEW row** in Users, showing **exactly the address you
   > typed**, state **Waiting for verification**.
   > **Failure signal:** "already registered", or no new row — the address is
   > taken. Pick another and repeat; nothing has been consumed.
   > **[R2b] A NEW ROW MEANS A LIVE AUTH USER EXISTS. Add it to the 0g ledger
   > now.**
4. **Wait a few minutes**, then check the link. It must read, in full:
   ```
   https://app.osteojp.pt/auth/update-password?token_hash=<long-string>&type=invite
   ```
   > **[7c] `type=invite`, NOT `type=recovery`. CORRECTED 2026-08-09.** This step
   > said "apply the same link check as item 21", and item 21 is written against
   > **`&type=recovery`** — so following it literally would have failed a
   > correct invite link on the one component that is *supposed* to differ.
   >
   > **What IS shared with item 21, and is the part that matters:** the host must
   > be **`app.osteojp.pt`**, the parameter must be **`token_hash=`** and not a
   > bare `token=`, the value must be non-empty, and the address must **not**
   > contain `supabase.co/auth/v1/verify`. Any of those four is the old template
   > and the paste did not take.
5. Open it, set a password, **sign in**.

> **[3c] WHAT YOU WILL SEE AFTER SIGNING IN, AND IT IS NOT A DEFECT.** You will be
> **returned to the login page**. That is the **designed, correct** outcome, and
> here is why, from the code: a dashboard invite creates a **Supabase auth user
> with no row in our `users` table**. The JWT hook
> (`custom_access_token_hook`, migration 0002) reads `public.users` to fill the
> `tenant_id` claim; with no row there is **no claim**. `getRequestContext`
> (`context.ts:32`) requires a non-empty `tenant_id` and returns null, and the
> root route redirects a context-less visitor to `/login` (`app/page.tsx`).
>
> **So: PASS = the set-password form rendered, the password was accepted, and you
> land on /login.** **FAIL = the link did not resolve at all**, or the address in
> step 3 was a `supabase.co/auth/v1/verify` one.
>
> **A real staff member is invited from `/admin/staff`, not from the dashboard** —
> that path creates both rows. This item tests the **email and the link**, not
> onboarding.

## 10. Clean up **[4b]**

**24. Work the 0g ledger, top to bottom.**

- [ ] **Cancel the appointment** created by confirming pedido A (item 17).
- [ ] **Cancel the staff appointment** booked over pedido B (item 18).
- [ ] **Decline pedido B**, or leave it pending.
- [ ] **Deactivate the test therapist** (0h and items 9–11): `/admin/staff` →
      Gerir → **Função** → inactive. Deactivating is clean; editing hours back is
      not.
      > **[6c] THIS ONE ACTION UNDOES ALL OF 0h**, and it still works exactly as
      > written now that the therapist has a clinic and a schedule.
      > `setStaffActive` carries no location, schedule or appointment guard — only
      > owner-tier and last-owner checks, and neither applies
      > (`lib/admin/staff.ts:278-308`). **Leave the flag, the membership and the
      > Saturday hours in place:** every surface that would surface them filters on
      > `is_active` first (`lib/scheduling/data.ts:277`;
      > `apps/api/lib/appointments/store.ts:471`), so an inactive therapist is out
      > of the agenda dropdown and out of the portal's auto-assignment regardless.
      > Undoing them individually is three more chances to leave the system in a
      > half-state.
- [ ] **[R2b] DELETE THE INVITED AUTH USER** (created at item 23). supabase.com →
      `dfotoodqvmjhbdcxyaxf` → **Authentication** → **Users** → the address you
      invited → **⋯** → **Delete user**.
      > **A DASHBOARD DELETE, not a deactivation in our admin — different
      > objects.** `/admin/staff` flags a row in *our* `users` table and does not
      > touch Supabase's `auth.users`. The invite created only the Supabase side.
      > Leaving it means a live auth account nobody manages.
- [ ] **[R2c] Your own** password changed at item 22 — no colleague touched.
- [ ] **NOT REVERTIBLE, and correctly so:** the terms acceptance on the test
      patient. Append-only by ruling.
- [ ] **[6a] LEAVE THE TEST PATIENT ALONE.** Do not delete it and do not split it
      into two records. It carries the only acceptance row, and a second record on
      the same mobile would lock both out of the portal permanently (0d).

## 11. Disarm — a named step, and not optional **[2a]**

> **`OTP_LIVE_SEND` IS DISARMED AT THE END OF THIS SESSION.** R9 authorises
> *supervised canaries*, not a standing arm. "Left armed" is **not** permitted
> merely because it was written down — writing it down is a note, not a decision.

**25. Click path [R2d]** — 0e reversed:

1. **vercel.com** → the **`api.osteojp.pt`** project → **Settings** →
   **Environment Variables**.
2. **`OTP_LIVE_SEND`** → **Edit** → **`false`**.
   > `false` rather than delete: the variable stays visible, so its state is
   > readable at a glance instead of being an absence someone has to notice.
3. **Save** → **Deployments** → latest Production → **⋯** → **Redeploy**.
4. **Confirm Ready**, post-dating the save.
   > **STOP if the redeploy errors.** The flag is still armed until one succeeds.

- **Disarmed at:** `__________`  **Redeploy Ready at:** `__________`

> Reason to leave armed, if any: _______________________________
> Decided by: ____________  Disarm scheduled for: ____________

`REMINDERS_LIVE_SEND`, `INVITES_LIVE_SEND` and `REMINDERS_FEE_NOTICE_ENABLED` all
stay **off**.

---

## What to report back

Per item: **the number, and pass or fail.** For a failure, whatever the screen
said, verbatim.

## SCREENSHOTS — REQUIRED on the ten gate items **[2]**

> **[2] Rule 12 closes staff- and patient-visible work on your deployed-screen
> evidence, and for a GATE that is too important to rest on recollection.**
> Capture as you go; reconstructing afterwards means re-running items that cost
> SMS budget and create more production rows.

**Screenshot REQUIRED — these ten, and no others:**

| Gate | Items needing a screenshot |
|---|---|
| **PG1 (AUTH)** | **1, 2, 3, 12, 13, 15** |
| **PG2 (BOOKING)** | **16, 17, 18** |
| **PG4 (NOTIFICATIONS)** | **20** |

**Item 18 needs TWO** — one showing the staff booking **saved with no conflict
warning**, one showing the confirm **refused**. It is the double-booking check,
and a single image cannot show both halves.

**Everything else stays on your reported observation**, which WF-03 counts as
evidence: items 5–11 (card work), 19 (the log line — paste the text rather than a
screenshot), and 21–25.

**Three items are stop-the-session findings** if they fail in the direction
named: **item 8** (fee text on a screen = two independent gates failed), **item
14** (the portal reporting a booking as *confirmed* = zero-auto-confirmed
violated), and **item 18** (a confirm succeeding over a staff booking = a live
double booking).

## Gate map **[2b]**

| Items | Closes | Kind |
|---|---|---|
| 1, 2, 3, 12, 13, 15 | **PG1 (AUTH)** | gate |
| 16, 17, 18 | **PG2 (BOOKING)** | gate |
| 20 | **PG4 (NOTIFICATIONS)**, populated half | gate |
| 5–8 | W13-05 terms flow | card |
| 9–11 | W13-A split-shift | card |
| 19 | LE-suppression-observation | card |
| 21–23 | LE-auth-recovery-deadend | card |
| **14** | **PRODUCER — closes nothing itself** | see below |

> **[3] ITEM 14 IS NOT AN AUTH ITEM AND IS NOT LISTED UNDER PG1.** An earlier
> version gave PG1 as "12–15", which swept it in and left a reader concluding
> that item 14 must pass for PG1 to close. It must not: PG1 is the login screens
> (1–3) and the OTP round trip (12, 13, 15). Item 14 is the **producer** —
> it creates the two pedidos, and its failure blocks **PG2 and PG4**, never PG1.

**Three gates can move: PG1, PG2, PG4.** Readiness can reach **6/9** if every
gate item passes, and **no higher**.

**Item 14 feeds items 16–20.** If item 14 fails, **PG2 and PG4 cannot be
attempted** — say so and stop that branch rather than recording them as failed.
**PG1 is unaffected**: items 12, 13 and 15 stand on their own.

## What this session does NOT close, and why

- **PG6 (EXPOSURE)**, **PG8 (SYNC)**, **PG9 (EXPERIENCE)** — LOOPs 6, 7 and 8 are
  unbuilt. **No screen check can close them.**
- **The in-product staff invite** — gated by `INVITES_LIVE_SEND`, deferred to
  launch day under LAUNCH-01. **[4d]**
- **The fee line copy** — built, gated, `approved: false`. Needs JP and counsel.
- **Anything already verified** — the `/r/[token]` route, the bell's empty state,
  the agenda grid and the 48h email wording were checked on 2026-08-05.

**When every item has an answer, the wave is complete.** That is this document's
whole purpose: it is the stop condition, not a status update.

---

## Cross-reference verification **[6c]**

**Checked mechanically after the sixth round, not by reading.** Re-run it after
any further edit.

> **CROSS-REFERENCE VERIFICATION, 2026-08-07, round six: pre-flight `0a`–`0i`,
> nine blocks, all defined and all referenced; checklist items `1`–`25`,
> contiguous, no gaps and no duplicates; every `item N` reference in the prose
> resolves to a defined item; every `0x` reference resolves to a defined block;
> gate map totals 10 gate items and 4 card blocks, matching the screenshot table
> exactly.**

**Method: the assertions above are produced by a script, not by a reader.** It
extracts the item numbers, the pre-flight headings and every in-prose reference
from this file and compares the sets. A reader re-checking 25 items and nine
blocks by eye is exactly the process that let the pedido-ordering defect survive
three rounds.

**What round six changed, and nothing else:**

| Where | Change | Marker |
|---|---|---|
| Header | Revision count `four` → `six`; the new round's premise | — |
| PRE-FLIGHT intro | Names 0h/0i and gives the suggested order | **[6c]** |
| 0d | One patient serves both roles; the two-record sentence withdrawn | **[6a]** |
| 0d | The tenant question answered and its blank removed | **[6f]** |
| 0f | Retitled to the 0d record; NIF made optional with a valid value named | **[6a] [6b]** |
| 0f | The terms path proven contact-blind | **[6a]** |
| 0g | Three 0h rows added; the 9–11 row now says *edited*, not *created* | **[6c]** |
| **0h (NEW)** | Test-therapist configuration, with the minimum from the code | **[6c]** |
| **0i (NEW)** | The four write paths walked; the NIF banner blocks nothing | **[6b]** |
| §2 header | Points at the 0f/0d record; banner note | **[6a] [6b]** |
| §3 header | 0h is a precondition | **[6c]** |
| Item 9 | Names the Saturday baseline; empty week is a setup miss, not a fail | **[6c]** |
| Item 10 | Names Saturday | **[6c]** |
| Item 11 | Surface corrected to the drawer panel; advisory-not-blocking corrected; **a six-row failure-signal table replacing the withdrawn one** | **[6d]** |
| Item 14 | The portal assigns the therapist; the day is the control; **both times on one weekday; the no-slots dead end and its branch** | **[6e]** |
| Item 18 | **How to identify the server-assigned therapist, and why guessing inverts half two** | **[6h]** |
| Item 24 | One deactivation undoes 0h; leave the test patient | **[6a] [6c]** |
| 0h steps a, b | **Every label replaced with the literal pt-PT string from the component.** The tab is **"Locais e cor"**, not "Localizações" | **[6g]** |

**NOT touched, because they are already ruled:** the gate map (PG1 = 1, 2, 3, 12,
13, 15, with 14 as producer), the suppression observation hanging off item 18
rather than 17, the ten screenshot items, and the 6/9 ceiling.
