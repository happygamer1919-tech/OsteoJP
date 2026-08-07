# Wave 13 acceptance session — the plan

**One sitting. Numbered. Every item is a URL and an expected screen.**

This is the session WF-16 rules the wave ends on. Everything built since
2026-08-05 that closes on an owner screen (WF-03) has been accumulating silently
instead of interrupting you; this is where it all resolves at once.

**Budget: about 45 minutes**, of which the 20-minute wait in step 0c runs in the
background while you do steps 1 to 6.

---

## Before you start

### Why the gate reads 4/9 and that is not a problem

WF-16 says it plainly, and it is the sentence most likely to be misread later:
**an open gate awaiting this batch is healthy state.** Readiness UNDERSTATES what
is built, deliberately. Four of the five gates this session can close are already
built, merged and green — they are open only because nobody has looked at them on
a screen yet. Flipping a WF-03 gate on green CI is the exact mistake WF-03 exists
to prevent.

### Two things must be true before step 1, and neither is mine to do

**0a. `PORTAL_TENANT_ID` is set on the portal deployment.** Without it the portal
cannot resolve which clinic a phone number belongs to and every login fails
identically. Nothing else in this plan works without it.

**0b. The two auth email templates are re-pasted.** Supabase dashboard →
Authentication → Emails:

- **Reset Password** ← `supabase/templates/reset-password.html`
- **Invite user** ← `supabase/templates/invite.html`

The other four templates are unchanged — do not re-paste them. No Site URL change
and no allowlist change is needed. Details: `docs/supabase-auth-redirect-urls.md`
§9.

### 0c. Start the clock on the recovery link NOW

Trigger a **password recovery to a real Gmail address**, then leave it alone and
carry on with the session. **The wait is the test.** A mail-provider scanner has
to have followed the link before you click it; clicking immediately proves
nothing, and five previous verification rounds failed for want of this step.

Come back to it at **step 7**, after at least 15 minutes.

---

## The supervised canary — arming

**Item 8 needs `OTP_LIVE_SEND` armed. It is off, and no build has ever turned it
on.** Arming is an owner action on the deployment environment.

**0d. Arm `OTP_LIVE_SEND` now**, at the start of the session, and write down the
time. It gets disarmed at step 9. If the session is interrupted, **disarm before
you walk away** — an unattended armed SMS sender is the thing this pattern exists
to prevent.

---

# The checklist

## 1. Portal login screens — no OTP needed

Steps 1 to 3 work with `OTP_LIVE_SEND` still off. **Open the portal.**

1. **Expected:** "Entrar com o seu telemóvel" and a **single phone field**. No
   email field, no password field, no "Recuperar acesso" link.
2. Visit **`/auth/reset-password`** directly, then **`/auth/activate`**.
   **Expected:** the portal's not-found page for both. These routes are gone.
3. Enter six wrong digits at the code screen.
   **Expected:** one red banner, "Não foi possível entrar…", and **nothing naming
   which of the six failure modes occurred**. If it tells you *why*, that is a
   defect — report it.

## 2. Reception confirm surface — a pedido becomes an appointment

Sign in to the **staff platform** as reception or admin.

4. Open the **notification centre** (the bell, top right). **Expected:** it opens
   `/notificações`, not `/perfil`.
5. If a pending pedido exists, open it and press **Confirmar**. **Expected:** it
   confirms, and the appointment appears on the agenda at that time.
6. **The conflict path.** Pick a pedido, and *first* book a staff appointment over
   the same therapist and time from the agenda. **Expected: the staff booking
   SAVES with no conflict warning** — that is migration 0059, an unconfirmed
   pedido no longer holds the slot. Now go back and try to **Confirmar** the
   pedido. **Expected: it refuses with a conflict, and nothing is written.**

   *This is the single most important behavioural check in the session.* It is
   the ruling JP gave, and both halves have to be true: the slot is free, **and**
   the confirm still cannot double-book.

## 3. Terms flow on the ficha clínica — LOOP 5

Still on the staff platform, as **admin or therapist** (reception has no clinical
read and will not see this).

7. Open any patient's **ficha clínica**, scroll to the bottom. **Expected:** below
   "Consinto", a new **"Aceitação das condições"** block reading **"Sem aceitação
   registada para este paciente."** with an **unticked** checkbox.
8. Tick it and press **Gravar**. **Expected:** the page reloads showing
   "Aceitação registada em `<date>` (2026-08)" — **and the checkbox is unticked
   again.**
9. Reopen the same ficha. **Expected:** still unticked, acceptance still shown.
   **It must never come back ticked**, and this is the case where a helpful
   pre-tick would look most reasonable and be most wrong.
10. **Expected: no fee text anywhere**, in the ficha or in any message. It cannot
    appear: the copy is unapproved and the flag is off.

## 4. Split-shift availability — W13-A

11. **`/admin/staff`** → **Gerir** on a therapist → **Horários**. **Expected:** a
    one-period day looks exactly as it did, plus a small **"+ Adicionar 2.º
    período"** text button.
12. Add it, set **08:00–13:00** and **14:00–19:00**, **Guardar**, then **reopen**.
    **Expected:** both periods came back.
13. Open the **agenda** for that therapist on that weekday. **Expected:** the
    **13:00–14:00 gap behaves as outside working hours.** This step tests the
    recon, not the screen — it is the one that can fail while 11 and 12 pass.

## 5. Notification centre, populated — PG4's second half

14. After step 5 or 6 produced a real patient change, reopen **`/notificações`**.
    **Expected:** an entry for the change, visible to **reception and to the
    assigned therapist**, carrying **no service name and no clinical content**.

    *If nothing has flowed through the portal yet, this item does not fail — it
    is not yet runnable. Say so and it stays queued.*

## 6. Staff invite — the other half of the auth fix

15. Invite a staff member to a real inbox you control. **Expected:** the email
    arrives with a **"Definir palavra-passe"** button pointing at
    `app.osteojp.pt/auth/update-password?token_hash=…&type=invite`.
16. **Wait a few minutes**, then open it. **Expected: the set-password form
    renders.** Set a password and sign in.

## 7. Back to the recovery link from step 0c

17. Open the Gmail message you triggered at the start. **Expected: the
    set-password form renders** — not "Ligação inválida".
18. Set a password and sign in with it.

    **If it fails**, open the **"Detalhes técnicos"** disclosure on the error
    screen and paste that block. It names exactly what arrived on the URL, with
    the token redacted to a length. The old screen destroyed that evidence, which
    is why this took five rounds.

## 8. OTP login end to end — the canary

Armed at step 0d.

19. On a **real handset**, request a code from the portal. **Expected:** one SMS,
    one code.
20. Enter it. **Expected:** you reach the portal dashboard.
21. On the code screen, check the help text below the card. **Expected:** "Não
    recebeu o código?" and three lines — no mobile on record, a landline, a
    shared number — **each ending in "Contacte a clínica"**.
22. Sign out from the account screen, then reopen the portal. **Expected:** the
    phone screen, **not** an automatic re-entry.

## 9. Disarm — do not skip

23. **Disarm `OTP_LIVE_SEND`**, or decide explicitly to leave it armed. Write down
    **which one**, and the time. Either is a valid outcome; **not deciding is
    not.** `REMINDERS_LIVE_SEND`, `INVITES_LIVE_SEND` and
    `REMINDERS_FEE_NOTICE_ENABLED` all stay **off** — this session arms nothing
    else.

---

## What to report back

Per item: **the number, and pass or fail.** For a failure, whatever the screen
said, verbatim. Screenshots are welcome but not required — WF-03 counts your
reported observation as the evidence.

**A "not yet runnable" is not a failure.** Item 14 in particular may simply have
nothing to show; that keeps it queued rather than failing it.

## What this session closes

| Item | Card / gate |
|---|---|
| 1–3, 19–22 | **W13-03**, gate **PG1** (AUTH) |
| 4–6 | **W13-04**, **W13-04a**, gate **PG2** (BOOKING) |
| 7–10 | **W13-05** (terms flow) |
| 11–13 | **W13-A** split-shift |
| 14 | **W13-02** populated centre |
| 15–18 | **LE-auth-recovery-deadend** |

**When every item has an answer, the wave is complete.** That is this document's
whole purpose: it is the stop condition, not a status update.

## What it does NOT close, and why

- **PG6 (EXPOSURE)**, **PG8 (SYNC)**, **PG9 (EXPERIENCE)** — LOOPs 6, 7 and 8 are
  unbuilt. No screen check can close them.
- **The fee line copy.** Built, gated, and `approved: false`. It needs JP and
  counsel, not a screen.
- **Anything already verified.** The `/r/[token]` route, the bell's empty state,
  the agenda grid and the 48h email wording were checked on 2026-08-05 and are
  deliberately absent. Re-checking a surface that has been seen is waste.
