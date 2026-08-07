# Wave 13 acceptance session — the plan

**One sitting. Numbered. Every item is a URL, an expected screen, a failure
signal, and the gate it closes.**

This is the session WF-16 rules the wave ends on. Everything built since
2026-08-05 that closes on an owner screen (WF-03) has been accumulating silently
instead of interrupting you; this is where it all resolves at once.

**Budget: about 50 minutes.**

> **Revised four times**, each after a review found something that would have cost
> the sitting: **[2a]**–**[2d]**, **[4a]**–**[4e]**, **[R2a]**–**[R2d]**, and now
> **[3a]**–**[3d]**. The last round found that **the session consumed a pedido
> nothing in it created**, which would have lost PG2 and half of PG4 to ordering
> alone. **The whole checklist is renumbered.** Each change is marked where it
> applies.

---

# PRE-FLIGHT

Everything here happens **before item 1**. Two of these start clocks that run in
the background across the middle of the session.

## 0a–0b. Already done — no action **[4e]**

- **`PORTAL_TENANT_ID` is set** on the portal deployment. ✅
- **Both auth templates are pasted** (post-#840, the trimmed versions). ✅

## 0c. START THE RECOVERY CLOCK — trigger only, do not open it **[R2a]**

**Trigger a password recovery to a real Gmail address. Then leave it completely
alone and carry on.**

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
>
> **The 0f test patient is NOT the one** — it is created with no phone,
> deliberately.

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

- The record must be in the **portal tenant** (`PORTAL_TENANT_ID`). If you have
  records in more than one tenant, it must be that one.
- The record must carry **exactly one** row with that number in that tenant —
  see the warning below, which matters more than it looks.

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

## 0f. The designated test patient **[4a]**

**Items 5–8 write a PERMANENT, UNREMOVABLE legal record.**
`patient_terms_acceptances` is append-only by ruling: no UPDATE policy, no DELETE
policy, grants revoked, `recorded_by` pinned to `auth.uid()`. A test acceptance
on a real patient would be a legal record attributed to **you**, on a person who
never accepted anything, and **nothing in the product can remove it**.

- **Name:** `ZZ Teste Aceitação` — the `ZZ` sorts it to the end of every list.
- **How chosen:** the repo has no designated test patient (checked: no seed row,
  no fixture). This creates one, named for what it is.
- **Create it if absent:** Pacientes → Novo Paciente, `ZZ Teste Aceitação`, a NIF
  from the test range, **no phone and no email**.
- **Its id:** `_______________________`

> Creating a patient is reversible. **Recording an acceptance against one is
> not.**

## 0g. The cleanup ledger **[4b]**

**Write each mutation down as you make it.** Reverted at item 24.

| From item | Mutation | Revert |
|---|---|---|
| 0d | Your patient record's phone reformatted | Harmless — the correct format is the one the product expects |
| 5–8 | A terms acceptance on `ZZ Teste Aceitação` | **NOT REVERTIBLE.** Append-only by design |
| 9–11 | A test therapist's working hours | **Deactivate the test therapist** |
| 14 | **TWO portal booking requests (pedidos)** | Confirmed one becomes an appointment — **cancel it**; decline the other |
| 17 | An appointment created by confirming a pedido | **Cancel it** |
| 18 | A staff appointment booked over a pedido | **Cancel it** |
| 21–22 | **Your own** staff password changed | Keep the new one |
| 23 | **A live staff AUTH USER from the dashboard invite** **[R2b]** | **Supabase dashboard delete — item 24** |

**Item 9 uses a TEST THERAPIST, not a real one.** Rewriting a real therapist's
hours changes what reception can book for them.

- **Test therapist name/id:** `_______________________`

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
the portal's not-found page for both.
> **Failure signal:** either renders a form — a live session-minting entry point.

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
> **[4a] Use `ZZ Teste Aceitação` from 0f.** **[2b]** Closes the W13-05 **card**,
> not a gate. PG5 passed 2026-08-03.

**5.** Open **`ZZ Teste Aceitação`**'s ficha clínica, scroll to the bottom.
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

**9.** **`/admin/staff`** → **Gerir** on the **test therapist** → **Horários**.
**Expected:** a one-period day looks exactly as before, plus a small **"+
Adicionar 2.º período"** text button.
> **Failure signal:** existing single-period days render differently.

**10.** Add it, set **08:00–13:00** and **14:00–19:00**, **Guardar**, **reopen**.
**Expected:** both periods came back.
> **Failure signal:** only one survives.

**11.** Open the **agenda** for that therapist on that weekday. **Expected:** the
**13:00–14:00 gap behaves as outside working hours**.
> **Failure signal:** the gap is bookable, or the whole span reads available.
> This tests the recon, not the screen — it can fail while 9 and 10 pass.

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
same day**, with the **same therapist** for both if the portal lets you choose.

> **[4] USE A REAL THERAPIST, NOT THE TEST THERAPIST FROM 0g.** These bookings
> become **real appointments** that you cancel at item 24; the test therapist is
> **deactivated** at the same step. An appointment pointing at a deactivated
> therapist is the awkward combination: deactivation does not cascade to
> appointments, the row keeps its `practitioner_id`, but the agenda's therapist
> views are built from ACTIVE availability (`day-availability.ts:189`,
> `therapist-locations.ts:32`) — so the appointment can still exist while its
> column is no longer offered, which makes it fiddly to find and cancel.
>
> **Using a real therapist avoids the ordering question entirely.** The test
> therapist then has only working hours to undo, and nothing referencing it.
>
> **Either way, item 24 cancels appointments BEFORE it deactivates anything** —
> the checklist is in that order deliberately.

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
*First* book a staff appointment over the same therapist at **time B** from the
agenda.

- **Half one: the staff booking SAVES with no conflict warning.** That is
  migration 0059 — an unconfirmed pedido no longer holds the slot.
- Now try to **Confirmar pedido B**. **Half two: it refuses with a conflict, and
  nothing is written.**

> **Failure signal:** *either* half alone. Blocked booking = 0059 did not take
> effect. Successful confirm = **you just created a double booking**, a
> **stop-the-session finding**.

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

**What you are looking for** — `packages/notify/src/gate.ts:76-78`, emitted via
`logger.info`:

```
[notify] suppressed template=confirmation.email channel=email appointment=<uuid> reason=live_send_disabled
```

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
| No such line, and **no email arrived** | **SCHEDULED, RUN NOT OBSERVED.** The event was sent but the confirmation run has not executed or has not logged. Check the Inngest dashboard for the run before concluding anything |
| **An email actually arrived** at the patient address | **SENT. STOP THE SESSION.** `REMINDERS_LIVE_SEND` is armed when it must not be. This is the one outcome the suppression path exists to prevent |

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
4. **Wait a few minutes**, then apply the **same link check as item 21** — it must
   read `…/auth/update-password?token_hash=<long-string>&type=invite`.
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
- [ ] **Deactivate the test therapist** (items 9–11): `/admin/staff` → Gerir →
      inactive. Deactivating is clean; editing hours back is not.
- [ ] **[R2b] DELETE THE INVITED AUTH USER** (created at item 23). supabase.com →
      `dfotoodqvmjhbdcxyaxf` → **Authentication** → **Users** → the address you
      invited → **⋯** → **Delete user**.
      > **A DASHBOARD DELETE, not a deactivation in our admin — different
      > objects.** `/admin/staff` flags a row in *our* `users` table and does not
      > touch Supabase's `auth.users`. The invite created only the Supabase side.
      > Leaving it means a live auth account nobody manages.
- [ ] **[R2c] Your own** password changed at item 22 — no colleague touched.
- [ ] **NOT REVERTIBLE, and correctly so:** the terms acceptance on
      `ZZ Teste Aceitação`. Append-only by ruling.

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
