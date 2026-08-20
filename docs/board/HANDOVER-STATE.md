# OsteoJP portal — handover state

**As of 2026-08-20.** Written for the person who hands this build to the clinic
team and to legal, and for anyone who reads it after.

> ## ✅ THE OPEN QUESTION OF 2026-08-17 IS ANSWERED. NOTHING WAS BROKEN.
>
> This block previously warned that reception's Notificações page **might** have
> been failing since 2026-08-15. **It was not, and it never was.**
>
> The question was real: the database table behind the "Pedidos de novos
> clientes" queue was created without the application being granted permission
> to read it, and automated testing proved a database built from our own files
> cannot read it. Against that, the owner had watched the queue work.
>
> **The owner ran the read-only check against the live database on 2026-08-17
> and it came back clean.** The live table has the permissions it needs — it
> picked them up from the hosting platform's defaults when it was created, which
> our own files never recorded. **No page was ever down and no member of staff
> was ever affected.**
>
> **What remains is a housekeeping item, not a fault**: our files should say
> what the live database says, so that any future copy of this system is built
> the same way. That correction is written up and waiting its turn, tracked as
> `GUEST-07`. The original question is closed as `INC-11`.
>
> One thing genuinely worth acting on came out of the same check: the live table
> grants the application **more** permissions than it needs, again from the
> platform's defaults rather than from any decision of ours. Nothing is exposed
> by it — a separate protection, which is switched on, is what actually controls
> who can read a row — but it is on the list for the security review at the end
> of the project, along with a check of the same setting across every table.

---

# Where this build stands, in one paragraph

## ✅ The STAFF PLATFORM is ready for the clinic team to test now.

Reception and therapists can run the diary, the patient records, the fichas and
the notifications. Book it, use it, tell us what is wrong with it.

## ✅ The PATIENT PORTAL is ready for testing too, as of 2026-08-13.

Patients can log in with their telephone number and a code by SMS, see their
appointments, request a booking, and read their documents.

**A defect that stopped almost every patient logging in was found and fixed on
2026-08-13.** A telephone number written in the file the way a person writes one
— **with spaces** — was being turned away: the patient got the text message, typed
the code correctly, and was told it did not work. The fix was applied to the live
database the same day. **A patient whose number is stored the ordinary way now
logs in**, and there is an automatic test that logs in as exactly that kind of
patient on every change, so it cannot come back unnoticed.

**Three things the clinic team should know before demonstrating:**

1. **Reminders do not send yet.** The system is built and the wording approved,
   but sending is switched off. No patient has ever received one.
2. **Staff bookings are location-scoped on both read and write.** A staff member
   sees, and can book into, only the clinics they are assigned to in Equipa. The
   owner sees and books everything. **Until 2026-08-13 only the *seeing* half was
   enforced**, so a receptionist assigned to one clinic could create appointments
   at the other and then never find them again. Both halves are now enforced on
   the server, not just hidden in the form.

   **ASSIGNING A LOCATION IS A MANDATORY ONBOARDING STEP for every staff
   account.** A staff member with *no* assignment is deliberately unrestricted —
   they see and can book everywhere — so that nobody is locked out of the
   application on their first day. That is a ratified design decision, not an
   oversight, and it means **the scoping only protects a staffer once Equipa has
   assigned them a clinic.** Add the location when the account is created.
3. **A patient with a foreign mobile, or no mobile on record, still cannot log
   in.** That is **Decision D, not a defect**: the owner chose a phone-and-code
   login with no password and no magic link, so there is deliberately nothing to
   fall back on. Those patients need a staff-assisted route, which is not built
   yet. If the clinic team reports it as a bug, it is not one — it is the
   decision working as intended, and the missing piece is the staff route.

*Engineering detail is in §3. The two paragraphs above are the whole of what a
non-engineer needs.*

---

**Live board:** https://claude.ai/code/artifact/279ea20f-0b64-4abc-9e64-676803f7740a
**184 cards. 136 shipped, 48 open. Launch readiness 9/9, every launch gate passes.**

> ### A launch gate had been passing on an observation that never happened, 2026-08-20
>
> `PG1` is the sign-in launch condition. It passed on four things the owner
> checked on the live site. **One of the four had not been checked.** On
> 2026-08-12 he ran the second half of one test believing it was the next one;
> the record was written up as though both had passed. The real check happened
> on **2026-08-19**: sign out of the portal, close the tab, reopen it, and land
> on the telephone screen rather than the dashboard. It passed.
>
> **Nothing was wrong with the product and no verdict changes.** The gate still
> passes, now on four genuine observations instead of three plus one imagined
> one. What was wrong was the record, and it was wrong for seven days.
>
> **The contradiction was written down twice and nobody read either copy.** The
> gate's own working notes recorded the truth on the day, in plain words, a few
> lines from the entry that said the opposite. And the checklist the gate cites
> by name had a **blank answer box** for that row the whole time, in a document
> whose first page says "a blank is not a pass". Nothing mechanical reads either.
>
> The rule that follows: **a gate must cite the filled-in line of a checklist,
> and a gate resting on a blank one is unproven no matter what its verdict
> says.** Whether a script can enforce that is now a card of its own.

> ### A card said work was not built, nine days after it was built, 2026-08-20
>
> The **seventh** time this has happened. "Preselect the patient's usual clinic
> when they book" shipped on 2026-08-11 and its card said "not built" until
> today, when it was picked as the next thing to do and checked against the
> repository first.
>
> The check that runs on every change could not have caught it: that check
> follows the pull requests a card *names*, and this card named none, because it
> was written before the work and never touched again. **A green check on the
> board says nothing about this kind of card.** The limit is now written on the
> card that introduced the check, so it is not mistaken for a solved problem.

> ### A lost booking request is no longer silent, 2026-08-20
>
> When a patient books through the portal, the appointment is saved first and
> reception is told second. Telling reception is allowed to fail, deliberately:
> a patient whose booking worked must never be shown an error because the
> clinic's own notification could not be written.
>
> **What was wrong is that failing was silent, and it costs more than a missing
> notification.** That notification is the only record saying "a patient asked
> for this". Without it the appointment looks exactly like one reception made:
> nobody is told to confirm it, and it holds the time slot as though it had been
> confirmed. The request is lost and the slot is taken by nothing.
>
> **It is now loud.** A failure writes an error line naming the appointment and
> saying what it costs, so a lost request can be found and put right by hand.
> **It is not yet prevented**, and preventing it needs a database change plus one
> decision from the owner: should a booking that cannot be recorded as a request
> be refused to the patient? Written up in `docs/QUESTIONS.md` as
> `Q-PEDIDO-EMIT-1`, recommending **no** - fix it with the database change
> instead. The card is marked as waiting on Ivan.

> ### Reception can now turn a guest request into a patient and an appointment, 2026-08-18
>
> The public form at **/marcacao** has been able to take requests for days, but
> reception could only look at them. The action that turns one into a real patient
> and a real booking is now live on **Notificações**.
>
> **It never decides who the person is.** If the phone number already appears on a
> file, reception is asked *"Quem é esta pessoa?"* and must choose - this patient,
> or somebody new. The system will not link a request to an existing medical
> record on a phone-number match, and the button on a flagged row stops being a
> convert and becomes the question instead. Mis-linking a clinical record is the
> worst outcome available here, and no automatic match is worth risking it.
>
> Pressing it creates the patient and hands reception straight to the diary with
> the person, the service, the clinic and the requested date already filled in.
> **It never books the appointment itself** - the slot is chosen by a human, on
> the ordinary booking screen.
>
> **What this depended on.** A permission was missing from the database files that
> build a fresh copy of the system, which is why this sat finished-but-unmergeable
> for three weeks. Production always had the permission, so nothing was ever
> broken for the clinic; the files simply did not say so. That is now corrected
> and applied.

> ### The consultation recording now survives a failed hand-off, 2026-08-18
>
> When a consultation was recorded and sent to the AI partner, **nothing was
> written down on our side until the partner answered.** The recording's location,
> which patient it belonged to, which clinician made it and when it started and
> ended all lived only in the open browser tab. If the hand-off failed, the
> promised retry had nothing to retry from: the audio existed in storage and
> nothing left could say whose it was.
>
> It is now saved before the hand-off is attempted, so a failure is a **retry**
> rather than a loss. A consultation that still cannot be handed over is marked as
> needing attention rather than disappearing quietly.
>
> **Two honest limits.** There is no screen for the needs-attention state yet -
> it is a recorded state and a log line, and the screen is scheduled separately.
> And there is **no backfill**: consultations recorded before this change were
> never persisted anywhere, their audio cannot be matched to a patient, and
> nothing pretends otherwise.

> ### Schedules: there are now THREE ways to set one, added 2026-08-17
>
> 1. **The weekly schedule.** The ordinary recurring week. Unchanged, and still
>    the default for every date not covered by one of the others.
> 2. **Semanas alternadas.** For a therapist who swaps clinic week by week, over
>    a period of up to three months.
> 3. **Dia a dia.** New. For a period that follows no rule at all: pick a start
>    and an end, and every date in between is listed for you to set or leave.
>
> **Inside a "dia a dia" period, what you set is the whole schedule.** A day left
> unticked is a day not worked, not a day left alone — which is why the screen
> lists every date rather than only the ones you fill in.
>
> **Setting a period that already has days set will refuse, and tell you which
> dates are in the way.** Nothing is written when it refuses. Replacing them is a
> second button you press afterwards, with those dates in front of you. That is
> deliberate: it is how the system avoids quietly overwriting a schedule somebody
> entered by hand.
>
> The same refusal now applies to "semanas alternadas". Re-applying a pattern
> over a period it already covered used to leave behind rows that were dead but
> invisible — nothing on any screen was ever wrong because of it, and nothing
> reached a patient, but the schedule table accumulated entries nobody could see.
> Both modes now refuse instead, and neither can produce those rows again.

> **The owner ran the batched acceptance sitting on 2026-08-17: 15 checks, 14
> PASS, 0 STOP, 1 SKIPPED.** Fifteen cards closed on what he saw on the deployed
> build, including alternating-week schedules flipping clinic correctly across a
> week boundary on both the agenda and the patient portal, the reception location
> lock, therapist self-scope, and the guest request queue showing a stated
> preference rather than an invented appointment time.
>
> **The one skipped check is `W13-03`, the patient login screens.** Its checklist
> was not to hand. It is now written out standalone at
> `docs/board/W13-03-ACCEPTANCE-CHECKLIST.md`: five steps, four of them runnable
> today, and the fifth needs a real SMS code so it belongs to the supervised
> launch canary.

> **The clinic team is testing on production.** Defects reported from live use
> are being fixed as they arrive; they are `STAFF-xx` cards on the board.
>
> **Three things reported after the presentation are fixed, all on 2026-08-14.**
>
> **1. Horários crashed for reception.** Opening **Horários** as a
> receptionist assigned to a clinic showed a black page reading "Application
> error". It needed two things at once, which is why it was never seen before:
> the person looking had to be **assigned to a clinic**, and at least one
> therapist had to be assigned to **no clinic at all**. Every account used in
> demonstrations was unassigned, so nobody hit it. **Equipa had the same fault
> for an admin assigned to a clinic**, reported by nobody and fixed in the same
> change. A therapist with no clinic now appears on the schedule page with a
> line saying their schedule cannot be managed there and that a location should
> be assigned in Equipa; they are **not** hidden.

> **PG9 EXPERIENCE closed on 2026-08-13**, on run `31651759598` — shard 3, **72
> passed, 0 failed, 0 flaky, green at attempt 1**. It reddened first, on a real
> patient-facing AA contrast failure, which is the best evidence the gate has.
>
> **PG8 SYNC closed on 2026-08-13, and it was the last gate.** The browser-level
> crossing it was missing is **observed**: a portal booking appears on the staff
> agenda on the day it booked, green at attempt 1 across three independent runs.
> It was held open to the end for **confirmation, not discovery**, and the
> per-hop timing table that was its final outstanding line is committed at
> `docs/recon/W13-07-sync-trace.md` §2.1a. See §1.
>
> **Four defects reported from live staff use on 2026-08-13 are fixed and
> accepted on the deployed build** (PRs #895 to #898): an appointment stored at
> 11:25 displayed as 11:00 in the edit panel, staff could book into clinics they
> are not assigned to, a busy agenda hour cropped its appointments, and a long
> patient name was cut in the Marcações list. The location one is a **behaviour
> change the clinic team must know about**, and it is item 2 of the three above.
> Full detail on the board, cards `STAFF-01` to `STAFF-04`.

> **THE PUBLIC BOOKING FORM FOR NEW CLIENTS IS COMPLETE AND LIVE, AND ITS LINK
> IS NOT YET PUBLISHED.** Complete 2026-08-16. A person who is **not** a patient
> can ask for an appointment at
> **https://osteojp-portal.vercel.app/marcacao**: they choose a clinic, a
> service, a preferred date and a preferred period (morning or afternoon), give
> their name and mobile number, and tick the RGPD acknowledgement. The request
> lands in reception's **Pedidos de novos clientes** queue on Notificações.
>
> **The address works, the form sends, and nothing links to it.** It is not on
> the portal, not on osteojp.pt, not in any navigation. **It is waiting on one
> thing: the owner walking it on the deployed build and accepting it.** The
> address is given to the clinic for publication after that, and not before.
>
> **Two things to say about it plainly, because each is deliberate:**
>
> 1. **It never shows availability.** No therapist list, no times, no "09:30 is
>    free". Somebody with no account cannot learn who works at a clinic or when
>    the building is empty. They say *morning* or *afternoon*, and **reception
>    decides the actual time when they telephone**. Every request is a request;
>    nothing books itself.
> 2. **The screen shown after sending is JP's wording, and it says the
>    appointment is not confirmed.** *"Recebemos a sua solicitação e a mesma
>    encontra-se em análise. O agendamento ainda não foi confirmado; entraremos
>    em contacto assim que estiver na nossa agenda."* That screen makes a promise
>    to a member of the public, so it was the one piece of wording the build was
>    not allowed to invent: it shipped **blank and unsendable** on 2026-08-14 and
>    the form refused every submission until JP's words arrived on 2026-08-16.

---

## 1. Readiness — 9 of 9, all gates passing

| Gate | State | One line |
|---|---|---|
| **PG1 AUTH** | **PASS** | Phone-only OTP login, removed routes bounce, an unregistered number is refused without disclosing whether it is a patient, and a trusted device does not survive sign-out. All four observed on the deployed build. |
| **PG2 BOOKING** | **PASS** | A staff confirm over an existing confirmed appointment is REFUSED — and refused again at the database when the operator deliberately forces "Guardar mesmo assim". |
| **PG3 APPOINTMENTS** | **PASS** | History, cancel and reschedule render for a linked patient; the reminder-link route is live and fails closed on an invalid token. |
| **PG4 NOTIFICATIONS** | **PASS** | A therapist confirming a pedido now leaves a record reception can see, with no service name and no clinical content. The wrong-title defect (INC-09) is **fixed**, pending one screen check. |
| **PG5 REMINDERS** | **PASS** | 48h email and 24h SMS as separate per-channel offsets with the channel inside the idempotency key, and all ten bodies approved. **Reminders are not live** — `REMINDERS_LIVE_SEND` is false. |
| **PG6 EXPOSURE** | **PASS** | 51-row exposure matrix committed; 23 MUST-NEVER rows, every one with a verified enforcement point. |
| **PG7 ENVIRONMENT** | **PASS** | Every environment variable has a safe default or fails loudly at boot; the full four-app estate was walked. |
| **PG8 SYNC** | **PASS** | A portal booking appears on reception's agenda on the day it booked, green at attempt 1 on three independent runs, and the hop-by-hop timing table is sourced at `docs/recon/W13-07-sync-trace.md` §2.1a. **The "invisible row" was never real** — every probe used `isVisible({timeout})`, which playwright-core ignores and answers instantly, so a check written to wait 15 seconds answered in 443ms from an unpainted page. **The product was correct throughout; every failure this gate recorded was in its own instruments.** |
| **PG9 EXPERIENCE** | **PASS** | axe `wcag2a/2aa/21aa/22aa` across eight patient screens at 390×844, plus pt-PT, 24h, one-primary-action, mobile screenshots, and an arm proving the scanner can fail. Green at attempt 1 on run `31651759598`. **It reddened first on a real defect** — the ghost back button at 4.45:1 against a 4.5 floor — and **the gap the human half found is fixed**: every patient dead end now carries the clinic telephone, where before five strings said "contacte a clínica" and no screen said how. |

---

## 2. What closed on 2026-08-12, and on what evidence

**Four gates moved in one day: 3/9 → 7/9.**

| Gate | Evidence |
|---|---|
| **PG1** | Owner observation, deployed build. Items 1, 2, 3 and 15 of the acceptance plan. |
| **PG2** | Owner observation. The pedido confirm was refused and stayed pending; then, with the conflict override **deliberately forced**, the database refused it anyway. That second one is the deployed proof of migration `0061`. |
| **PG4** | Owner observation. A third notification appeared at 14:55, newer than the two 14:47 pedido rows, for the right appointment, with no service name. **A row cannot be produced by an absence** — which matters, because the queue emptying alone would have looked identical with a completely broken fan-out. |
| **PG6** | `docs/recon/W13-06-exposure-matrix.md`, plus `apps/api/lib/exposure/patient-surface.test.ts` (51 assertions, 7 negative arms). Every cited enforcement point was then **read line by line**; four citations were wrong and were corrected. |

**A correction to an earlier statement in this document.** It said the staff
agenda query carries no status filter, so a portal booking appears on it
immediately. That is true of *status* and **not** true unconditionally: for a
**reception or admin** viewer the agenda is also filtered to their **assigned
locations** (`data.ts:202,213`, `viewer-locations.ts:47-51`), which is PL-09
working as designed. A portal booking made at a clinic outside that viewer's
locations is correctly absent from their agenda. This matters to the clinic team
as a **workflow fact**: what reception sees on the agenda depends on which
locations they are assigned to.

**PG8 was halted on purpose, and the halting is the point.** Two CI runs on
2026-08-12 reported it passing. Neither demonstrated the property: the assertion
matched a seeded patient's name and a time, both of which any other spec can
produce on a shared database, so it found somebody else's row and called it the
crossing. Once the assertion was pinned to the exact booked date, it went **red** —
and a red on a correct assertion is worth more than either green was. **A green
obtained by loosening an assertion until it passes is what this gate produced
twice, and it was caught twice.**

### The 2026-08-13 correction to that red, and it is the most transferable finding here

**The pinned assertion was right. The probe behind it could not answer.**

`locator.isVisible({ timeout: N })` — the form every probe in that spec used —
**ignores the timeout**. From the installed playwright-core 1.60.0, verbatim:
*"@deprecated This option is ignored. `locator.isVisible()` does not wait for the
element to become visible and returns immediately."* Wrapped in `.catch(() =>
false)`, a check written to wait 15 seconds answered in zero, from whatever the
DOM held at that instant.

**The timings prove it with no further argument.** Every reading that said
"absent" came back faster than a page can paint; every reading that waited found
the row:

| Run | Time to answer | Answer |
|---|---|---|
| `31635017752` | 391ms | absent |
| `31641934973` | ~400ms | absent to reception **and** to the owner |
| `31649767622` attempt 1 | 443ms | absent |
| `31649767622` attempt 2 | 1683ms | **present** — same commit, same seed |
| `31651759598` attempt 1 | 548ms | **present** — with a probe that waits |

**The "three independent surfaces" were one instrument, called three times.**
Reception, the owner viewer and the patient's own appointment list were three
calls to the same non-waiting probe, and the corroboration they appeared to give
each other is what made a test defect look like a product defect. `INC-10` — the
possible patient-facing booking that never committed — is **closed on this
evidence**. The submit path was correct all along, exactly as the code read said.

**It cost:** PG8 held open, an incident card raised as possibly patient-facing, a
session spent ruling out tenant mismatch and location scope by code read, and a
diagnostic block added and then removed for slowing the suite enough to be
cancelled. All of it downstream of one deprecated option.

**The confirmation arrived the same day.** Run `31652671983`, a different commit,
shard 3: **72 passed, 0 flaky**, direction A green at attempt 1 in 587ms. Two
independent attempt-1 greens on the tightest assertion this spec has ever
carried.

**PG8 held open for one small, named reason, and it closed on 2026-08-13.** The
wave doc's LOOP 7 DoD requires *"the trace names every hop and its timing, in
both directions"* and a **timing table** as evidence. Nine hops were named and
**none was measured individually**. What existed was three end-to-end spans (the
booking submits in ~1.3s, the agenda shows the row in ~0.6s), each crossing a
*group* of hops, and a browser cannot see inside one `fetch`.

**Four of five DoD lines done is a card, not gate credit.** That rule is what
caught this gate's two earlier false greens, and applying it against our own
result is the only way it means anything. It was carded as
`LE-pg8-per-hop-timings` **(high)**, the last thing between the build and 9/9,
and a measurement rather than a discovery.

**How it closed, and what the table does and does not claim.** The timing table
is committed at `docs/recon/W13-07-sync-trace.md` §2.1a. **No instrumentation was
added inside the transaction and none was added to the spec**: the spans were
already being logged by the `timed()` helper, so the table is assembled from runs
that had already happened rather than from a new measurement campaign. It is
**not** presented as nine per-hop figures. A5+A6+A7 is labelled as one grouped
hop, A1/A2/A4 are labelled as inseparable from the browser, and A9 is labelled
unbounded. **Every cell says what it is**, which was the card's own stop
condition: do not close PG8 by re-reading the spans as though they were per-hop
timings.

**PG8, stated without softening, as of 2026-08-13.** The crossing works and is
**observed in a browser**, on the day it booked, at attempt 1, on **three
independent runs from different commits**. The confirmation standard this gate
was held to is not ceremony: it reported passing twice on an assertion that was
matching a neighbour's row, and both greens were withdrawn. The third and fourth
greens were obtained on the tightest assertion the spec has ever carried.

`LE-pg8-e2e-needs-run-scoped-patient` stays open either way. The assertion is
pinned to the booked **date**, so a neighbour would now have to book the same
patient at the same time on the same specific day — materially stronger than
what produced the two false greens, and still not a run-unique identity.

**Migration `0061` was applied to production** and its journal is recorded verbatim
at `docs/migration-apply-0061.md` §10. The next free migration number is **0062**,
unoccupied.

**INC-08, the confirmed double booking, is CLOSED** — mechanism, both wrong
hypotheses, three fixes and the production evidence, all on the card.

---

## 3. The top risks before demonstrating this build

### RISK 0 — RESOLVED 2026-08-13. Most patients could not log in; now they can.
### Kept in full because how it was found and fixed is worth more than the defect.

**`SEC-otp-linkage-exact-phone-match`, closed.** Migration `0062` was applied to
production on 2026-08-13 and PR #888 merged as `4ae5a39`. The journal is recorded
verbatim at `docs/migration-apply-0062.md` §9.

**One thing is still owed and it is not a regression.** The pre-check that would
have counted how many patients `0062` could *not* repair was never run, so nobody
knows whether it fixed everyone or merely most. Those patients could not log in
before `0062` either. A three-integer read-only query is at
`docs/migration-apply-0062.md` §10, and it is cheaper now than it was before
because the column exists and can simply be counted.

**A patient whose telephone number is stored the way a human writes it cannot log
in to the portal.** Not degraded — refused.

**What the patient experiences.** They type their number. **They receive the SMS
code**, because the request endpoint deliberately never touches the patient table.
They type the code correctly. They are refused, with the same single message a
*wrong code* produces — because the API collapses all six failure modes into one
response so the login screen cannot be used to enumerate patients. **So the
screen tells them to check a code they typed correctly.** Decision D removed the
password and the magic link, so there is no other door.

**The mechanism, in two lines of shipped code:**

| Where | What it does |
|---|---|
| `apps/api/lib/auth/patient-linkage.ts:69` | `eq(patients.phone, phoneE164)` — an **exact string comparison** |
| `apps/web/lib/patients/validation.ts:117` | `optionalText()` **trims and normalizes nothing** |

`patients.phone` is free text, and `apps/api/lib/notify/phone.ts` says so in its
own header: *"numbers arrive as `912 345 678`, `00351912345678`,
`+351 912-345-678`, etc."* The **reminders** path calls `normalizePhonePT` on the
stored value before sending, precisely because of this. **The login path does
not.**

**How likely in real data: very.** Every patient in the e2e seed except the new
OTP fixture is stored with spaces. Portuguese numbers are conventionally written
with spaces. Nothing anywhere writes bare E.164 into that column.

**Why no test caught it, and it is the pattern in §5b again.**
`patient-linkage.test.ts` **mocks the database entirely** — its fake `select()`
returns whatever the test set. It proves the query is *assembled* correctly and
**cannot prove it finds anything**. The one DB-gated OTP suite seeds its own
patient spaceless, so it agreed with the code by construction.

**It was found by the first CI run in which the portal's OTP login had ever been
executable.** That path had no automated coverage until the same day, because
`PORTAL_TENANT_ID` was never written to the portal's CI environment — so the
login could not run in CI at all and no test noticed. **One run, one defect.**

**The fix, authorized by the owner on 2026-08-13 and authored the same day.**
Migration `0062` adds `patients.phone_e164`, `GENERATED ALWAYS` from
`patients.phone`, plus an index; the login matches the derived column.

**The number a receptionist typed is never rewritten.** Owner ruling: it is
clinical record data, and annul-never-delete extends to not silently rewriting a
field a person entered. The derived value sits beside it.

**A generated column rather than a trigger or application code**, because it
cannot drift and no write path can forget it. That matters most for the coming
import of ~10,000 legacy records: they normalize on arrival with no import-time
work at all.

**It was pinned in CI before it was fixed, and that is the transferable part.**
`patient-linkage.db.test.ts` asserted the *broken* behaviour as fact and carried
its own instruction — *"IF THIS IS NOW TRUE, THE DEFECT IS FIXED AND THIS TEST
MUST BE INVERTED."* It has been inverted, with two counterweights added: a number
belonging to nobody must still refuse, and a stored number that does not
normalize must still refuse. **An inversion that only proves the new happy path
is half a test** — a normalization too permissive would satisfy it while linking
patients to numbers they do not have, which is worse than the defect fixed.

**The acceptance test runs itself.** The seeded portal patient is stored
`+351 916 000 005`, with spaces, exactly as a receptionist would type it, and the
end-to-end login test drives that patient. It passes in CI because CI applies the
migration itself.

**Applied 2026-08-13, and the acceptance test has run against the real migration
since.** The portal is testable.

---

### RISK 1 — Reception is shown a FALSE event description on a real event
### **FIXED 2026-08-12, pending the owner's screen.**

**`INC-09`, shipped.** A therapist confirming a pedido produces a notification
titled **"Marcação remarcada"** — *appointment rescheduled*. Nothing was
rescheduled.

**Why it matters in a demo:** this is a staff-facing surface that states something
untrue about a clinical appointment. A receptionist acting on it would call a
patient about a change that never happened.

**What is known:** the write is correct — `kind: "confirmed"` is what gets
inserted. The label map has **no `confirmed` case at all** and falls back to
printing the raw database value, so a confirmation should render the literal
English string `confirmed` on a Portuguese screen. **That does not explain
"Marcação remarcada"**, so a third cause is still open and the card says so
rather than guessing. Either way `notifications.kind.confirmed` exists in neither
locale.

**FIXED.** `notifications.kind.confirmed` now exists in both locales, the label
map is exhaustive over the kind union so a sixth kind is a **compile error**, and
the `?? e.kind` fallback that hid the omission is deleted. 15 assertions, 5
negative arms.

**"Marcação remarcada" is a different kind** — `rescheduled` — emitted only by a
patient's own portal reschedule (`booking.ts:721`, the single site repo-wide).
Nothing on the confirm path can produce it, so the row that was read was either a
genuine reschedule or a different row. **`OBSERVE-SWEEP.md` step B3b settles it in
one check on the owner's screen.** If a confirmation still reads "remarcada" after
this ships, that is a second and separate finding.

**Safe to demonstrate the notification centre once B3b passes.**

### RISK 2 — Reminders are NOT live. (The dead-hostname half is FIXED.)

**Two separate facts that are easy to present wrongly.**

`REMINDERS_LIVE_SEND` is **false**. PG5 passing means the reminder *system* is
built and its copy approved — **no patient has ever received one**. The
suppression path has never been observed end to end in a real run.

**RETIRED 2026-08-12, the dead-hostname half.** `apps/portal/.env.example` named
`patient.osteojp.pt`, which does not resolve, and taking it at face value pointed
a running portal at a dead host. It now names the live Vercel host, with the
go-live target, the DNS record needed and the cutover runbook all named inline.

A repo-wide sweep found **13 files** mentioning that hostname; **one** could reach
a running build and it is the one fixed. The other 12 are DNS planning documents,
historical handoffs, and the four board documents that already warn the host does
not resolve. The go-live checklist in `docs/cutover-runbook.md` still curls it,
correctly — that runbook runs *after* the DNS record exists.

`OTP_LIVE_SEND` is armed **for supervised sittings only** and must be disarmed at
the end of each. Its disarm timestamp is still unrecorded.

### RISK 3 — An agenda left open does not learn about a portal booking

**`LE-agenda-does-not-learn-of-portal-bookings`, medium, open.** The portal is a
separate deployment from the staff platform, and `revalidatePath` cannot cross
that boundary. An agenda open on a screen at reception **only** updates when
someone navigates or refreshes.

**It is not a double-booking risk** — the protection is the slot lock and the
`0061` constraint, not the render, and a stale screen cannot create a double
booking. But in a live demo, booking on the portal and pointing at an unrefreshed
agenda will look broken. **Refresh the agenda.**

### RISK 4 — Decision D's patient login has ZERO automated coverage

**`SEC-otp-login-path-has-zero-e2e-coverage`, high, open.** Two facts compose into
a gap:

1. `.github/workflows/e2e.yml:250` writes only `NEXT_PUBLIC_API_URL` to the
   portal's CI environment. **It never writes `PORTAL_TENANT_ID`.**
2. `apps/portal/lib/auth/otp.ts:54-57` reads that variable and **throws** without
   it — deliberately and loudly, per PG7.

**Together they mean the portal's OTP login cannot work in CI, and no test
notices**, because every portal spec signs in through the **trusted-device** door
instead: the seed writes a device row and the setup presents the cookie. That
choice is well-reasoned on its own terms, but its consequence was never stated.

**So the primary patient login — phone, code, session — is exercised by unit
tests and by nothing else automated.** Its only end-to-end coverage has ever been
**Ivan's own sitting**, and **PG1 passed on that observation** rather than on CI.
A point-in-time check with no automated guard behind it does not defend the path
between now and launch.

**It is worse than the 36 skippable suites in one specific way:** those *fail to
prove* and can be un-skipped. **This is a path no test can reach.** There is
nothing to un-skip; the coverage was never possible in this configuration.

The fix is small — write the variable, then drive the real OTP path through the
shipped test sink — and it is the top item in the build queue.

---

## 4. Every open card, by bucket

**70 open of 155**, as of 2026-08-16 after the guest-booking bucket.

### Incidents — 1
**`SEC-otp-linkage-exact-phone-match` (high, halted, launch-blocking)** — most
patients cannot log in. Full write-up at **RISK 0**, §3. Waiting on the owner
because every fix needs a migration.

`INC-09` shipped 2026-08-12; it closes on the owner's screen via
`OBSERVE-SWEEP.md` step B3b. **`INC-10` closed 2026-08-13** — the portal booking
that appeared not to commit did commit; the instrument was wrong (§2).

### Blocked on people — 4
All four need an observation or a signature, not a build.
`ACC-13-results-uncommitted` (ivan) · `ACC-therapist-queue-unobserved` (ivan, needs
a **second therapist test account** that does not exist) · `LE-suppression-observation`
(ivan) · `LAUNCH-02-jp-packet-signoff` (jp).

### Security — 3
`SEC-r-token-no-rate-limit` **(high)** — `apps/web` has no rate limiter at all; the
fix is a port or a shared package. · `SEC-allowconflict-not-audited` **(high)** ·
`SEC-otp-unassigned-prefix-500` (medium) — a 500 on the login endpoint that arrives
by uncaught exception, so every future provider failure falls through the same
crack.

### Test-integrity — 4, and they are why the gates can be trusted
`ACC-vacuous-guard-sweep` **(high)** — 123 assertions that may not be able to fail,
with four triage criteria. · `ACC-skippable-suites-unguarded` **(high)** — 36 suites
can still skip inside a passing required check; the structural fix is **ruled** and
scheduled after PG9. · `LE-board-pr-reconciliation` **(high)** — nothing reconciles
merged PRs against card status; three cards have carried a false one. ·
`ACC-identity-blind-assertions` **(high)** — assertions that match shared
vocabulary (a time, a status, a count) rather than identity on a shared seeded
database. **Worse in kind than a skippable suite: a skip fails to prove, an
identity-blind assertion proves something false.** 170 count assertions triaged;
63 are absence assertions and structurally safe, and the presence set is
dominated by static UI structure. Three genuine candidates, none gate-bearing.

### Wave-13 loops and launch — 23
`W13-06a`, `W13-06b`, the `WF-*` series, `LAUNCH-01` (flag arming),
`LAUNCH-03-client-data-migration`. **`W13-08` shipped 2026-08-13** and closed
PG9. Several `W13-*` and `LE-*` cards sit at `in_flight` **on purpose**: WF-03
rules that a patient-visible loop closes on the owner's deployed screen, not on
green CI.

### Accessibility and test-integrity, added 2026-08-13 — 3
`ACC-gold-700-label-fails-aa` (medium) — the same measurement that reddened PG9
found `v2-gold-700` at **3.94:1** as label text on the staff admin badge. Not
fixed in a portal PR; it is staff-facing. · `ACC-immediate-isvisible-probes`
(medium) — seven more e2e probes treat `isVisible()` as if it waited, the shape
that cost PG8 four runs. · `ACC-preselection-spec-flaky` (medium) — a flaky pass
inside the very run that closed PG9, reported rather than left in the log.

### Loose ends — 27

*(Two policy questions were added on 2026-08-14 and sit in "Blocked on people", not here: whether an unassigned therapist should appear on reception's Horários at all, and whether a therapist should get a Horários entry in their own sidebar. Neither blocks anything; both have a recommended default already shipped.)*
Includes `LE-inc08-survivor-still-confirmed` **(high)** — now resolved in the
production diary, all four test appointments cancelled —
`LE-prod-apply-worktree-loose-scripts` **(high)**, and
`LE-staff-transitions-emit-nothing` (cancel, reschedule and no-show still emit no
notification).

**`LE-ocupado-lists-pending-pedido` closed 2026-08-13 as already fixed**, and it
left this bucket without a code change. The panel it reported (a slot marked
`Ocupado` while the next screen says a request holds nothing) **already routes
through the pedido exclusion** shipped in `be0e1d4` on 2026-08-07. What produced
the report is that **two orthogonal columns both spell the word "pending"**:
`status` is where the appointment is in its lifecycle and is what decides
occupancy, while `confirmation_state` records whether the *patient* answered a
reminder and defaults to `pending` on every appointment ever created. Reminders
do not send, so **every** appointment reads `pending` on that second axis. A
confirmed pedido correctly shows `Ocupado` and correctly shows "Confirmação
pendente" at the same time. Both surfaces were telling the truth about different
questions.

---

## 5. What a reader should know about how these gates were verified

**Read this before trusting any green check on this project.**

Over 2026-08-12 the verification found, in its own work:

- **four wrong citations out of 23** in the exposure matrix — enforcement points
  that pointed at tests which did not prove the row, including one whose mock
  supplied its own answer;
- **a gate-bearing e2e test that SKIPPED inside a passing shard on two
  consecutive runs**, while a PR merged on four green required checks with that
  direction never executed;
- **36 further suites** that can still do the same thing.

**And on 2026-08-13, the one that cost the most:** a probe whose 15-second
timeout **was silently ignored by the library**, so four runs across two days
reported a booking as missing that was there the whole time. It produced an
incident card, two abandoned hypotheses and a held gate before anyone measured
it. Nothing in the code looked wrong — `isVisible({ timeout: 15_000 })` reads at
the call site exactly like a check that waits, **and the call site is what gets
reviewed.**

Two guards now exist: the test **fails rather than skips** in CI, and
`.github/scripts/assert-e2e-executed.mjs` reddens the job from the report
independently. The preferred evidence standard is recorded in
`docs/board/BOARD-SPEC.md`: **any gate row whose property can be disabled by a
flag should carry a CI arm that disables it and requires the check to fail** —
modelled on `slot-lock-concurrency`, which re-runs itself with the lock off on
every commit and requires that run to be red.

**A green check on this project means more than it did yesterday, and less than
it appears to.** The gates above are stated with their evidence so a reader can
check rather than trust.

---

## 5b. One engineering principle, learned the expensive way

**Every instrument this project built to check itself failed in the same way, and
the way is worth more than any of the fixes.**

> **A one-line convenience that maps an unknown or failed case onto a known,
> harmless-looking one will be read as the harmless one. It does not announce
> itself, because the system carries on reporting something reasonable.**

Four instances, all found on **2026-08-12**, all in this project's own
**instruments** rather than in the product it ships:

| The convenience | What it hid |
|---|---|
| `string \| null` | Four distinct failures — a missing service list, a step never reached, an empty calendar, a missing button — returned the same `null`, and the caller skipped on all of them alike. |
| `test.skip()` | A gate-bearing test never ran, inside a **green** shard, on two consecutive runs. A pull request merged on four green required checks with the property untested. |
| `.catch(() => {})` | A broken flow — a date picker that never opened — degraded into "the calendar is empty", which skips instead of failing. |
| `?? e.kind` | A notification kind with no label rendered the **raw database enum** to reception, in English, on a Portuguese screen, instead of failing to compile. |
| `isVisible({timeout})` | **Added 2026-08-13.** A deprecated option the library *ignores*: the probe answered in 443ms instead of waiting 15 seconds, so "the page has not painted yet" was reported as "the appointment does not exist" — across four runs, three surfaces and two days. |

**The fifth one is different in kind, and worth the extra line.** The first four
were written by this project. **The fifth was written by the library**, and the
call site gives no hint: `isVisible({ timeout: 15_000 })` reads exactly like a
check that waits. It is the same failure mode arriving through a dependency —
which means *reading your own code carefully is not sufficient*, and a probe on a
verdict path has to be **proven to wait**, not assumed to.

**Each was one line. Each cost a day.** None was written carelessly; every one
was written to make a program keep going in an unexpected case, which is normally
good engineering. What makes them expensive here is *where* they sat: on the path
that decides whether something is **true**.

**The rule that follows.** On any path that produces a verdict — a test, a guard,
a check, a rendered claim about a clinical event — an unhandled case must
**fail**, not fall back. A fallback is appropriate where the cost of stopping
exceeds the cost of being wrong. On a verdict path, being wrong *is* the cost.

**The practical test**, and it is cheap enough to apply every time: find every
`??`, every bare `catch`, every `| null` return and every default branch, and ask
**what else reaches this**. If the answer is more than one thing, the cases are
being conflated — and the conflation will be read as the benign one, because the
benign one is what the screen or the check reports.

**Why this is in a handover document.** The clinic team will not read it. A
lawyer, a security reviewer or the next engineer will, and it is the most
transferable thing this project has produced: it explains why the gate numbers in
§1 are stated with their evidence, and why several of them were **taken back
down** before being trusted.

---

## 5c. Portal error copy authored under delegated authority — PLEASE READ IT

**Seven patient-facing strings were changed on 2026-08-12 by the build terminal,
under authority delegated for operational error text.** They carry **no
commitment**: no fee, no cancellation term, no consent, no retention, no promise
about response time or outcome. **They have not been reviewed by a Portuguese
speaker and are not approved copy.**

**Please have the clinic team read these in the demo.** Every change is the same
edit — appending a clause the repo already used elsewhere so a dead end offers
something to do:

| Key | Before | After |
|---|---|---|
| `errors.load_appointments_desc` | Ocorreu um erro ao carregar as suas marcações. Tente novamente. | …Tente novamente **ou contacte a clínica.** |
| `errors.load_documents_desc` | …os seus documentos. Tente novamente. | …Tente novamente **ou contacte a clínica.** |
| `errors.load_forms_desc` | …as suas fichas. Tente novamente. | …Tente novamente **ou contacte a clínica.** |
| `errors.load_dashboard_desc` | …a sua informação. Tente novamente. | …Tente novamente **ou contacte a clínica.** |
| `errors.load_account_desc` | …os seus dados. Tente novamente. | …Tente novamente **ou contacte a clínica.** |
| `booking.load_error_description` | …a oferta de marcação. Tente novamente. | …Tente novamente **ou contacte a clínica.** |
| `errors.404_body` | A página que procura não existe. | …existe. **Se precisar de ajuda, contacte a clínica.** |

English equivalents changed in step. **"ou contacte a clínica" is not new
wording** — it is already committed in `otp_refused` and `booking.no_slots`. Only
`404_body`'s "Se precisar de ajuda" is a phrase this repo had not used before,
and it is the one most worth a second opinion.

**TWO MORE STRINGS ADDED 2026-08-13, under the same delegated authority and
carrying the same no-commitment guarantee.** They are the booking confirmation
screen's new fail-closed state (`SEC-pending-screen-asserts-nothing`): the screen
used to say *"Pedido recebido"* to anyone who navigated to it, including after a
**failed** submit, and now refuses to claim a booking it cannot verify.

| Key | New string |
|---|---|
| `booking.pending_unverified_title` | Não encontrámos este pedido |
| `booking.pending_unverified_body` | Não conseguimos confirmar este pedido de marcação. Se acabou de o fazer, veja as suas consultas. Caso contrário, contacte a clínica. |

**No fee, no cancellation term, no consent, no retention, no promise about
response time or outcome.** Please have the clinic team read these two alongside
the seven above.

**And the numbers are now on the screen.** Every one of those surfaces renders the
clinic telephones as `tel:` links from a single source, `apps/portal/lib/clinics.ts`.
Before this, five strings told a patient to contact the clinic and no screen said
how.

**`403`, `500` and `offline` were left alone deliberately.** Those strings are
rendered by nothing in the portal — a patient cannot reach them — so writing copy
for them would be dead weight. Recorded rather than quietly skipped.

> ### Two of the four things you looked at on 2026-08-19 are now closed
>
> You ran a four-item sitting on the deployed screens. **Three items were
> observed and all three passed. The fourth had nothing to look at**, which is
> recorded as not run rather than as a pass.
>
> **The public booking form now names each clinic beside its own telephone
> numbers**, and you confirmed the blocks match what osteojp.pt/contactos
> publishes. That external check is the one worth having: our own test only
> proves the screen renders the file, and only the live site could prove the file
> is right.
>
> **The service list on that form now differs by clinic**, and each list matches
> what Administração > Serviços marks as offered at that clinic. **Rodica
> confirmed the price grid and owns it from here.** That matters more than it
> sounds: a service with no active price row at a clinic is now ABSENT from the
> public form. That is the configuration's own meaning, but it means the public
> form is only as complete as the grid, and no automatic check on our side can
> read production data to tell whether it is. If a service ever goes missing, the
> fix is a price row in Serviços, not a change to the software.
>
> **The staff header greets you by the name on your staff record**, not by a name
> guessed from your email address.
>
> **The fourth item, the AI unrecognised-fields notice, could not be checked**:
> no record currently carries a field the ficha has no home for, so there was no
> notice to see. Seeing nothing does not prove the notice works and does not prove
> it is broken. It stays on the list until a record with one arrives.
>
> One new item was written down while reviewing the above, and **it is a question,
> not a defect**: the staff booking screen still offers every active service at
> every clinic, while the public form and Administração > Serviços both go by what
> is priced where. That may well be right for staff, who book exceptions. Nobody
> has decided it, so it is now written down to be decided rather than left as an
> accident.

---

## 6. Where to look

| What | Where |
|---|---|
| Live board | the artifact URL at the top |
| Board data | `docs/board/portal-board.json` (validate: `node docs/board/validate-board.mjs`) |
| How to boot a session | `docs/board/PORTAL-REHYDRATE.md` |
| Process lessons and their prevention | `docs/board/LEARNINGS.md` |
| Test accounts and their **display names** | `docs/board/FIXTURES.md` |
| The observation sweep | `docs/board/OBSERVE-SWEEP.md` |
| PG6 exposure matrix + citation audit | `docs/recon/W13-06-exposure-matrix.md` |
| PG8 sync trace | `docs/recon/W13-07-sync-trace.md` |
| `0061` applied proof | `docs/migration-apply-0061.md` §10 |
| `0063` applied proof | `docs/migration-apply-0063.md` §5 (apply) and §6 (read-only re-check the day after) |
