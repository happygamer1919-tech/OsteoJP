# Wave 13 acceptance session — the plan

**One sitting. Numbered. Every item is a URL, an expected screen, a failure
signal, and the gate it closes.**

This is the session WF-16 rules the wave ends on. Everything built since
2026-08-05 that closes on an owner screen (WF-03) has been accumulating silently
instead of interrupting you; this is where it all resolves at once.

**Budget: about 45 minutes.**

> **Revised three times.** 2026-08-07 under **[2a]**–**[2d]**, then **[4a]**–**[4e]**
> after a review found the session would have written a permanent record to a real
> patient and fired an unsupervised SMS, then **[R2a]**–**[R2d]** after a second
> review found a lost-place hazard, two uncleaned production rows, an unnamed
> account, and three steps with no click path. Each change is marked where it
> applies.

---

# PRE-FLIGHT

Everything here happens **before item 1**. Two of them start clocks that run in
the background across the middle of the session; that is the whole reason they
are up here and not in sequence.

## 0a–0b. Already done — no action **[4e]**

- **`PORTAL_TENANT_ID` is set** on the portal deployment. ✅
- **Both auth templates are pasted** (post-#840, the trimmed versions). ✅

Nothing to re-do.

## 0c. START THE RECOVERY CLOCK — trigger only, do not open it **[R2a]**

**Trigger a password recovery to a real Gmail address. Then leave it completely
alone and carry on.**

> **[R2a] Its ONLY job is to start the clock.** You read the link at **item 16**,
> in sequence, and nothing before then requires you to come back here. An earlier
> draft put the trigger at item 16 with an instruction to jump ahead to 20–23 and
> return — a lost-place hazard in a 25-item sitting.
>
> **The wait IS the test.** A mail-provider scanner has to have followed the link
> before you click it. Clicking immediately proves nothing, and five previous
> verification rounds failed for want of this step. It needs **15 minutes**; the
> session gives it more than that.

**RECOVERY IS RUN AGAINST YOUR OWN ACCOUNT AND NO OTHER. [R2c]**

> **[R2c] Instruction, not a note: use Ivan's own staff account.** A recovery run
> against **Rodica, Lurdes or Carlos** changes their password and **locks a real
> person out mid-week**. There is no undo that restores their old password — you
> would have to tell them the new one. Your own account is the only acceptable
> target.

- **Account used:** `_______________________` (must be your own)
- **Triggered at:** `__________`

## 0d. ARM THE CANARY — full click path **[R2d]**

> **WHY ARMING IS IN PRE-FLIGHT AND NOT AT ITEM 3.** Reaching the code screen at
> item 3 triggers a send. Armed, item 3 would fire a **real SMS before the
> supervised canary** — an incidental send, which R9 does not authorise. **So
> items 1–3 run first on the OFF state**, and this step is performed **after item
> 3 and before item 5**. It is written here so both waits — this redeploy and the
> 0c scanner clock — are set up in one place and run across the same middle
> items. **[R2a]**

**THE FLAG LIVES ON THE API PROJECT, NOT THE PORTAL. [R2d]** `OTP_LIVE_SEND` is
read by `apps/api` (`lib/auth/otp-transport.ts:62`), which serves
**`api.osteojp.pt`**. Arming it on the portal or the staff project does
**nothing at all**, and the canary at item 20 would fail with no SMS and no
explanation.

**Click path:**

1. Go to **vercel.com** → your team → the project serving **`api.osteojp.pt`**
   (the `apps/api` project).
   > **Expected:** the project overview, with `api.osteojp.pt` listed under
   > Domains. **STOP if the domain is not there — you are in the wrong project.**
2. **Settings** → **Environment Variables**.
   > **Expected:** the variable list.
3. Find **`OTP_LIVE_SEND`**. If it exists, **Edit**; if not, **Add New**.
4. Value: exactly **`true`** — lowercase, no spaces, no quotes.
   > **STOP if you are tempted to type `TRUE` or `1`.** The code tests for the
   > exact string `"true"` (`otpLiveSendEnabled`), so anything else leaves it
   > **silently off** and item 20 fails for a reason you would not see.
5. Environment: **Production** only.
   > **STOP if Preview or Development is also ticked** — untick them.
6. **Save.**

**THE VALUE IS NOT LIVE UNTIL A REDEPLOY FINISHES. [R2d]** Saving an environment
variable does not change the running deployment.

7. Go to **Deployments** → the most recent **Production** deployment → the **⋯**
   menu → **Redeploy**.
   > Leave "Use existing Build Cache" as it comes.
8. **How you confirm it landed:** stay on the Deployments list until that entry
   shows **Ready** with a green dot, and its timestamp is **after** the time you
   saved the variable.
   > **STOP if it shows Error or Canceled.** Do not proceed to item 20 — the
   > canary would fail for a deployment reason, not a code reason, and you would
   > spend the session chasing the wrong thing.

- **Armed at:** `__________`  **Redeploy Ready at:** `__________`

## 0e. The designated test patient **[4a]**

**Items 8–11 write a PERMANENT, UNREMOVABLE legal record.**
`patient_terms_acceptances` is append-only by ruling: no UPDATE policy, no DELETE
policy, the grants are revoked at the table, and `recorded_by` is pinned to
`auth.uid()`. A test acceptance on a real patient would be a legal record
attributed to **you**, on a person who never accepted anything, and **nothing in
the product can remove it**.

- **Name it:** `ZZ Teste Aceitação` — the `ZZ` prefix sorts it to the end of
  every patient list, so nobody meets it by accident.
- **How it was chosen:** the repo has no designated test patient today (checked:
  no seed row, no fixture, nothing named for the purpose). So this creates one,
  named for what it is rather than for a plausible person.
- **If it does not exist, create it now:** Pacientes → Novo Paciente, name
  `ZZ Teste Aceitação`, a NIF from the test range, **no phone and no email** — so
  no reminder or message can ever reach it.
- **Write its id here:** `_______________________`

> Creating a patient is reversible. **Recording an acceptance against one is
> not.** That asymmetry is the whole reason this section exists.

## 0f. The cleanup ledger **[4b]**

The session mutates real clinic state. **Write each mutation down as you make
it** and revert them at item 24. Rodica and the team use these surfaces.

| From item | Mutation | Revert |
|---|---|---|
| 7 | A staff appointment created over a pedido | **Cancel it** from the agenda |
| 7 | A pedido left unconfirmed | Leave it, or **decline** it — it was already pending |
| 12–14 | A therapist's working hours rewritten | **Use the test therapist**, then deactivate |
| 8–11 | A terms acceptance on `ZZ Teste Aceitação` | **NOT REVERTIBLE.** Append-only by design |
| 16–18 | **Your own** staff password changed | Keep the new one, or change it back |
| **19** | **A live staff AUTH USER created by the dashboard invite** **[R2b]** | **Supabase dashboard delete — see item 24** |

**Item 12 uses a TEST THERAPIST, not a real one.** Rewriting a real therapist's
hours changes what reception can book for them, and a revert that misses a row
leaves the clinic quietly wrong. If no test therapist exists, create one
(`/admin/staff` → Novo) and **deactivate it at item 24**.

- **Test therapist name/id:** `_______________________`

---

# THE CHECKLIST

## 1. Portal login screens — closes PG1 (AUTH), first half

**These run with `OTP_LIVE_SEND` still OFF, and they run FIRST for that reason.**
**[4c]**

**1.** Open the portal. **Expected:** "Entrar com o seu telemóvel" and a **single
phone field**.
> **Failure signal:** any email field, any password field, or a "Recuperar
> acesso" link. Those are pre-Decision-D surfaces and should be gone.

**2.** Visit **`/auth/reset-password`** directly, then **`/auth/activate`**.
**Expected:** the portal's not-found page for both.
> **Failure signal:** either route renders a form. That is a live
> session-minting entry point Decision D removed.

**3.** Enter a phone number, reach the code screen, and enter **six wrong
digits**. **Expected:** one red banner, "Não foi possível entrar…".
> **Failure signal:** the message names *which* of the six failure modes
> occurred. Telling the caller which is an enumeration oracle.

**4. NOW perform the arming click path in 0d**, then carry straight on to item 5
while the redeploy runs.

*Closes: **PG1 (AUTH)** together with items 20–23.*

## 2. Reception confirm surface — closes PG2 (BOOKING)

Sign in to the **staff platform** as reception or admin.

**5.** Open the **notification centre** (the bell, top right). **Expected:** it
opens `/notificações`.
> **Failure signal:** it lands on `/perfil`. That was the original reported
> defect.

**6.** If a pending pedido exists, open it and press **Confirmar**. **Expected:**
it confirms, and the appointment appears on the agenda at that time.
> **Failure signal:** it confirms but the agenda does not show it.

**7. The most important behavioural check in the session.** Pick a pedido, and
*first* book a staff appointment over the same therapist and time from the
agenda.

- **Half one: the staff booking SAVES with no conflict warning.** That is
  migration 0059 — an unconfirmed pedido no longer holds the slot.
- Now go back and try to **Confirmar** the pedido. **Half two: it refuses with a
  conflict, and nothing is written.**

> **Failure signal:** *either* half alone. If the staff booking is blocked, 0059
> did not take effect. If the confirm succeeds anyway, you have just created a
> **double booking** — a **stop-the-session finding**.
>
> **[4b] CLEANUP: the staff appointment you created is REAL.** Note it in the 0f
> ledger and cancel it at item 24.

*Closes: **PG2 (BOOKING)**, and the behavioural evidence for W13-04a.*

## 3. Terms flow — ON THE TEST PATIENT ONLY **[4a]**, closes NO gate

**Admin or therapist** (reception has no clinical read and will not see this).

> **[4a] Use `ZZ Teste Aceitação` from 0e. Not a real patient.**
>
> **[2b]** This closes the **W13-05 card**, not a gate. PG5 passed 2026-08-03.

**8.** Open **`ZZ Teste Aceitação`**'s ficha clínica, scroll to the bottom.
**Expected:** below "Consinto", an **"Aceitação das condições"** block reading
**"Sem aceitação registada para este paciente."** with an **unticked** checkbox.
> **Failure signal:** the block is missing, or the checkbox is already ticked.

**9.** Tick it and press **Gravar**. **Expected:** the page reloads showing
"Aceitação registada em `<date>` (2026-08)", **and the checkbox is unticked
again**.
> **Failure signal:** the acceptance line does not appear (nothing recorded), or
> the checkbox stays ticked (a second Gravar would silently record a second
> acceptance).

**10.** Reopen the same ficha. **Expected:** still unticked, acceptance still
shown.
> **Failure signal:** it comes back **ticked** — a staff member would be
> attesting to something by not noticing a checkbox.

**11. Expected: no fee text anywhere**, in the ficha or in any message.
> **Failure signal:** any mention of 50% or "nos termos aceites na marcacao"
> reaching a screen. It cannot happen — the copy is `approved: false` and the
> flag is off — so if you see it, **two independent gates have failed** and it is
> a stop-the-session finding.

## 4. Split-shift — ON THE TEST THERAPIST **[4b]**, closes NO gate

**12.** **`/admin/staff`** → **Gerir** on the **test therapist** → **Horários**.
**Expected:** a one-period day looks exactly as it did, plus a small **"+
Adicionar 2.º período"** text button.
> **Failure signal:** existing single-period days render differently.

**13.** Add it, set **08:00–13:00** and **14:00–19:00**, **Guardar**, then
**reopen**. **Expected:** both periods came back.
> **Failure signal:** only one period survives the reopen.

**14.** Open the **agenda** for that therapist on that weekday. **Expected:** the
**13:00–14:00 gap behaves as outside working hours**.
> **Failure signal:** the gap is bookable, or the whole 08:00–19:00 span reads as
> available. This tests the recon, not the screen — it can fail while 12 and 13
> pass.
>
> **[4b] CLEANUP:** deactivate the test therapist at item 24.

## 5. Notification centre, populated — closes the second half of PG4

**15.** After item 6 or 7 produced a real patient change, reopen
**`/notificações`**. **Expected:** an entry for the change, visible to
**reception and to the assigned therapist**, carrying **no service name and no
clinical content**.
> **Failure signal:** an entry carrying a service name or any clinical detail —
> a payload-minimisation breach, not a cosmetic issue.
>
> **Not-yet-runnable is not a failure.** If nothing has flowed through the portal
> yet, say so and it stays queued.

*Closes: **PG4 (NOTIFICATIONS)** fully.*

## 6. The recovery link — READ it now **[2d]**

The clock started at **0c**. By now it has had the whole middle of the session.

**16. CHECK THE LINK BEFORE YOU CLICK IT.** In the Gmail message, hover the
"Definir nova palavra-passe" button, or copy the visible fallback address
underneath it. It must read:

```
https://app.osteojp.pt/auth/update-password?token_hash=<long-string>&type=recovery
```

> **Failure signal [2d]:** the address contains **`supabase.co/auth/v1/verify`**,
> or **`token=`** without `_hash`. **That is the OLD template** — the paste did
> not take. **Stop, re-paste, trigger a new recovery.** Clicking an old-template
> link proves nothing and burns the token.
>
> Also failing: an empty `?token_hash=&type=recovery`, or a host other than
> `app.osteojp.pt` — a `{{ .RedirectTo }}` variant crept back in.

**17.** Only once 16 reads correctly, **open the link**. **Expected: the
set-password form renders.**
> **Failure signal:** "Ligação inválida" or "Ligação expirada". Open the
> **"Detalhes técnicos"** disclosure and paste that block — it names exactly what
> arrived on the URL, with the token redacted to a length.

**18.** Set a password and sign in with it. **Expected:** you reach the
dashboard.
> **[R2c] This is YOUR OWN account, per 0c.** Note the new password somewhere you
> can retrieve it; there is no third party to ask.

*Closes: the **LE-auth-recovery-deadend** card. No gate.*

## 7. Staff invite — ONE half runs, ONE is deferred **[4d]**

> **[4d] THE TWO INVITE PATHS ARE DIFFERENT, AND ONLY ONE CAN RUN TODAY.**
> Determined from the code, not assumed:
>
> **Dashboard "Invite user" → RUNNABLE. It BYPASSES the flag.** Supabase sends
> this itself, over its own SMTP, using the `supabase/templates/invite.html` you
> pasted. Our transport is not involved. Proof: our code never calls
> `inviteUserByEmail` — zero hits across `apps/` and `packages/`, the only match
> being a test asserting we do not.
>
> **In-product invite screen → CANNOT RUN. It IS gated.** `lib/admin/staff.ts` →
> `lib/invites/email.ts` → `sendEmail`, and `lib/invites/email.ts:33` returns
> `process.env.INVITES_LIVE_SEND === "true"`. **R9 keeps that flag off until
> launch day**, so the invite would be **suppressed, not sent**.

**19.** **Click path [R2d]:**

1. **supabase.com** → the **`dfotoodqvmjhbdcxyaxf`** project (production).
   > **STOP if the project ref is anything else** — `jaxmkwoxjcgzkwxgbayx` is the
   > retired old prod.
2. **Authentication** → **Users**.
   > **Expected:** the user list.
3. **Invite user** (top right) → enter **a real inbox you control**, not a
   colleague's. **Send invite.**
   > **Expected:** a new row appears in Users, state **Waiting for verification**.
   > **[R2b] THIS CREATES A LIVE AUTH USER. Add it to the 0f ledger now.**
4. **Wait a few minutes**, then apply the **same link check as item 16** — the
   address must read
   `…/auth/update-password?token_hash=<long-string>&type=invite`.
5. Open it, set a password, sign in.

> **Failure signal:** a `supabase.co/auth/v1/verify` address — the Invite
> template paste did not take.

**DEFERRED TO LAUNCH DAY, and NOT a failure of this session [4d]:** the
in-product invite screen. It arms under LAUNCH-01 with `INVITES_LIVE_SEND`. **Do
not attempt it today and do not record it as failing.**

## 8. OTP login end to end — the canary, closes PG1 (AUTH), second half

Armed in 0d at item 4; the redeploy has had items 5–19 to land, and you confirmed
it **Ready**.

**20.** On a **real handset**, request a code from the portal. **Expected:** one
SMS, one code.
> **Failure signal:** no SMS within a minute. **Before concluding anything, go
> back and confirm the 0d redeploy shows Ready and post-dates the save** — that
> is the single most likely cause and it is not a code fault. Also failing:
> **more than one** SMS for one request.

**21.** Enter it. **Expected:** you reach the portal dashboard.
> **Failure signal:** a valid code is rejected, or the code screen loops.

**22.** On the code screen, check the help text below the card. **Expected:**
"Não recebeu o código?" and three lines — no mobile on record, a landline, a
shared number — **each ending in "Contacte a clínica"**.
> **Failure signal:** any line suggesting a self-service route.

**23.** Sign out from the account screen, then reopen the portal. **Expected:**
the phone screen.
> **Failure signal:** automatic re-entry into the dashboard — sign-out did not
> clear the session cookie.

*Closes: **PG1 (AUTH)** together with items 1–3.*

## 9. Clean up **[4b]**

**24. Work the 0f ledger, top to bottom.**

- [ ] **Cancel the staff appointment** from item 7, from the agenda.
- [ ] **Decline or leave** the pedido from item 7.
- [ ] **Deactivate the test therapist** from items 12–14: `/admin/staff` → Gerir
      → set inactive. Deactivating is clean; editing hours back is not.
- [ ] **[R2b] DELETE THE INVITED AUTH USER from item 19.** supabase.com →
      `dfotoodqvmjhbdcxyaxf` → **Authentication** → **Users** → find the address
      you invited → row **⋯** → **Delete user** → confirm.
      > **It is a DASHBOARD DELETE, not a deactivation in our admin — those are
      > different objects.** Our `/admin/staff` deactivation flags a row in *our*
      > `users` table; it does not touch Supabase's `auth.users`. The invite
      > created only the Supabase side, so only the dashboard can remove it.
      > Leaving it behind means a live auth account nobody manages.
- [ ] **[R2c] Your own** password changed at item 18 — no colleague was touched.
- [ ] **NOT REVERTIBLE, and correctly so:** the terms acceptance on
      `ZZ Teste Aceitação`. Append-only by ruling. It stays, on a patient that
      exists for exactly this purpose.

## 10. Disarm — a named step, and not optional **[2a]**

> **`OTP_LIVE_SEND` IS DISARMED AT THE END OF THIS SESSION. That is the default
> and the expected outcome.** R9 authorises *supervised canaries*, not a standing
> arm. "Left armed" is **not** a permitted end state merely because it was
> written down — writing it down is a note, not a decision.

**25. Click path [R2d]** — the same place as 0d, reversed:

1. **vercel.com** → the project serving **`api.osteojp.pt`** → **Settings** →
   **Environment Variables**.
2. **`OTP_LIVE_SEND`** → **Edit** → set the value to **`false`**.
   > Setting `false` is preferred over deleting: the variable stays visible in
   > the list, so its state is readable at a glance instead of being an absence
   > someone has to notice.
3. **Save**, then **Deployments** → latest Production → **⋯** → **Redeploy**.
4. **Confirm it shows Ready**, post-dating the save.
   > **STOP if the redeploy errors.** The flag is still armed until one succeeds,
   > and that is exactly the state this step exists to prevent.

- **Disarmed at:** `__________`  **Redeploy Ready at:** `__________`

> **If — and only if — there is a REASON to leave it armed**, state it here
> before the session ends, with who decided it and what re-checks it. Absent a
> written reason, it is disarmed. **Either way item 25 is performed and
> recorded.**
>
> Reason to leave armed, if any: _______________________________
> Decided by: ____________  Disarm scheduled for: ____________

`REMINDERS_LIVE_SEND`, `INVITES_LIVE_SEND` and `REMINDERS_FEE_NOTICE_ENABLED` all
stay **off**. This session arms nothing else.

---

## What to report back

Per item: **the number, and pass or fail.** For a failure, whatever the screen
said, verbatim. Screenshots welcome but not required — WF-03 counts your reported
observation as the evidence.

**Two items are stop-the-session findings** if they fail in the direction named:
**item 7** (a confirm that succeeds over a staff booking = a live double booking)
and **item 11** (fee text on a screen = two independent gates failed).

## Gate map — what closes what **[2b]**

| Items | Closes | Kind |
|---|---|---|
| 1–3, 20–23 | **PG1 (AUTH)** | gate |
| 5–7 | **PG2 (BOOKING)** | gate |
| 15 | **PG4 (NOTIFICATIONS)**, populated half | gate |
| 8–11 | W13-05 terms flow | card |
| 12–14 | W13-A split-shift | card |
| 16–19 | LE-auth-recovery-deadend | card |

**Three gates can move: PG1, PG2, PG4.** Readiness can reach **6/9** if every
gate item passes, and **no higher**.

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
