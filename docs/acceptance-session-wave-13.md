# Wave 13 acceptance session — the plan

**One sitting. Numbered. Every item is a URL, an expected screen, a failure
signal, and the gate it closes.**

This is the session WF-16 rules the wave ends on. Everything built since
2026-08-05 that closes on an owner screen (WF-03) has been accumulating silently
instead of interrupting you; this is where it all resolves at once.

**Budget: about 45 minutes**, of which the 20-minute wait in step 0c runs in the
background while you do items 1 to 14.

> **Revised 2026-08-07** under four strategy rulings. Each change is marked
> **[2a]** to **[2d]** at the point it applies, so the diff against the first
> draft is readable without one.

---

## Before you start

### Why the gate reads 4/9 and that is not a problem

WF-16 says it plainly, and it is the sentence most likely to be misread later:
**an open gate awaiting this batch is healthy state.** Readiness UNDERSTATES what
is built, deliberately. The gates this session can close are already built,
merged and green — they are open only because nobody has looked at them on a
screen yet. Flipping a WF-03 gate on green CI is the exact mistake WF-03 exists
to prevent.

### Two things must be true before item 1, and neither is mine to do

**0a. `PORTAL_TENANT_ID` is set on the portal deployment.** Without it the portal
cannot resolve which clinic a phone number belongs to and every login fails
identically.

> **Failure signal:** every phone number, including a known-good one, returns the
> same generic failure. If item 1 renders but nothing past it works, suspect this
> before suspecting OTP.

**0b. The two auth email templates are re-pasted.** Supabase dashboard →
Authentication → Emails:

- **Reset Password** ← `supabase/templates/reset-password.html`
- **Invite user** ← `supabase/templates/invite.html`

The other four templates are unchanged — do not re-paste them. No Site URL change
and no allowlist change is needed. Details: `docs/supabase-auth-redirect-urls.md`
§9.

> **These were trimmed on 2026-08-07** (#840). If you pasted a version before
> that, paste again — the current files are ~1.1KB smaller and functionally
> identical.

### 0c. Start the clock on the recovery link NOW

Trigger a **password recovery to a real Gmail address**, then leave it alone and
carry on. **The wait is the test.** A mail-provider scanner has to have followed
the link before you click it; clicking immediately proves nothing, and five
previous verification rounds failed for want of this step.

Come back to it at **item 15**, after at least 15 minutes.

### 0d. Arm the canary

**Item 19 needs `OTP_LIVE_SEND` armed. It is off, and no build has ever turned it
on.** Arming is an owner action on the deployment environment.

Arm it now and **write down the time**. It is disarmed at item 23.

> **[2a]** If the session is interrupted, **disarm before you walk away.** An
> unattended armed SMS sender is the thing the supervised-canary pattern exists
> to prevent.

---

# The checklist

## 1. Portal login screens — closes PG1 (AUTH), first half

Items 1 to 3 work with `OTP_LIVE_SEND` still off. **Open the portal.**

**1.** **Expected:** "Entrar com o seu telemóvel" and a **single phone field**.
> **Failure signal [2c]:** any email field, any password field, or a "Recuperar
> acesso" link. Those are pre-Decision-D surfaces and should be gone.

**2.** Visit **`/auth/reset-password`** directly, then **`/auth/activate`**.
**Expected:** the portal's not-found page for both.
> **Failure signal [2c]:** either route renders a form. That is a live
> session-minting entry point Decision D removed.

**3.** Enter six wrong digits at the code screen. **Expected:** one red banner,
"Não foi possível entrar…".
> **Failure signal [2c]:** the message names *which* of the six failure modes
> occurred — wrong code, expired, no such number, locked out, and so on. Telling
> the caller which is an enumeration oracle. Any specificity here is a defect.

*Closes: **PG1 (AUTH)** together with items 19–22.* **[2b]**

## 2. Reception confirm surface — closes PG2 (BOOKING)

Sign in to the **staff platform** as reception or admin.

**4.** Open the **notification centre** (the bell, top right). **Expected:** it
opens `/notificações`.
> **Failure signal [2c]:** it lands on `/perfil`. That was the original reported
> defect.

**5.** If a pending pedido exists, open it and press **Confirmar**. **Expected:**
it confirms, and the appointment appears on the agenda at that time.
> **Failure signal [2c]:** it confirms but the agenda does not show it, or it
> reports success with no row.

**6. The most important behavioural check in the session.** Pick a pedido, and
*first* book a staff appointment over the same therapist and time from the
agenda.

- **Expected, half one: the staff booking SAVES with no conflict warning.** That
  is migration 0059 — an unconfirmed pedido no longer holds the slot.
- Now go back and try to **Confirmar** the pedido. **Expected, half two: it
  refuses with a conflict, and nothing is written.**

> **Failure signal [2c]:** *either* half alone. If the staff booking is blocked,
> 0059 did not take effect. If the confirm succeeds anyway, you have just created
> a double booking and this is a **stop-the-session finding** — report it before
> continuing.

*Closes: **PG2 (BOOKING)**, and the behavioural evidence for W13-04a.* **[2b]**

## 3. Terms flow on the ficha clínica — W13-05, closes NO gate

Still on the staff platform, as **admin or therapist** (reception has no clinical
read and will not see this).

> **[2b]** This section closes the **W13-05 card**, not a gate. PG5 (REMINDERS)
> was already passed on 2026-08-03; the terms flow was its last residue and is
> card-level evidence only. Nothing here changes the 4/9.

**7.** Open any patient's **ficha clínica**, scroll to the bottom. **Expected:**
below "Consinto", an **"Aceitação das condições"** block reading **"Sem aceitação
registada para este paciente."** with an **unticked** checkbox.
> **Failure signal [2c]:** the block is missing, or the checkbox is already
> ticked.

**8.** Tick it and press **Gravar**. **Expected:** the page reloads showing
"Aceitação registada em `<date>` (2026-08)", **and the checkbox is unticked
again**.
> **Failure signal [2c]:** the acceptance line does not appear (nothing was
> recorded), or the checkbox stays ticked (a second Gravar would silently record
> a second acceptance).

**9.** Reopen the same ficha. **Expected:** still unticked, acceptance still
shown.
> **Failure signal [2c]:** it comes back **ticked**. This is the case where a
> helpful pre-tick would look most reasonable and be most wrong — it would mean a
> staff member attesting to something by not noticing a checkbox.

**10. Expected: no fee text anywhere**, in the ficha or in any message.
> **Failure signal [2c]:** any mention of 50% or "nos termos aceites na
> marcacao" reaching a screen or a message. It cannot happen — the copy is
> `approved: false` and the flag is off — so if you see it, **two independent
> gates have failed** and it is a stop-the-session finding.

## 4. Split-shift availability — W13-A, closes NO gate

> **[2b]** Staff-visible, WF-03 applies, but it is **card-level** evidence. It
> belongs to no PG condition.

**11.** **`/admin/staff`** → **Gerir** on a therapist → **Horários**.
**Expected:** a one-period day looks exactly as it did, plus a small **"+
Adicionar 2.º período"** text button.
> **Failure signal [2c]:** existing single-period days render differently. This
> was meant to be additive.

**12.** Add it, set **08:00–13:00** and **14:00–19:00**, **Guardar**, then
**reopen**. **Expected:** both periods came back.
> **Failure signal [2c]:** only one period survives the reopen.

**13.** Open the **agenda** for that therapist on that weekday. **Expected:** the
**13:00–14:00 gap behaves as outside working hours**.
> **Failure signal [2c]:** the gap is bookable, or the whole 08:00–19:00 span
> reads as available. This step tests the recon, not the screen — it is the one
> that can fail while 11 and 12 pass.

## 5. Notification centre, populated — closes the second half of PG4

**14.** After item 5 or 6 produced a real patient change, reopen
**`/notificações`**. **Expected:** an entry for the change, visible to
**reception and to the assigned therapist**, carrying **no service name and no
clinical content**.
> **Failure signal [2c]:** an entry carrying a service name or any clinical
> detail. That is a payload-minimisation breach, not a cosmetic issue.
>
> **Not-yet-runnable is not a failure.** If nothing has flowed through the portal
> yet, say so and it stays queued.

*Closes: **PG4 (NOTIFICATIONS)** fully. The empty state already passed
2026-08-05; this is the populated half.* **[2b]**

## 6. The recovery link from step 0c — LE-auth-recovery-deadend

> **[2d] Check the LINK before you click it.** This is what tells you whether the
> template paste in 0b actually took effect, and it is the difference between a
> useful failure and a mystery.

**15.** In the Gmail message, **hover the "Definir nova palavra-passe" button, or
copy the visible fallback address underneath it.** It must read:

```
https://app.osteojp.pt/auth/update-password?token_hash=<long-string>&type=recovery
```

> **Failure signal [2d]:** the address contains **`supabase.co/auth/v1/verify`**,
> or the word **`token=`** without `_hash`. **That is the OLD template**, and it
> means the 0b paste did not take — Supabase is still sending the pre-fix body.
> **Stop here, re-paste, and trigger a new recovery.** Clicking an old-template
> link proves nothing about the fix and burns the token.
>
> A second failure signal: the address contains an **empty** segment such as
> `?token_hash=&type=recovery`, or begins with something other than
> `https://app.osteojp.pt`. That would mean a `{{ .RedirectTo }}` variant crept
> back in — the exact bug the hardcoded URL removes.

**16.** Only once item 15 reads correctly, **open the link**. **Expected: the
set-password form renders.**
> **Failure signal [2c]:** "Ligação inválida" or "Ligação expirada". If you see
> either, open the **"Detalhes técnicos"** disclosure and paste that block — it
> names exactly what arrived on the URL, with the token redacted to a length. The
> old screen destroyed that evidence, which is why this took five rounds.

**17.** Set a password and **sign in with it**. **Expected:** you reach the
dashboard.
> **Failure signal [2c]:** the password is accepted but sign-in then fails. That
> would mean `verifyOtp` succeeded and `updateUser` did not.

*Closes: the **LE-auth-recovery-deadend** card. No gate.* **[2b]**

## 7. Staff invite — the same fix, the other flow

**18.** Invite a staff member to a real inbox you control. **Wait a few minutes**,
then apply the **same link check as item 15** — the address must read
`…/auth/update-password?token_hash=<long-string>&type=invite`. Then open it, set a
password, sign in.
> **Failure signal [2c]:** a `supabase.co/auth/v1/verify` address (the Invite
> template paste did not take), or the invite arriving with a **temporary
> password** instead of a link — that means `STAFF_INVITE_REDIRECT_URL` is unset
> and the code fell back deliberately. Both are configuration, not code.

*Closes: the invite half of **LE-auth-recovery-deadend**. No gate.* **[2b]**

## 8. OTP login end to end — the canary, closes PG1 (AUTH), second half

Armed at 0d.

**19.** On a **real handset**, request a code from the portal. **Expected:** one
SMS, one code.
> **Failure signal [2c]:** no SMS within a minute, or **more than one** SMS for
> one request.

**20.** Enter it. **Expected:** you reach the portal dashboard.
> **Failure signal [2c]:** a valid code is rejected, or the code screen loops.

**21.** On the code screen, check the help text below the card. **Expected:** "Não
recebeu o código?" and three lines — no mobile on record, a landline, a shared
number — **each ending in "Contacte a clínica"**.
> **Failure signal [2c]:** any of the three lines suggesting a self-service route
> (reset, retry with email). Fail-closed linkage means the clinic is the only
> path.

**22.** Sign out from the account screen, then reopen the portal. **Expected:**
the phone screen.
> **Failure signal [2c]:** automatic re-entry into the dashboard. That means
> sign-out did not clear the session cookie.

*Closes: **PG1 (AUTH)** together with items 1–3.* **[2b]**

## 9. Disarm — a named step, and not optional

> **[2a] `OTP_LIVE_SEND` IS DISARMED AT THE END OF THIS SESSION. That is the
> default and the expected outcome.** R9 authorises *supervised canaries*, not a
> standing arm. "Left armed" is **not** a permitted end state merely because it
> was written down — writing it down is not a decision, it is a note.

**23. Disarm `OTP_LIVE_SEND`.** Write down the time.

> **If — and only if — there is a REASON to leave it armed**, that reason is
> stated here in this document before the session ends, along with who decided it
> and what re-checks it. Absent such a written reason, it is disarmed. **Either
> way item 23 is performed and recorded**; it is never skipped and never left
> implicit.
>
> Reason to leave armed, if any: _______________________________
> Decided by: ____________  Disarm scheduled for: ____________

`REMINDERS_LIVE_SEND`, `INVITES_LIVE_SEND` and `REMINDERS_FEE_NOTICE_ENABLED` all
stay **off**. This session arms nothing else.

---

## What to report back

Per item: **the number, and pass or fail.** For a failure, whatever the screen
said, verbatim. Screenshots are welcome but not required — WF-03 counts your
reported observation as the evidence.

**Two items are stop-the-session findings** if they fail in the direction named:
**item 6** (a confirm that succeeds over a staff booking = a live double booking)
and **item 10** (fee text reaching a screen = two independent gates failed).
Everything else, note it and carry on.

## Gate map — what closes what **[2b]**

| Items | Closes | Kind |
|---|---|---|
| 1–3, 19–22 | **PG1 (AUTH)** | gate |
| 4–6 | **PG2 (BOOKING)** | gate |
| 14 | **PG4 (NOTIFICATIONS)**, populated half | gate |
| 7–10 | W13-05 terms flow | card |
| 11–13 | W13-A split-shift | card |
| 15–18 | LE-auth-recovery-deadend | card |

**Three gates can move: PG1, PG2, PG4.** PG4's empty state already passed, so item
14 completes it. Readiness can therefore reach **6/9** if every gate item passes,
and **no higher** — see below.

## What this session does NOT close, and why

- **PG6 (EXPOSURE)**, **PG8 (SYNC)**, **PG9 (EXPERIENCE)** — LOOPs 6, 7 and 8 are
  unbuilt. **No screen check can close them**, and none should be attempted.
- **The fee line copy.** Built, gated, `approved: false`. It needs JP and counsel,
  not a screen.
- **Anything already verified.** The `/r/[token]` route, the bell's empty state,
  the agenda grid and the 48h email wording were checked on 2026-08-05 and are
  deliberately absent. Re-checking a surface that has been seen is waste.

**When every item has an answer, the wave is complete.** That is this document's
whole purpose: it is the stop condition, not a status update.
