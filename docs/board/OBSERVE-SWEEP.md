# Observation sweep — the 15 OBSERVE cards

**This is a click list, not a plan.** Every line is a thing to click and a thing
to see. Follow the labels literally: they are copied from `packages/i18n`, so if
a screen shows different words that is itself the finding.

**RE-ORDERED 2026-08-12, AFTER `0061` APPLIED. PG2 AND PG4 NOW COME FIRST.**
They were unrunnable until the migration landed and they are the only two gates
your eyes can move tonight. Blocks B and C were rewritten for it; **read the
header at "BLOCKS B AND C" before starting either.**

**BLOCK A IS DONE AND `PG1` PASSED ON 2026-08-12.** All four rows observed by the
owner on a deployed build: A1, A2 (both routes), A3 (pass on the security
property, with the divergence recorded in that row) and **A4**. Block A is kept
below as the record and as the re-run procedure; **do not re-run it** unless
something regresses.

**Grouped by account, not by card**, so you log in once per account.
**Three sessions now that Block A is closed, in this order:** the test patient on
the portal; `ZZ TESTE THERAPIST`; `ZZ TESTE RECEPCAO`. Block D is your email and
can happen any time.

**Write the answer in the box on each line.** Anything you do not run, mark
`NOT RUN` — a blank is not a pass. When you are done, hand the file back and the
board is updated from it.

---

## FIXTURES — they live in their own file now

**`docs/board/FIXTURES.md`.** Fill the blanks there once and they stay filled;
this sweep, the acceptance plan and anything after it all read the same table.
They used to live only in a handoff document and in chat, which is the condition
this project's own rules forbid.

**Two entries you will need on every block below:** the **test patient** (the
`ZZ`-prefixed record carrying the owner's own mobile) and **`+351900000000`**,
the number with no patient record and no assigned carrier block.

> **THE PORTAL IS AT `https://osteojp-portal.vercel.app`, NOT
> `patient.osteojp.pt`.** That custom domain **does not resolve**
> (`docs/dns-records-pending.md:27`, still pending against a live dig on
> 2026-08-02). `apps/portal/.env.example` names it, but that is the go-live
> target rather than the deployment. The **staff platform IS** on its custom
> domain, `https://app.osteojp.pt`. The two hosts do not follow the same pattern.

**Never a real staff account, never a real patient.** The reasons are on that
file and they are not stylistic.

---

## BEFORE YOU START — two constraints that will bite

**1. OTP requests are capped at 3 per hour, keyed on YOUR IP.** From
`limiter.ts:184`. This sweep spends **one** (item A3). If you burn the other two
experimenting, A3 becomes unrunnable for up to an hour.

**2. `OTP_LIVE_SEND` STAYS ARMED FOR THIS SWEEP. Owner ruling, 2026-08-12.**
Plan every OTP step below as a **real send to your own handset**. This is not an
open question and it is not a risk to be managed around:

- the platform is **not in live use**, and the only number on it is your own, so
  nothing can fire at a patient;
- this sweep **is** a supervised sitting, which is exactly the condition R9's
  binding position permits arming under;
- it is **disarmed at the end of the sweep**. Launch-day arming stays with
  `LAUNCH-01`.

A3 uses `+351900000000`, which is in an unassigned block, so **no handset
receives that one** regardless.

---

# BLOCK A — PG1. Portal, logged OUT. Four rows, one gate.

**Account: none. Log out first, or use a private window.**

### A1 · Portal login screen — acceptance item 1

| | |
|---|---|
| **Open** | the portal URL |
| **Expect** | the heading **"Entrar com o seu telemóvel"** and a **single** field labelled **"Número de telemóvel"** |
| **STOP if** | you see *any* email field, *any* password field, or a **"Recuperar acesso"** link |

Observed: `________________________________`

> The stop condition is the whole item. An email/password pair on this screen
> means a session-minting path Decision D removed is back.

### A2 · The removed routes — acceptance item 2

| | |
|---|---|
| **Open** | `<portal>/auth/reset-password` |
| **Expect** | you are **redirected to `/auth/login`** and land back on the phone screen |
| **Then open** | `<portal>/auth/activate` |
| **Expect** | the same redirect |
| **STOP if** | either one **renders a form** |

Observed: `________________________________`

> A redirect is the *stronger* outcome, not a weaker one: the pages were deleted,
> and `PUBLIC_PATHS` (`apps/portal/proxy.ts:35`) turns you around at the edge
> before Next can even 404. A 404 also passes. A **form** does not.

### A3 · A number with no record is refused without telling you why — item 3

**This spends one of your three hourly OTP requests, and it is a live send** — to `+351900000000`, which no handset can receive.

| | |
|---|---|
| **On** | the portal login screen |
| **Type** | `900000000` (or `+351900000000`) — **not** your own number |
| **Click** | **"Enviar código"** |
| **Expect** | **"Não é possível entrar neste momento. Tente novamente mais tarde ou contacte a clínica."** — you stay on the phone screen. **CORRECTED 2026-08-12, see below.** |
| **STOP if** | the message names *which* thing failed — unknown number vs not a patient |

Observed: `________________________________`

> ### THIS EXPECTATION WAS WRONG UNTIL 2026-08-12. READ BEFORE RUNNING IT.
>
> **This row used to predict the "Código de 6 dígitos" screen.** It was run on
> 2026-08-12 and produced the `otp_unavailable` banner instead. The prediction
> was wrong, not the product, and the sweep is corrected here rather than the
> observation being re-run until it agrees.
>
> **The mechanism, traced through committed code** (see card
> `SEC-otp-unassigned-prefix-500`): `+351900000000` passes `normalizePhonePT`
> and passes `isSmsCapablePT` (that check rejects only the geographic `2`
> prefix, not unassigned `9x` blocks — `otp-sms-capability.ts` declines
> prefix-level assignment on purpose). So the route reaches
> `requestCode(...)`, which writes the code row and then calls the LIVE Twilio
> adapter, because `OTP_LIVE_SEND` is armed for this sweep. Twilio cannot route
> an unassigned block; `messages.create` rejects; nothing catches it
> (`otp.ts:245` and `request/route.ts:139` are both unwrapped); the route
> answers **500**; and the portal maps every status that is not 204/400/429 to
> `unavailable` (`apps/portal/lib/auth/otp.ts:104`).
>
> **THE SECURITY PROPERTY STILL PASSES.** The endpoint never touches the patient
> table. What now differs between this number and a real one is whether a
> CARRIER can route it — a public fact from the numbering plan — not whether the
> clinic has a record. It is a deliverability signal, not a patient-list oracle.
>
> **WITH `OTP_LIVE_SEND` DISARMED the old prediction is correct again**: the
> sink returns `delivered: false`, nothing throws, the route answers 204, and
> you reach the code screen. The expected result of this row therefore depends
> on the flag. Both outcomes are recorded so neither reads as a defect.

**A3b · the wrong-code banner — only runnable with the flag DISARMED**

This half needs the code screen, which the live flag prevents for this number.
**Do not spend an OTP request trying to force it.** Run it in the next sitting
with `OTP_LIVE_SEND` off, or with the test patient's own number.

| | |
|---|---|
| **From** | the "Código de 6 dígitos" screen |
| **Type** | any six wrong digits, e.g. `000000` |
| **Click** | **"Entrar"** |
| **Expect** | **one** red banner: **"Não foi possível entrar. Confirme o código e tente novamente, ou contacte a clínica."** |
| **STOP if** | the message names *which* thing failed — unknown number vs wrong code |

Observed: `________________________________`

> **Reaching the code screen for an unregistered number is the PASS, not a bug.**
> If it refused there, the screen would answer "is this person a patient?" to
> anyone who asked. The single generic banner is the same property one step later.

**Also on this screen, without clicking anything:** read the help text below the card.

| | |
|---|---|
| **Expect** | **"Não recebeu o código?"** and three lines covering: no mobile on record, a landline, a shared number |
| **STOP if** | fewer than three, or any of them names a specific patient |

Observed: `________________________________`

> The landline line is new — `#865` built its enforcement point. This is the
> screen that proves the pt-PT degradation copy the DoR asks for actually exists.

### A4 · Trusted device does not survive sign-out — acceptance item 15

**Needs a logged-in portal session on your own handset.** If you are not already
logged in from the earlier sitting, this costs a second OTP request — check your
budget before starting.

| | |
|---|---|
| **Open** | the portal, logged in as the test patient |
| **Click** | **"Conta"** in the navigation |
| **Click** | **"Terminar sessão"** |
| **Confirm** | the dialog **"Terminar sessão?"** |
| **Then** | close the tab, reopen the portal URL |
| **Expect** | the **phone screen** — "Entrar com o seu telemóvel" |
| **STOP if** | you land straight on the dashboard |

Observed: `________________________________`

> Landing on the dashboard means sign-out cleared the cookie but not the device
> row — which is exactly what `LE-trusted-device-revoke` (#843) built the endpoint
> to prevent. This is that card's observation too; one click covers both.

**→ A1, A2, A3, A4 all clean ⇒ PG1 PASSES.** Nothing else is needed for it.

---
# BLOCKS B AND C — REWRITTEN 2026-08-12, AFTER 0061 APPLIED

**Everything below changed on 2026-08-12.** Migration `0061` is applied to
production and `#870` is merged, so the two rows that used to sit under "NOT
RUNNABLE YET" are now the FIRST rows of the sweep. They are the only two your
eyes can move tonight.

### THE ORDER, AND WHY IT IS THIS ORDER

**PG2 and PG4 first. Everything else follows.** Both need a chain of setup, and
the chain crosses three accounts, so the accounts are sequenced to the chain
rather than the chain to the accounts.

| Session | Account | What it does |
|---|---|---|
| **1** | the **test patient**, on the **PORTAL** | creates the two pedidos everything downstream needs. **Spends 1 OTP.** B0.1 doubles as the A3 discriminator. |
| **2** | **`ZZ TESTE THERAPIST`**, on the **STAFF platform** | confirms one pedido. This is the write that PG4 observes and it can only be done by a therapist. |
| **3** | **`ZZ TESTE RECEPCAO`** (`alo@gmail.com`), on the **STAFF platform** | sees PG4's notification, runs PG2's refusals, then the four bookkeeping rows. **NOT the owner account — see the box in session 3.** |

**THREE LOGINS TOTAL. One per account, in that order, and no going back.**
Session 3 must come after session 2, because reception is looking for a
notification the therapist has not written yet.

### APPOINTMENTS: 3 CREATED, 3 CANCELLED. NEVER DELETED.

Blocks B and C create **exactly three** appointments, and **all three must be
cancelled** at the end of session 3:

| # | What | Created at | Cancelled at |
|---|---|---|---|
| **P-A** | pedido A, portal booking, **Saturday 09:00** | B0.3 | B0.3-CANCEL, run in session 3 |
| **P-B** | pedido B, portal booking, **same Saturday 11:00** | B0.4 | B0.4-CANCEL, run in session 3 |
| **S** | staff booking, confirmed, **on T-B** | B2.1 | B2.1-CANCEL, run in session 3 |

**ALL THREE LAND ON ONE SATURDAY MORNING, 08:00-13:00.** `ZZ TESTE THERAPIST`
covers Saturday only; that is the isolation mechanism and it is a hard
requirement, not a preference. Full reasoning in the box under SESSION 1.

**CANCEL, NEVER DELETE. This is not tidiness.** A test appointment was DELETED on
2026-08-11 and it destroyed the audit trail of the double booking; the incident
then took two sessions to reconstruct from what was left. A cancelled row keeps
its `audit_log` history. A deleted one takes the evidence with it.

**The cancel instruction for each appointment is printed immediately below the
step that creates it.** Do not go looking for a cleanup section; there is not
one.

---

# SESSION 1 — PORTAL, as the TEST PATIENT

**Account: the test patient (`ZZ Teste …`, the record carrying your own mobile).
Portal URL, not the staff platform.**

**This session spends ONE OTP request.** Check your hourly budget before you
start — see the note at the end of this session.

> ## T-A AND T-B MUST BOTH BE A SATURDAY, BETWEEN 08:00 AND 13:00.
>
> **HARD REQUIREMENT. Added 2026-08-12 after the first run.** An earlier draft of
> this sheet said "any date at least two days out". **That is wrong and it makes
> the whole sweep unrunnable.**
>
> **`ZZ TESTE THERAPIST` covers SATURDAY ONLY, and that is deliberate.** It is
> the isolation mechanism: a test therapist whose availability template touches
> no weekday cannot collide with a real clinic day, so every slot this sweep
> books is provably a slot no patient wanted. **Outside Saturday 08:00–13:00 the
> portal offers no slots for this therapist at all** — you will reach
> **"Não há horários disponíveis para esta data. Tente outro dia ou contacte a
> clínica."** and conclude the booking flow is broken when it is working exactly
> as configured.
>
> **Owner-supplied fact, 2026-08-12.** It is not re-derivable from this repo:
> availability templates are production data and PURPLE may not read production.
> Recorded on the owner's statement, attributed, and it is the kind of fact that
> belongs in `FIXTURES.md` rather than in a dispatch.
>
> **The run in progress uses Saturday 22 August 2026** (confirmed a Saturday):
> **T-A = 09:00**, **T-B = 11:00**. Both inside the window, two hours apart so
> they cannot overlap. Any later Saturday works the same way.
>
> **This constraint binds B0.3, B0.4 and B2.1**, because B2.1 puts a staff
> booking on **T-B** and the same availability applies.

### B0.1 · Log in

| | |
|---|---|
| **Open** | the portal URL |
| **Type** | your own mobile number |
| **Click** | **"Enviar código"** |
| **Type** | the 6 digits that arrive by SMS |
| **Click** | **"Entrar"** |
| **Worked if** | you land on the portal dashboard |
| **STOP if** | you get **"Não é possível entrar neste momento…"** — see the box below before doing anything else |

Observed: `________________________________`

> ### THIS ROW IS ALSO THE A3 DISCRIMINATOR, AND IT COSTS NOTHING EXTRA
>
> A3 produced **"Não é possível entrar neste momento…"** for `900000000`. Three
> code paths can produce that one string, and **this login separates them at zero
> cost**, because you were logging in anyway:
>
> | What happens here | What A3 was |
> |---|---|
> | **You log in normally** | A3 was the **unroutable-prefix 500**: `+351900000000` reached the live Twilio adapter, which cannot route an unassigned block, and the uncaught rejection became a 500. **This is the expected outcome** and it confirms `SEC-otp-unassigned-prefix-500`. |
> | **You get the SAME banner on your OWN number** | It is **NOT** the A3 finding. It is `PORTAL_TENANT_ID` unset or the portal unable to reach the API — an environment fault that breaks login for **every patient**. |
>
> **IF YOUR OWN NUMBER FAILS, HALT THE WHOLE SWEEP.** Do not continue to B0.2.
> Nothing downstream is meaningful, the finding is far more serious than A3, and
> `SEC-otp-unassigned-prefix-500` is then wrong and must be withdrawn.
>
> The portal function log carries the same answer if you would rather read it
> than infer it: `[auth] otp/request: api answered 500` is the 500 path;
> a line naming `PORTAL_TENANT_ID`, or a fetch error, is the environment fault.

### B0.2 · Confirm the therapist step exists — **A2, and read the box below**

| | |
|---|---|
| **Click** | **"Marcar consulta"** |
| **Expect** | after the clinic and service steps you reach **"Escolha o terapeuta"**, showing a therapist list plus **"Escolham por mim"** |
| **Expect** | the step counter reads **"Passo 3 de 5"** |
| **Worked if** | you can pick a named therapist and continue |
| **STOP if** | there is no therapist step and you go straight from service to date and time |

Observed: `________________________________`

> **THIS ROW EXISTS BECAUSE THE BOARD WAS WRONG.** `LE-portal-booking-therapist-step`
> (A2) was recorded as `todo` / "CARDED, NOT BUILT" while the work was already on
> `main` — PR **#857**, commit `5e45653`, "feat(portal): A2 therapist step".
> Found 2026-08-12 by code read. This row is the deployed-screen confirmation of
> that finding, and it costs you nothing because you are already in the flow.

### B0.3 · Create pedido A — **assign it to the TEST THERAPIST**

| | |
|---|---|
| **On** | **"Escolha o terapeuta"** |
| **Click** | the **test therapist** by name — **not "Escolham por mim"** |
| **Then** | pick a **SATURDAY**, between **08:00 and 13:00**, on the hour. **The run in progress uses Saturday 22 August 2026 at 09:00.** |
| **Write down** | the **date and time** you chose. Call it **T-A**. You need it twice more. |
| **STOP if** | the day shows **"Não há horários disponíveis para esta data…"** — you have picked a non-Saturday, or outside 08:00–13:00. That is the availability template, not a defect. Pick a Saturday morning. |
| **Click** | through to **"Confirmar marcação"** and submit |
| **Worked if** | you land on the pending-request screen and the summary shows the therapist you picked under **"Terapeuta"** |
| **STOP if** | the summary names a different therapist |

Observed: `________________________________`

> #### ⟵ CANCEL THIS ONE: **B0.3-CANCEL**, run in session 3, step 8
> **P-A gets CONFIRMED in session 2, so it must be cancelled from the staff
> side.** In session 3: `/agenda` → the date **T-A** → click the appointment →
> **"Estado"** → **"Cancelada"** → **"Guardar"**.
> **Do not delete it. Do not use any delete control if one exists.**

### B0.4 · Create pedido B — same therapist, a DIFFERENT time

| | |
|---|---|
| **Click** | **"Marcar consulta"** again |
| **Repeat** | the same steps, same **test therapist** |
| **Pick** | **the SAME Saturday**, a different hour inside **08:00–13:00**, **not overlapping T-A**. **The run in progress uses 11:00**, two hours after T-A. |
| **Write down** | that date and time. Call it **T-B**. |
| **Worked if** | a second pending request exists |
| **STOP if** | the portal refuses a second request — note the exact wording and carry on to session 2 with pedido A only; PG2 then cannot run tonight |

Observed: `________________________________`

> #### ⟵ CANCEL THIS ONE: **B0.4-CANCEL**, run in session 3, step 9
> **P-B stays PENDING** (its confirm is supposed to be refused). Cancel it from
> the staff side in session 3: `/agenda` → the date **T-B** → click the
> appointment → **"Estado"** → **"Cancelada"** → **"Guardar"**.
> **Cancel, never delete.**

### B0.5 · Log out of the portal

| | |
|---|---|
| **Click** | **"Conta"**, then **"Terminar sessão"**, and confirm **"Terminar sessão?"** |
| **Worked if** | you are back on **"Entrar com o seu telemóvel"** |

Observed: `________________________________`

> **OTP BUDGET.** This session spent **one** request against your IP and one
> against the test patient's number. The cap is **3 per hour on each**
> (`limiter.ts:184`). A3 already spent one on your IP tonight, and A4 may spend
> another. **If A3, A4 and this session all run inside one hour on the same
> network you are at exactly 3 and have no retry.** Run this session on **mobile
> data**: it is a different IP, so it draws on a fresh bucket and leaves the
> office wifi's remaining request as your spare.

---

# SESSION 2 — STAFF PLATFORM, as the TEST THERAPIST

**Account: the test therapist (`ZZ TESTE THERAPIST`). Email and password, the
ordinary staff login.** This session is three rows and it writes the thing PG4
exists to observe.

### C1 · The assigned therapist sees their own pedido — item 26a

| | |
|---|---|
| **Click** | the **bell** icon, top right |
| **Expect** | **"Notificações"** opens, and a pedido for **T-A** is listed |
| **Worked if** | the pedido you created in B0.3 is visible to this therapist |
| **STOP if** | the page is empty, **or** it shows a pedido for a therapist who is not this one |

Observed: `________________________________`

### C2 · That therapist confirms it — item 26b, **and this is PG4's write**

| | |
|---|---|
| **Click** | **"Confirmar"** on the **T-A** pedido |
| **Expect** | **"Pedido confirmado."** and the row leaves the queue |
| **Worked if** | it confirms without error |
| **STOP if** | it refuses with **"Não tem permissão para confirmar pedidos."** — that is a permission defect, not a conflict, and it stops the session |

Observed: `________________________________`

> **This click is the whole of PG4's code path.** It fires
> `emitConfirmedNotification`, which #870 shipped, and reception reads the result
> in session 3 step 1. If you skip this row, PG4 cannot move tonight.

### C3 · A NON-assigned therapist cannot — item 26c, the negative arm

> ### THIS ROW IS BLOCKED ON A MISSING FIXTURE. DO NOT IMPROVISE IT.
>
> It needs a **second therapist test account**, and `docs/board/FIXTURES.md`
> has that row **blank**. Running it as a real therapist is forbidden by that
> file's rule 1, and there is no substitute.
>
> **Mark this row `BLOCKED - no second test therapist` and move on.**
> `ACC-therapist-queue-unobserved` therefore does **not** close tonight: C1 and
> C2 prove something rendered, and only C3 proves it was scoped.

Observed: `________________________________`

### C4 · Log out

| | |
|---|---|
| **Do** | sign out of the therapist account completely |
| **Worked if** | you are back at the staff login |

Observed: `________________________________`

---

# SESSION 3 — STAFF PLATFORM, as `ZZ TESTE RECEPCAO`

**Account: `ZZ TESTE RECEPCAO`, `alo@gmail.com`. Email and password.**
**This session runs PG4 first, PG2 second, and the bookkeeping last.**

> ## DO NOT RUN THIS SESSION AS THE OWNER ACCOUNT. IT WILL PRODUCE A FALSE FAIL.
>
> **Corrected 2026-08-12. An earlier draft said "the reception / admin test
> account", which reads as if the owner's own admin account would do. It will
> not, and the failure is silent.**
>
> **THE OWNER RECEIVES NO PEDIDO NOTIFICATIONS. THAT IS A RULING, NOT A BUG.**
> JP ruled it on 2026-08-11 (card `D4-owner-cannot-see-pedido-queue`, shipped):
> reception and the assigned therapists handle the queue; the owner is neither.
> `resolveRecipients` (`apps/api/lib/notifications/centre.ts:56-88`) selects
> exactly two sets — users whose role slug is **RECEPTION**, and the explicitly
> named assigned practitioners. And 0055's SELECT policy pins every read to
> `recipient_user_id = auth.uid()`, so `staff_notifications` is a per-recipient
> inbox **at the database**. There is no supervisor view and none is being built.
>
> **SO THE OWNER'S `/notificações` IS CORRECTLY EMPTY.** Run B1 as the owner and
> you will see **"Sem notificações."**, conclude the fan-out is broken, and
> record **PG4 as failed on behaviour that is working exactly as ruled.** That is
> the worst outcome available on this sweep: a false finding against a correct
> product, on the one gate this session exists to move.
>
> **`ZZ TESTE RECEPCAO` carries the RECEPTION role slug**, which is what puts it
> in `resolveRecipients`' first set. Nothing else on this platform will do.
>
> If you are already signed in as the owner, **sign out completely first.**

## PG4 — the observation. One row.

### B1 · Reception sees the therapist's confirm — acceptance item 20

**This is the row that moves PG4. Nothing else on this sweep does.**

| | |
|---|---|
| **Click** | the **bell** icon, top right |
| **Expect** | it opens **`/notificações`**, titled **"Notificações"** |
| **Expect** | an entry corresponding to the therapist's confirm of **T-A** from session 2 |
| **Expect** | entries for the two portal requests you made in session 1 |
| **Worked if** | the confirm is visible to reception and **no entry shows a service name or any clinical detail** |
| **STOP if** | it lands on `/perfil`, **or** any entry shows a **service name** |

Observed: `________________________________`

> **SCREENSHOT THIS ONE.** PG4 closes on a recorded observation, not on a
> remembered one, and the record goes in
> `docs/acceptance-session-wave-13-results.md` item 20.
>
> **If the confirm entry is absent but the pedidos are there:** that is the
> fan-out failing, which is a real finding — say so, and PG4 stays open.
> **If the list is entirely empty:** that is `LE-pedido-emit-best-effort`, a
> different card. Note it and carry on.
>
> The service-name check is not cosmetic. Several service names identify a
> treatment type, so an entry naming one leaks the treatment to every reception
> user. That is a payload-minimisation breach.

## PG2 — the refusal. Two rows, two screenshots.

**Acceptance item 18 needs BOTH halves photographed, because one image cannot
show both.** Half one is B2.1, half two is B2.2.

### B2.1 · Half one — the staff booking saves with NO conflict warning

| | |
|---|---|
| **Open** | `/agenda` and go to the date **T-B** |
| **Click** | **"Nova marcação"** |
| **Set** | therapist = **`ZZ TESTE THERAPIST`**; the time = **T-B**, the same Saturday window as pedido B |
| **Set** | patient = the **test patient**; any service |
| **Set** | **"Estado"** = **"Confirmada"** |
| **Click** | **"Guardar"** |
| **Expect** | **it saves, with NO conflict warning and no "Guardar mesmo assim" prompt** |
| **Worked if** | a **Confirmada** appointment now sits on **T-B** alongside the pending pedido |
| **STOP if** | it warns of a conflict — a pending pedido is ruled NOT to hold the slot (JP's option B, `D1-pedido-versus-pedido-stacking`), so a warning here is itself the finding |

Observed: `________________________________`

> **SCREENSHOT THIS. It is item 18 half one.**

> #### ⟵ CANCEL THIS ONE: **B2.1-CANCEL**, run at step 7 below
> `/agenda` → **T-B** → click **this** appointment (the one you just made, not
> the pedido) → **"Estado"** → **"Cancelada"** → **"Guardar"**.
> **Cancel it, do not delete it.** It is one of the two rows that prove the
> refusal happened.

### B2.2 · Half two — the confirm is REFUSED. **This is the row that moves PG2.**

| | |
|---|---|
| **Open** | `/notificações` |
| **Find** | the pending pedido for **T-B** |
| **Click** | **"Confirmar"** |
| **Expect** | it is **REFUSED**, with: **"Este horário já não está livre. O pedido continua pendente: contacte o paciente e proponha outro horário."** |
| **Expect** | a second line below it: **"Conflito com:"** followed by the time and the patient name of the booking you made in B2.1 |
| **Worked if** | the pedido stays **pending** and both lines appear |
| **STOP if** | **it confirms.** That is a live double booking and it stops the whole sweep — say so immediately and cancel one of the two rows. |

Observed: `________________________________`

> **SCREENSHOT THIS. It is item 18 half two, and it has never been observed by
> anyone.** The production incident's confirm ran 68 seconds before the staff row
> existed, so this path was never exercised.
>
> #### THE EXPECTED SENTENCE WAS CORRECTED ON 2026-08-12. READ THIS.
> An earlier draft of this row expected **"Este terapeuta já tem uma marcação
> confirmada neste horário. Ligue ao paciente…"**, the `requests.error.doubleBooked`
> string. **That is the wrong string for this row and would have produced a false
> finding.** `confirmAppointmentRequest` runs its OWN conflict check inside the
> slot lock before it writes (`actions.ts:1295-1315`) and returns `conflict`, so
> `requests.error.conflict` is what renders. `doubleBooked` is the DATABASE
> backstop and is only reachable when the application check is bypassed — which
> is exactly what **B2.3** does deliberately.
>
> **AND SO THIS ROW DOES NOT DEPEND ON `0061`.** The refusal you see here is the
> application check that shipped with **#830 on 2026-08-07**. Item 18 half two
> has been observable for five days and simply was never run. The board and an
> earlier PURPLE report both claimed it "becomes observable once 0061 applies";
> **that claim was wrong** and is withdrawn here. **B2.3 is the row that needs
> 0061.**
>
> **A confirm succeeding here is a stop-the-session finding**, in the acceptance
> plan's own words.

### B2.3 · The database overrules the override — **this is the row that needs `0061`**

**This is the only row on the whole sweep that could not have been run before
today.** It deliberately bypasses the application check to prove the constraint
underneath it is real. The owner's ruling was that *"Guardar mesmo assim" is
OVERRULED AT THE DATABASE*; this is that ruling, observed.

| | |
|---|---|
| **Open** | `/agenda` at **T-B** and click the **pending** pedido (not the B2.1 booking) |
| **In** | **"Estado"**, choose **"Confirmada"** |
| **Click** | **"Guardar"** |
| **Expect** | a conflict warning, and the button changes to **"Guardar mesmo assim"** |
| **Now click** | **"Guardar mesmo assim"** — deliberately forcing it |
| **Expect** | it is **STILL REFUSED**, with: **"Este terapeuta já tem uma marcação confirmada neste horário. Duas marcações confirmadas não podem sobrepor-se."** |
| **Worked if** | the pedido stays **Pendente** after you forced the save |
| **STOP if** | **it saves.** Two confirmed appointments now overlap on one therapist, `0061` is not doing what its journal says it did, and the sweep stops. |

Observed: `________________________________`

> **SCREENSHOT THIS TOO.** It is the deployed-screen proof of migration `0061`,
> and it is a different sentence from B2.2 on purpose: B2.2 is the application
> refusing politely, B2.3 is the database refusing an operator who insisted.
>
> **Why forcing it is safe:** the constraint is what stops the write. If it were
> absent, B2.2 would already have told you — the application check would still
> have refused, and you would never reach this row's stop condition without a
> second, independent failure.

## Bookkeeping — four rows, none of them move a gate

### B3 · An illegal Estado change is refused — `INC-08` app half (#869)

**Use the appointment you created in B2.1. Do not use a real patient's row.**
This is a THIRD refusal and a third distinct sentence: B2.2 is a conflict, B2.3
is the constraint, and this one is the lifecycle map. Three different guards.

| | |
|---|---|
| **Open** | `/agenda` at **T-B** and click the **Confirmada** appointment from B2.1 |
| **In** | **"Estado"**, choose **"Pendente"** |
| **Click** | **"Guardar"** |
| **Expect** | refused, with: **"Mudança de estado não permitida. Uma marcação confirmada não volta a pendente, e concluída, cancelada e falta são estados finais."** |
| **Worked if** | it refuses and the appointment stays **Confirmada** |
| **STOP if** | it saves — that is the exact move that started the production double booking |

Observed: `________________________________`

> This creates nothing: a refused save leaves the row as it was.

### B4 · The pedido queue says what it is — `W13-04`

| | |
|---|---|
| **On** | `/notificações` |
| **Expect** | pending requests each show a patient name, a time, and a **"Confirmar"** button |
| **Expect, if empty** | **"Sem pedidos a aguardar decisão."** |
| **STOP if** | a row shows a service name, or **"Confirmar"** is missing on a pending row |

Observed: `________________________________`

### B5 · The ficha terms surface — `W13-05`

| | |
|---|---|
| **Open** | the **test patient's** ficha |
| **Scroll to** | the terms section |
| **Expect** | the acceptance state is shown, and **no fee text anywhere on the page** |
| **STOP if** | any price, fee or "tarifa" wording appears |

Observed: `________________________________`

> **Do not tick anything, on any patient.** `patient_terms_acceptances` is
> append-only by ruling and nothing in the product can remove a row from it.

### B6 · Patient auth screens are gone from the staff side — `W13-03`

| | |
|---|---|
| **Confirm** | you logged into this session with **email + password** and it worked |
| **Expect** | staff login is unchanged; the OTP change touched patients only |
| **STOP if** | the staff login asks for a phone code |

Observed: `________________________________`

## THE CANCELS. Run all three now, before you close the session.

**Three appointments were created. Three get cancelled. None get deleted.**

| Step | Which | Where | Done |
|---|---|---|---|
| **7** | **S**, the B2.1 staff booking | `/agenda` → **T-B** → the **Confirmada** row → **"Estado"** → **"Cancelada"** → **"Guardar"** | `______` |
| **8** | **P-A**, the confirmed pedido | `/agenda` → **T-A** → the appointment → **"Estado"** → **"Cancelada"** → **"Guardar"** | `______` |
| **9** | **P-B**, the pending pedido | `/agenda` → **T-B** → the **pending** row → **"Estado"** → **"Cancelada"** → **"Guardar"** | `______` |

**Cancel S (step 7) before P-B (step 9).** Both sit on **T-B** and cancelling the
confirmed one first makes the remaining row unambiguous in the drawer.

**Count check before you close: three cancelled, zero deleted.** If you cancelled
fewer than three, one is still live on the therapist's diary.

---
---

# BLOCK D — Your email inbox

### D1 · The recovery link has the right shape — `LE-auth-recovery-deadend`, item 21

**Do this BEFORE clicking anything.** Reading the link is the test.

| | |
|---|---|
| **Find** | the staff recovery email |
| **Hover** | the **"Definir nova palavra-passe"** button, or copy the visible fallback address |
| **Expect** | it starts `https://app.osteojp.pt/auth/update-password?token_hash=` and ends `&type=recovery` |
| **STOP if** | the address contains **`supabase.co/auth/v1/verify`** |

Observed: `________________________________`

### D2 · An aged link still reaches the set-password screen — item 22

| | |
|---|---|
| **Now click** | the link |
| **Expect** | you reach a **set-password screen** — not the login page |
| **Then** | set a password and confirm it works |
| **STOP if** | you land on `/login`, or the page acts before you submit |

Observed: `________________________________`

> **Prerequisite, and it is on you:** two Supabase templates must be re-pasted
> first — `docs/supabase-auth-redirect-urls.md` §9. If that has not happened, D1
> will fail for a reason that is not a defect. Check before running D1.

---

# BLOCK E — Logs, not screens

### E1 · The suppression line — `LE-suppression-observation`

| | |
|---|---|
| **Where** | the platform function logs, after the next real booking |
| **Expect** | one suppression log line appears |
| **STOP if** | a booking happens and no line appears |

Observed: `________________________________`

> This one waits on a real booking. It is not something you can force today;
> check it opportunistically.

---

# BLOCK F — No screen. One sentence each.

These need a decision or a confirmation, not a click. Answer them in one line.

| # | Card | The question |
|---|---|---|
| F1 | `LE-env-sweep-scope` | #843 is merged and on main. Anything left, or close it? `____________` |
| F2 | `LE-portal-supabase-residue` | #841 is merged and on main. Close it? `____________` |
| F3 | `LE-trusted-device-revoke` | #843 is merged; **A4 above is its observation**. Close it? `____________` |
| F4 | `LE-e2e-nif-edit-404` | Shipped as *capture, not fix*. It closes when the flake recurs already diagnosed. Leave open? `____________` |
| F5 | `LE-prod-scripts-cleanup` | Which one-off prod scripts are staged outside the repo? `____________` |
| F6 | `ACC-13-results-uncommitted` | Item 25 is **RULED, not open** — see the note under BEFORE YOU START. Record the disarm time **at the end of this sweep**: `____________` |
| F7 | `VERIFY-QUEUE` | Mechanism card. Nothing to do while this sweep is the queue. `____________` |

> **F6 is no longer a blocker.** The owner ruled on 2026-08-12 that the flag
> stays armed for the duration of a supervised sitting and is disarmed at the
> end. What F6 now collects is the **timestamp of that disarm**, written down
> once rather than re-asked every dispatch.

---

# WAS "NOT RUNNABLE YET" — BOTH ROWS ARE NOW LIVE

**Cleared 2026-08-12.** Migration `0061` is applied to production and `#870` is
merged (`225edfc`). The two rows that waited here have been promoted into the
sweep proper and are now the FIRST rows you run:

| Card | Where it went | Gate |
|---|---|---|
| `INC-08-double-booking-state-not-path` | **B2.1 + B2.2**, session 3. Acceptance item 18, both halves, two screenshots. | **PG2** |
| `ACC-13-item20-staff-fanout` | **C2** writes it, **B1** observes it. Acceptance item 20. | **PG4** |

**Nothing is waiting on a migration any more.** The next free migration number is
`0062` and it is unoccupied.

---

## When you are done

