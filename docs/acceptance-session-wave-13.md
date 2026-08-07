# Wave 13 acceptance session — the plan

**One sitting. Numbered. Every item is a URL, an expected screen, a failure
signal, and the gate it closes.**

This is the session WF-16 rules the wave ends on. Everything built since
2026-08-05 that closes on an owner screen (WF-03) has been accumulating silently
instead of interrupting you; this is where it all resolves at once.

**Budget: about 45 minutes.**

> **Revised twice.** 2026-08-07 under rulings **[2a]**–**[2d]**, then again under
> **[4a]**–**[4e]** after a review found four defects that would have made the
> session write a permanent record to a real patient, mutate the live clinic with
> no cleanup, fire an unsupervised SMS, and stall on an item that cannot run.
> Each change is marked at the point it applies.

---

## Before you start

### Why the gate reads 4/9 and that is not a problem

WF-16 says it plainly, and it is the sentence most likely to be misread later:
**an open gate awaiting this batch is healthy state.** Readiness UNDERSTATES what
is built, deliberately. The gates this session can close are already built,
merged and green — they are open only because nobody has looked at them on a
screen yet. Flipping a WF-03 gate on green CI is the exact mistake WF-03 exists
to prevent.

### 0a–0b. Already done — no action **[4e]**

- **`PORTAL_TENANT_ID` is set** on the portal deployment. ✅
- **Both auth templates are pasted** (post-#840, the trimmed versions). ✅

Nothing to re-do. They are listed only so the session records that they were
prerequisites and were met.

### 0c. The designated test patient **[4a]**

**Items 8–11 write a PERMANENT, UNREMOVABLE legal record.**
`patient_terms_acceptances` is append-only by ruling: no UPDATE policy, no DELETE
policy, the grants are revoked at the table, and `recorded_by` is pinned to
`auth.uid()`. A test acceptance on a real patient would be a legal record
attributed to **you**, on a person who never accepted anything, and **nothing in
the product can remove it**.

**So those items use a designated test patient, and only that one.**

- **Name it:** `ZZ Teste Aceitação` — the `ZZ` prefix sorts it to the end of
  every patient list, so nobody meets it by accident.
- **How it was chosen:** the repo has no designated test patient today (checked:
  no seed row, no fixture, nothing named for the purpose). So this creates one,
  named for what it is rather than for a plausible person, and it must never be
  confused with a real record.
- **If it does not exist, create it now:** Pacientes → Novo Paciente, name
  `ZZ Teste Aceitação`, a NIF from the test range, **no phone and no email** — so
  no reminder or message can ever reach it.
- **Write its id here before you start:** `_______________________`

> Creating a patient is reversible. **Recording an acceptance against one is
> not.** That asymmetry is the whole reason this section exists.

### 0d. The cleanup ledger **[4b]**

The session mutates real clinic state. **Write each mutation down as you make
it** and revert them at item 24. Rodica and the team use these surfaces.

| From item | Mutation | Revert |
|---|---|---|
| 7 | A staff appointment created over a pedido | **Cancel it** from the agenda |
| 7 | A pedido left unconfirmed | Leave it, or **decline** it — it was already pending |
| 12–14 | A therapist's working hours rewritten | **Use the test therapist**, then deactivate |
| 8–11 | A terms acceptance on `ZZ Teste Aceitação` | **NOT REVERTIBLE.** Append-only by design |
| 18 | A staff password changed | Change it back, or keep the new one — note which account |

**Item 12 uses a TEST THERAPIST, not a real one.** Rewriting a real therapist's
hours changes what reception can book for them, and a revert that misses a row
leaves the clinic quietly wrong. If no test therapist exists, create one
(`/admin/staff` → Novo) and **deactivate it at item 24** — deactivating is clean,
editing hours back is not.

- **Test therapist name/id:** `_______________________`

---

# The checklist

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
> occurred. Telling the caller which is an enumeration oracle. Any specificity
> here is a defect.

*Closes: **PG1 (AUTH)** together with items 20–23.*

## 2. ARM THE CANARY — here, not earlier and not later **[4c]**

> **WHY ARMING IS NOT AT THE TOP.** Reaching the code screen at item 3 triggers a
> send. With `OTP_LIVE_SEND` armed, item 3 would fire a **real SMS before the
> supervised canary** — an incidental send, which R9 does not authorise. Items
> 1–3 therefore run first, on the OFF state they were written for.
>
> **WHY IT IS NOT DEFERRED TO ITEM 20 EITHER: REDEPLOY LATENCY.** Changing an
> environment variable requires a redeploy, and the new value is not live until
> it finishes. Arming here lets that run **in the background across items 5–15**,
> so the canary is ready when you reach it instead of costing a wait mid-session.
>
> **Do not "tidy" this by moving arming back to the top or down to item 20.** The
> first fires an unsupervised SMS; the second stalls the session. This position
> is the only one that does neither, and without this note the early arm reads as
> carelessness and someone will eventually "fix" it into the wrong place.

**4. Arm `OTP_LIVE_SEND`.** Time: `__________`
Then carry straight on to item 5 while the redeploy runs.

## 3. Reception confirm surface — closes PG2 (BOOKING)

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
> **double booking** — a **stop-the-session finding**. Report it before
> continuing.
>
> **[4b] CLEANUP: the staff appointment you created is REAL.** Note it in the 0d
> ledger and cancel it at item 24.

*Closes: **PG2 (BOOKING)**, and the behavioural evidence for W13-04a.*

## 4. Terms flow — ON THE TEST PATIENT ONLY **[4a]**, closes NO gate

**Admin or therapist** (reception has no clinical read and will not see this).

> **[4a] Use `ZZ Teste Aceitação` from 0c. Not a real patient.** What you record
> here is permanent, attributed to you, and cannot be deleted by any screen in
> the product.
>
> **[2b]** This section closes the **W13-05 card**, not a gate. PG5 was passed on
> 2026-08-03; the terms flow was its last residue. Nothing here changes the 4/9.

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
> **Failure signal:** it comes back **ticked**. This is the case where a helpful
> pre-tick would look most reasonable and be most wrong — it would mean a staff
> member attesting to something by not noticing a checkbox.

**11. Expected: no fee text anywhere**, in the ficha or in any message.
> **Failure signal:** any mention of 50% or "nos termos aceites na marcacao"
> reaching a screen. It cannot happen — the copy is `approved: false` and the
> flag is off — so if you see it, **two independent gates have failed** and it is
> a stop-the-session finding.

## 5. Split-shift — ON THE TEST THERAPIST **[4b]**, closes NO gate

> **[4b] Use the test therapist from 0d.** Rewriting a real therapist's hours
> changes what reception can book for them, and a revert that misses a row leaves
> the clinic quietly wrong.

**12.** **`/admin/staff`** → **Gerir** on the **test therapist** → **Horários**.
**Expected:** a one-period day looks exactly as it did, plus a small **"+
Adicionar 2.º período"** text button.
> **Failure signal:** existing single-period days render differently. This was
> meant to be additive.

**13.** Add it, set **08:00–13:00** and **14:00–19:00**, **Guardar**, then
**reopen**. **Expected:** both periods came back.
> **Failure signal:** only one period survives the reopen.

**14.** Open the **agenda** for that therapist on that weekday. **Expected:** the
**13:00–14:00 gap behaves as outside working hours**.
> **Failure signal:** the gap is bookable, or the whole 08:00–19:00 span reads as
> available. This step tests the recon, not the screen — it is the one that can
> fail while 12 and 13 pass.
>
> **[4b] CLEANUP:** deactivate the test therapist at item 24.

## 6. Notification centre, populated — closes the second half of PG4

**15.** After item 6 or 7 produced a real patient change, reopen
**`/notificações`**. **Expected:** an entry for the change, visible to
**reception and to the assigned therapist**, carrying **no service name and no
clinical content**.
> **Failure signal:** an entry carrying a service name or any clinical detail.
> That is a payload-minimisation breach, not a cosmetic issue.
>
> **Not-yet-runnable is not a failure.** If nothing has flowed through the portal
> yet, say so and it stays queued.

*Closes: **PG4 (NOTIFICATIONS)** fully. The empty state passed 2026-08-05; this
is the populated half.*

## 7. The recovery link **[2d]** — LE-auth-recovery-deadend

**16. Trigger a password recovery to a real Gmail address**, then **wait at least
15 minutes** before item 17. **The wait is the test** — a mail-provider scanner
has to have followed the link before you click it. Clicking immediately proves
nothing, and five previous verification rounds failed for want of this step.

> Do items 20–23 while you wait, if the redeploy from item 4 has landed.

**17. CHECK THE LINK BEFORE YOU CLICK IT.** Hover the "Definir nova
palavra-passe" button, or copy the visible fallback address underneath it. It
must read:

```
https://app.osteojp.pt/auth/update-password?token_hash=<long-string>&type=recovery
```

> **Failure signal [2d]:** the address contains **`supabase.co/auth/v1/verify`**,
> or **`token=`** without `_hash`. **That is the OLD template** — the paste did
> not take. **Stop, re-paste, trigger a new recovery.** Clicking an old-template
> link proves nothing and burns the token.
>
> Also failing: an empty `?token_hash=&type=recovery`, or a host other than
> `app.osteojp.pt`. That would mean a `{{ .RedirectTo }}` variant crept back in.

**18.** Only once 17 reads correctly, **open the link**. **Expected: the
set-password form renders.** Set a password and sign in.
> **Failure signal:** "Ligação inválida" or "Ligação expirada". Open the
> **"Detalhes técnicos"** disclosure and paste that block — it names exactly what
> arrived on the URL, with the token redacted to a length.
>
> **[4b] CLEANUP:** this changes a real staff password. Note which account.

*Closes: the **LE-auth-recovery-deadend** card. No gate.*

## 8. Staff invite — ONE half runs, ONE is deferred **[4d]**

> **[4d] THE TWO INVITE PATHS ARE DIFFERENT, AND ONLY ONE CAN RUN TODAY.**
> Determined from the code, not assumed:
>
> **Dashboard "Invite user" → RUNNABLE. It BYPASSES the flag.** Supabase sends
> this itself, over its own SMTP, using the `supabase/templates/invite.html` you
> pasted. Our transport is not involved, so `INVITES_LIVE_SEND` cannot gate it.
> Proof: our code never calls `inviteUserByEmail` — zero hits across `apps/` and
> `packages/`, the only match being a test that asserts we do not — so that
> template is only ever sent by a dashboard action.
>
> **In-product invite screen → CANNOT RUN. It IS gated.** `lib/admin/staff.ts` →
> `lib/invites/email.ts` → `sendEmail` in `lib/reminders/clients.ts`, and
> `lib/invites/email.ts:33` returns `process.env.INVITES_LIVE_SEND === "true"`.
> **R9 keeps that flag off until launch day**, so the invite would be
> **suppressed, not sent**.

**19.** From the **Supabase dashboard**, invite a staff member to a real inbox
you control. **Wait a few minutes**, then apply the **same link check as item
17** — the address must read
`…/auth/update-password?token_hash=<long-string>&type=invite`. Then open it, set
a password, sign in.
> **Failure signal:** a `supabase.co/auth/v1/verify` address — the Invite
> template paste did not take.

**DEFERRED TO LAUNCH DAY, and NOT a failure of this session [4d]:** the
in-product invite screen. It arms under LAUNCH-01 with `INVITES_LIVE_SEND`. **Do
not attempt it today and do not record it as failing.**

*Closes: the invite half of **LE-auth-recovery-deadend**, for the dashboard path
only. No gate.*

## 9. OTP login end to end — the canary, closes PG1 (AUTH), second half

Armed at item 4; the redeploy has had items 5–15 to land.

**20.** On a **real handset**, request a code from the portal. **Expected:** one
SMS, one code.
> **Failure signal:** no SMS within a minute — check the redeploy finished before
> concluding anything — or **more than one** SMS for one request.

**21.** Enter it. **Expected:** you reach the portal dashboard.
> **Failure signal:** a valid code is rejected, or the code screen loops.

**22.** On the code screen, check the help text below the card. **Expected:**
"Não recebeu o código?" and three lines — no mobile on record, a landline, a
shared number — **each ending in "Contacte a clínica"**.
> **Failure signal:** any line suggesting a self-service route. Fail-closed
> linkage means the clinic is the only path.

**23.** Sign out from the account screen, then reopen the portal. **Expected:**
the phone screen.
> **Failure signal:** automatic re-entry into the dashboard. That means sign-out
> did not clear the session cookie.

*Closes: **PG1 (AUTH)** together with items 1–3.*

## 10. Clean up **[4b]**

**24. Work the 0d ledger, top to bottom.**

- [ ] Cancel the staff appointment from item 7.
- [ ] Decline or leave the pedido from item 7.
- [ ] **Deactivate the test therapist** from items 12–14.
- [ ] Note which staff password changed at item 18.
- [ ] **NOT REVERTIBLE, and correctly so:** the terms acceptance on
      `ZZ Teste Aceitação`. Append-only by ruling. It stays, on a patient that
      exists for exactly this purpose — which is why 0c insisted on it.

## 11. Disarm — a named step, and not optional **[2a]**

> **`OTP_LIVE_SEND` IS DISARMED AT THE END OF THIS SESSION. That is the default
> and the expected outcome.** R9 authorises *supervised canaries*, not a standing
> arm. "Left armed" is **not** a permitted end state merely because it was
> written down — writing it down is a note, not a decision.

**25. Disarm `OTP_LIVE_SEND`.** Time: `__________`

> **If — and only if — there is a REASON to leave it armed**, state it here
> before the session ends, with who decided it and what re-checks it. Absent a
> written reason, it is disarmed. **Either way item 25 is performed and
> recorded**; it is never skipped and never left implicit.
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
- **The fee line copy** — built, gated, `approved: false`. Needs JP and counsel,
  not a screen.
- **Anything already verified** — the `/r/[token]` route, the bell's empty state,
  the agenda grid and the 48h email wording were checked on 2026-08-05.
  Re-checking a surface that has been seen is waste.

**When every item has an answer, the wave is complete.** That is this document's
whole purpose: it is the stop condition, not a status update.
