# Observation sweep — the 15 OBSERVE cards

**This is a click list, not a plan.** Every line is a thing to click and a thing
to see. Follow the labels literally: they are copied from `packages/i18n`, so if
a screen shows different words that is itself the finding.

**Ordered so PG1's four come first.** PG1 is the closest gate on the board and
needs **zero engineering** — `#865` closed its last code gap. What is left is
four screens. Block A moves it; nothing else on this list does.

**Grouped by account, not by card**, so you log in once per account. Blocks A and
B are one portal session. Block C is one staff session. Block D is your email.

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
| **Expect** | you reach the **"Código de 6 dígitos"** screen — *even though no patient has that number* |
| **Then type** | any six wrong digits, e.g. `000000` |
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

# BLOCK B — Staff platform, as RECEPTION or ADMIN

**Log in once. Everything in this block is one session.**

### B1 · The notification centre carries no clinical content — acceptance item 20

| | |
|---|---|
| **Open** | the staff platform |
| **Click** | the **bell** icon, top right |
| **Expect** | it opens **`/notificações`** (titled **"Notificações"**) |
| **Expect** | entries for the portal booking requests |
| **STOP if** | it lands on `/perfil`, **or** any entry shows a **service name** or any clinical detail |

Observed: `________________________________`

> The service-name check is not cosmetic. Several service names identify a
> treatment type, so an entry naming one leaks the treatment to every reception
> user. That is a payload-minimisation breach.

> **If the list is empty and you expected pedidos:** that is
> `LE-pedido-emit-best-effort`, not this card. Note it and carry on.

### B2 · The pedido queue works and says what it is — `W13-04`

| | |
|---|---|
| **On** | `/notificações` |
| **Expect** | pending requests each show a patient name, a time, and a **"Confirmar"** button |
| **Expect, if the queue is empty** | **"Sem pedidos a aguardar decisão."** |
| **STOP if** | a row shows a service name, or "Confirmar" is missing on a pending row |

Observed: `________________________________`

### B3 · An illegal Estado change is refused — `INC-08`, app half (**#869**, live now)

**This is the new server-side guard. It is worth one minute because it is the
first half of the double booking you found.**

| | |
|---|---|
| **Open** | `/agenda` |
| **Click** | any appointment that is **Confirmada** |
| **In** | the **"Estado"** dropdown, choose **"Pendente"** |
| **Click** | **"Guardar"** |
| **Expect** | it is **refused**, with: **"Mudança de estado não permitida. Uma marcação confirmada não volta a pendente, e concluída, cancelada e falta são estados finais."** |
| **STOP if** | it saves |

Observed: `________________________________`

> **If it saves, stop the sweep and tell me.** That is the exact move that started
> the production double booking, and #869 exists to make it impossible.

### B4 · The ficha terms surface — `W13-05`

| | |
|---|---|
| **Open** | the **test patient's** ficha |
| **Scroll to** | the terms section |
| **Expect** | the acceptance state is shown, and **no fee text anywhere on the page** |
| **STOP if** | any price, fee or "tarifa" wording appears |

Observed: `________________________________`

> Do **not** tick anything on a real patient. The acceptance write is append-only
> by ruling and nothing in the product can remove it.

### B5 · Patient auth screens are gone from the staff side — `W13-03`

| | |
|---|---|
| **Confirm** | you logged in with **email + password** and it worked |
| **Expect** | staff login is unchanged; the OTP change touched patients only |
| **STOP if** | the staff login asks for a phone code |

Observed: `________________________________`

---

# BLOCK C — Staff platform, as the TEST THERAPIST

**Log out of reception. Log in as the test therapist.** This block is three
observations and the third is the one that matters.

### C1 · An assigned therapist sees their own pedido — item 26a

| | |
|---|---|
| **Click** | the **bell**, top right |
| **Expect** | `/notificações` opens and shows a pedido **for an appointment assigned to this therapist** |
| **STOP if** | the page is empty **or** shows a pedido for a different therapist |

Observed: `________________________________`

### C2 · That therapist can confirm it — item 26b

| | |
|---|---|
| **Click** | **"Confirmar"** on that pedido |
| **Expect** | it confirms and the row leaves the queue |
| **STOP if** | it refuses with anything other than a conflict message |

Observed: `________________________________`

### C3 · A NON-assigned therapist cannot — item 26c, **the negative arm**

**Do not skip this one.** C1 and C2 alone prove something rendered. Only C3 proves
it was scoped.

| | |
|---|---|
| **Note** | the appointment id of a pedido assigned to a **different** therapist |
| **Open** | `/marcacoes?appointment=<that id>` as this therapist |
| **Expect** | it is **not found** / not actionable — no "Confirmar" you can press |
| **STOP if** | you can confirm another therapist's pedido |

Observed: `________________________________`

> **→ C1, C2, C3 all clean ⇒ `ACC-therapist-queue-unobserved` closes.**

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

# NOT RUNNABLE YET — waiting on `0061`

**Do not attempt these today.** They need migration `0061` applied and `#870`
merged. Listed so you know they are tracked, not forgotten.

| Card | What will be observable |
|---|---|
| `INC-08-double-booking-state-not-path` | A second **Confirmada** on one therapist at one time is refused with **"Este terapeuta já tem uma marcação confirmada neste horário…"** — a pt-PT message, not a database error. This is acceptance **item 18 half two**, and it closes **PG2**. |
| `ACC-13-item20-staff-fanout` | A therapist confirming a pedido now leaves a **notification for reception** instead of the row silently vanishing. Re-run **B1** after the apply; it closes **PG4**. |

**The apply is gated on your read-only pre-check** — `docs/migration-apply-0061.md`
§3. You have already run it once and it returned zero rows.

---

## When you are done

Hand this file back with the boxes filled. Blocks A and C are the two that move
gates. Everything else is bookkeeping that can wait a week without cost.

**Last action of the sweep: disarm `OTP_LIVE_SEND` and write the time into F6.**
