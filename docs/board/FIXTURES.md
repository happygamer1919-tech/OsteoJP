# Test fixtures — the accounts and records every sweep uses

**This file exists because nothing of consequence may live only in chat or in a
handoff document.** Until 2026-08-12 the fixtures for this project lived in
neither the repo nor a seed: `docs/acceptance-session-wave-13.md:266` states it
plainly, *"the repo has no designated test patient (checked: no seed row, no
fixture)."* Every sitting therefore re-derived them from memory, and a sitting
that re-derives its own fixtures cannot be repeated by anyone else.

**It is deliberately NOT a seed script.** These records live in a real database
that only the owner touches; a seed would be a production write. This is the
written-down answer to "which record did we use", which is the part that kept
getting lost.

---

## Rules that bind every entry below

1. **Never a real staff account and never a real patient.** Not for a read-only
   step, not "just to look". The habit is the protection.
2. **Test records are `ZZ`-prefixed** so they sort to the bottom of every list
   and are unmistakable in a screenshot.
3. **One test patient, not two.** A second record carrying the same mobile locks
   **both** out of the portal permanently, because patient linkage refuses on
   anything but exactly one phone match (WF-07).
4. **Never record a terms acceptance on a real patient.**
   `patient_terms_acceptances` is append-only by ruling: no UPDATE policy, no
   DELETE policy, grants revoked. It would be a permanent legal record
   attributed to you, about a person who accepted nothing, and **nothing in the
   product can remove it.**
5. **Ids, not names, are the identity.** Every name here is cosmetic; no code
   reads it.

---

## Environments

| What | Value |
|---|---|
| Portal URL | **`https://osteojp-portal.vercel.app`** — see the warning below |
| Staff platform URL | **`https://app.osteojp.pt`** |
| Supabase project (prod) | `dfotoodqvmjhbdcxyaxf` |

> ### THE PORTAL IS NOT ON ITS CUSTOM DOMAIN. DO NOT TYPE `patient.osteojp.pt`.
>
> **`patient.osteojp.pt` DOES NOT RESOLVE.** `docs/dns-records-pending.md:27`
> lists it as **PENDING**, and `:89` still has it in "Still pending", against a
> live `dig` on 2026-08-02. The CNAME was added on the Vercel side, so the
> project shows *"Invalid Configuration"* until the DNS record exists.
>
> **The live portal is the Vercel default host.** `docs/SPEC.md:55`:
> *"project `osteojp-portal`, Node 22.x, analytics off, env vars set, **live at
> `osteojp-portal.vercel.app`**. Custom domain `patient.osteojp.pt` deferred to
> go-live."*
>
> **`apps/portal/.env.example` says `NEXT_PUBLIC_APP_URL=https://patient.osteojp.pt`
> and that is the GO-LIVE TARGET, not the current deployment.** Taking that file
> at face value sends you to a dead hostname. It is the single most likely way to
> lose the first ten minutes of a sitting.
>
> **Confirm the exact host once against the Vercel dashboard** (project
> `osteojp-portal`) before a sitting. A Vercel default host is stable, but the
> repo's newest statement about it is dated 2026-06-10 and only the dashboard is
> authoritative today.
>
> **The staff platform is different and IS on its custom domain.**
> `app.osteojp.pt` is **LIVE** on `cname.vercel-dns.com`
> (`docs/dns-records-pending.md:25`, `docs/supabase-auth-redirect-urls.md:49`).
> So do not assume the two hosts follow the same pattern; they do not.

---

## Accounts

> ### DISPLAY NAME IS A REQUIRED FIELD. Added 2026-08-12, and it is not cosmetic.
>
> **A sweep runner cannot verify an account from an email they never see on
> screen.** The staff header shows a DISPLAY NAME and a role; it does not show
> the login address. So an email in this table is unverifiable at the moment it
> matters, and a runner who is signed into the wrong account has no way to know.
>
> **It has already happened, and it cost a gate a day.** On 2026-08-12 a reception
> session was reported against an account displaying **"Happygamer1919"** while
> this table named only an email. PG4 closes on that exact screen, and under D4 an
> account WITHOUT the RECEPTION role slug correctly sees an empty queue — so the
> same screen meant either "the fan-out is broken" or "working as ruled", and
> nothing on the screen could tell you which. **PG4 was held until the owner named
> the account.** It resolved to `Alo` / Receção / `alo@gmail.com`, the row below,
> and the gate then closed on a positive reading.
>
> **A gate recorded against an unidentified account is a gate recorded against
> nothing.** That is why this column exists.
>
> **Fill DISPLAY NAME by reading the staff header, not by inferring it from the
> email.** If the display name does not match this table, stop and reconcile
> before observing anything.

| Role | Identifier (login) | **DISPLAY NAME as it renders in the staff header** | Id | Notes |
|---|---|---|---|---|
| **Test patient** | `ZZ Teste …` | `____________________` **REQUIRED** | `____________________` | Carries **the owner's own mobile**. It is the canary for every OTP step and the subject of the terms items. Portal, not staff header: read it from the portal account page. |
| **Test therapist** | `ZZ TESTE THERAPIST` | `____________________` **REQUIRED** | `8ac3b349…` | The practitioner on both rows of the INC-08 double booking. Already exists. **COVERS SATURDAY ONLY, 08:00-13:00 — see the box below. Every test booking goes on a Saturday morning.** |
| **Reception** | `ZZ TESTE RECEPCAO` / `alo@gmail.com` | **`Alo`** — role shows as **Receção**. CONFIRMED by the owner 2026-08-12. | `____________________` | **The account for ALL staff-side observation. NOT the owner account — see the box below.** Carries the RECEPTION role slug, which is what puts it in `resolveRecipients`. PG4 was closed on a session run as this account. |
| **Second therapist** | `ZZ TESTE THERAPIST 2` / `chris+terapeuta2@dlvlogistics.com` | `____________________` **REQUIRED** | `____________________` | Created 2026-08-18 via Convidar. Função **Terapeuta**, **NO location assigned** — which is the point: the negative arm needs a therapist assigned to nothing. Needed **only** for the negative arm of the therapist queue check, where a **non-assigned** therapist must be refused. **THE DISPLAY NAME IS STILL BLANK, so OBSERVE-SWEEP row C3 stays BLOCKED** — read it from the staff header at first login, never from the email above. |

> ### THE SECOND THERAPIST EXISTS BUT HAS NEVER LOGGED IN, 2026-08-18
>
> **The account was created and the row is still open, and those two facts are
> not in tension.** The staff card renders `ZZ TESTE THERAPIST 2`, "Sem
> localização atribuída" and "Sem horário definido", which is the correct shape.
> But the column this table calls **REQUIRED** is the name **as the staff header
> renders it**, and no one has seen that header, because nobody has logged in as
> this account yet.
>
> **NO INVITE EMAIL WAS SENT, AND THAT IS BY DESIGN.** `INVITES_LIVE_SEND` is off
> per R9, so the Convidar dialog issued a temporary password instead: *"Membro
> convidado. O email de convite não foi enviado. Palavra-passe temporária…"*.
> Reading that as a broken invite is the misreading this box exists to prevent.
>
> **First login sets a real password over the temporary one**, and the header
> name is read in that same sitting. Until then, `ACC-therapist-queue-unobserved`
> stays blocked and row C3 stays blocked with it.

> ### THE TEST THERAPIST COVERS SATURDAY ONLY, 08:00-13:00
>
> **Owner-supplied, 2026-08-12. Not re-derivable from this repo** — availability
> templates are production data and no terminal may read production.
>
> **It is the isolation mechanism, not an accident.** A test therapist whose
> availability touches no weekday cannot collide with a real clinic day, so every
> slot a sweep books is provably a slot no patient wanted.
>
> **Outside that window the portal offers NO SLOTS for this therapist**, and the
> screen says **"Não há horários disponíveis para esta data. Tente outro dia ou
> contacte a clínica."** A runner who does not know this reads a working booking
> flow as broken. It cost the first run of `OBSERVE-SWEEP.md`, whose Block B said
> "any date at least two days out".
>
> **Every test appointment goes on one Saturday morning.** The 2026-08-12 run
> used Saturday 22 August 2026, 09:00 and 11:00.

> ### NEVER RUN A STAFF OBSERVATION AS THE OWNER ACCOUNT
>
> **THE OWNER RECEIVES NO PEDIDO NOTIFICATIONS, BY RULING.** JP, 2026-08-11, card
> `D4-owner-cannot-see-pedido-queue`. `resolveRecipients`
> (`apps/api/lib/notifications/centre.ts:56-88`) selects exactly two sets: users
> whose role slug is **RECEPTION**, and the explicitly named assigned
> practitioners. The owner is neither. 0055's SELECT policy then pins every read
> to `recipient_user_id = auth.uid()`, so `staff_notifications` is a
> per-recipient inbox at the database and there is no supervisor view.
>
> **So the owner's `/notificações` is CORRECTLY EMPTY.** Observing it as the
> owner produces a false failure against a correct product — and on PG4 that is
> the single most expensive mistake available, because PG4 closes on exactly that
> screen. Use `ZZ TESTE RECEPCAO`.

---

## Numbers

| Purpose | Value | Why this one |
|---|---|---|
| **Canary** — receives real OTP sends | the owner's own mobile | The only number on the platform. This is what makes a live send safe. |
| **No patient record** | `+351900000000` | Passes the validator `/^[29]\d{8}$/` (`phone.ts:19`), which deliberately does not enforce prefix assignment, so it reaches the code screen. **`90` is not an assigned Portuguese mobile block** (mobiles are 91/92/93/96), so **no handset can receive it** even with live sending armed. |
| **Synthetic NIF**, if one is ever needed | `212345672` | The repo's own canonical synthetic individual NIF (`lib/patients/nif.test.ts:14`). A made-up nine digits is **rejected**: `checkNif` enforces a prefix rule and a mod-11 control digit. |

---

## Rate limits that constrain any sitting

Read from `apps/api/lib/rate-limit/limiter.ts`, not from memory.

| Limit | Keyed on | Threshold |
|---|---|---|
| OTP **request** | your **IP** | **3 per hour** |
| OTP **request** | the **phone** (hashed) | **3 per hour** |
| OTP **verify** | your **IP** | **10 per hour** |
| Wrong codes | the code row | **5 attempts** |

**Both keys apply to a single request.** The binding one is the IP: three
requests per hour in total, whatever number you use. Plan a sitting around that
number before you start, not after you have spent it.

---

## Used by

- `docs/board/OBSERVE-SWEEP.md` — the observation sweep.
- `docs/acceptance-session-wave-13.md` — the Wave 13 acceptance plan.

**Fill a blank once and it stays filled.** If a value changes, change it here and
nowhere else.
