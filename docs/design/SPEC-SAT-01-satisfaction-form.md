# SPEC SAT-01: the satisfaction form after a visit

**Status: SPEC ONLY. NOTHING IS BUILT, NO MIGRATION IS AUTHORED.** This document
adds no product code, no schema change, no flag and no dependency. Every patient
and staff string is in the companion file `docs/design/SAT-01-copy-pt.md`.
~~It goes to JP for review before any app pull request opens.~~ *Superseded
2026-10-02 by S-1002-D S9a:* JP approved its sections A to G and its timing
block on 2026-10-02, and the new text 7 the same day. All patient-facing texts
are approved.

Author: SOLO, 2026-09-29, measured on `origin/main` at `f8b3f32d`. Board card:
`SAT-01-satisfaction-form`.

**Amended 2026-10-02** by SOLO to strategy's dispatch S-1002-D, item P3.1:
rulings S1 to S12 and S9a, quoted verbatim in section 3.4, with the build order
of the same dispatch. A decision they replace is kept and marked "superseded
2026-10-02 by S-1002-D <Sn>", never deleted. The migration number moved one day
earlier, by S-1001-A R2: SAT-01 is `0101`. Where this amendment had to choose
something no ruling decides, the text says "SOLO's reading, not a ruling", so a
reader can tell the two apart. Section 4 was not re-measured for the amendment.

**The name (S1).** In every Portuguese string the feature is the "Avaliação de
satisfação" (plural "Avaliações de satisfação", never bare "Avaliações", which on
this platform means the clinical evaluations). This English document keeps
saying "the survey"; the English strings say "satisfaction survey" (copy file,
section English).

## 0. The one-paragraph answer

After a visit is closed (Estado set to Concluída), the patient receives one
message, 24 hours after the visit ends, by email when a permitted email exists
and otherwise by SMS, never both (S3, S6). The automatic send is skipped when any
send, manual or automatic, exists for that patient in the last 60 days (S3).
Staff can also send it with an "Enviar avaliação" button on the patient profile
and in Comunicações: it attaches to the patient's most recent concluded
appointment, is not blocked by the 60-day rule, names the channel before
sending, and shows who sent what, by which channel, and whether it was answered
(S4, S5, S6). The message carries a single-use link, valid for 14 days, to a
guest page with three questions and one unticked contact box: a 0 to 10
recommendation score (the NPS question), a 1 to 5 satisfaction rating, an
optional comment, and "may we contact you about your answers". Opening the link
saves nothing; only the submit button saves. The answers carry the patient's
identity and are readable, enforced in RLS, by the therapist who attended the
appointment within their own clinics, by reception and admins for appointments
at their clinics, and by the owner; by no other therapist (S7). The patient can
opt out on the page, in the portal, or through staff on the patient profile, and
no send path overrides it (S8). The message replaces the post-visit "thank you,
book your next visit" message that has been switched off since 2026-09-04. The
database half is one held Tier C migration, `0101`. The app half is seven pull
requests, each sending nothing to a patient while a SAT live-send flag, off by
default, stays off; the owner turns it on after a supervised canary send to a
ZZ TESTE patient (section 7.5).

The paragraph as written on 2026-09-29. *Superseded 2026-10-02 by S-1002-D S4
(manual send), S7 (who reads), S8 (opt-out) and S9a (JP's review is done), and
2026-10-01 by S-1001-A R2 (the number):*

> After a visit is closed (Estado set to Concluída), the patient receives one
> message, 24 hours after the visit ends, by email or SMS depending on what the
> patient allows. It carries a single-use link to a guest page with three
> questions and one unticked contact box: a 0 to 10 recommendation score (the NPS
> question), a 1 to 5 satisfaction rating, an optional comment, and "may we contact
> you about your answers". Opening the link saves nothing; only the submit button
> saves. The answers are readable by the owner and admins only. The message
> replaces the post-visit "thank you, book your next visit" message that has been
> switched off since 2026-09-04. The database half is one held Tier C migration
> numbered `0100`; the app half is three pull requests that open only after JP has
> reviewed the copy.

## 1. What it is for

The clinic has no measure of how patients rate a visit. SAT-01 gives the clinic
two numbers per answered visit (recommendation 0 to 10, satisfaction 1 to 5), an
optional comment, and a record of whether the patient agreed to be contacted
about it. It is a management tool, not a clinical one: nothing it collects enters
the registos, a clinical record or any clinical screen.

As written on 2026-09-29, *superseded 2026-10-02 by S-1002-D S7 and S11*: "gives
the owner two numbers" (S7 gives them to the attending therapist, reception,
admins and the owner) and "nothing it collects enters the ficha" (S11 lists the
patient's sends and answers in their own section of the patient profile, to the
roles S7 allows; it is still not a clinical record).

## 2. Who sees what

The S7 visibility is enforced in RLS, not only in the app. "Their clinics" is
`public.viewer_location_ids()` (0073), read against the appointment's
`location_id`.

| What | Owner | Admin | Reception | Therapist | Patient |
|---|---|---|---|---|---|
| An answer (scores, comment, contact consent), in the Comunicações list and the patient profile (S7, S11) | every clinic | appointments at the admin's clinics | appointments at the receptionist's clinics | only appointments the therapist attended, and only at the therapist's own clinics; no other therapist | only while filling the form |
| A send's status: date, sent by a named person or "automático", channel, answered or not (S5) | every send | sends for appointments at their clinics | sends for appointments at their clinics | sends to patients they treat | no |
| The "Enviar avaliação" button (S4) | yes | when the patient's most recent concluded appointment is at their clinics | same as admin | patients they treat (`viewer_treated_patient_ids()`, 0074) | no |
| The patient's survey switch, see and change (S8) | yes, patient profile | yes, patient profile | yes, patient profile | no | yes: the portal account page, and the page's opt-out button |
| The survey page `/s/<code>` | n/a | n/a | n/a | n/a | the holder of the link, once |
| Survey codes | nobody reads them; they are stored only as a keyed hash | | | | |

**SOLO's readings in this table, not rulings:**

* **A send's status follows S4's roles, not S7's.** S5 shows the status next to
  S4's button, so whoever may press the button sees what was last sent, by whom,
  by which channel, and whether it was answered. Whether is not what: the
  answer's content stays under S7. The consequence, stated so nobody reads it as
  a bug: a therapist who treats a patient whose most recent concluded
  appointment was with a colleague may send for it and will see "Com resposta",
  but not the answer (copy text 81).
* **"Reception and admin at their clinics" (S4) is read against the appointment
  the send attaches to**, the same basis S7 uses for their reads, so the sender
  can read the answer.
* **The therapist who attended** is either practitioner of the appointment
  (`practitioner_id` or `practitioner_2_id`), as `viewer_treated_patient_ids()`
  reads them: a shared NESA visit has two attending therapists.
* **Staff with no clinic assignment read nothing** under the clinic arms:
  `viewer_location_ids()` returns an empty array. The patients policy's "no
  assignment means every clinic" branch (0047) is not copied, because S7 says
  "at their clinics".
* **The staff switch roles** are the O1 (c) proposal (owner, admin, reception);
  S8 turns the toggle on and does not name its roles.

The table as written on 2026-09-29. *Superseded 2026-10-02 by S-1002-D S7 (who
reads), S8 (the switch) and S11 (the patient profile):*

> "Owner and admin only in v1" is the owner's ruling (section 3). The admin column
> carries one open question, O2 in section 11.
>
> | What | Owner | Admin | Therapist | Reception | Patient |
> |---|---|---|---|---|---|
> | The staff list of answers | yes, every clinic | yes (scope: O2) | no | no | no |
> | A single answer's comment | yes | yes (scope: O2) | no | no | only while filling the form |
> | The patient's survey switch (see and change) | only if O1 (c) is ruled | only if O1 (c) is ruled | no | only if O1 (c) is ruled | yes, in the portal |
> | The survey page `/s/<code>` | n/a | n/a | n/a | n/a | the holder of the link, once |
> | Survey codes | nobody reads them; they are stored only as a keyed hash | | | | |
>
> A therapist never sees their own ratings (default 5). The staff list shows the
> therapist and clinic of each appointment to the owner and admins, because the
> ruling is "answers per appointment".

## 3. The ten defaults, as ruled, and the rulings of 2026-10-02

### 3.1 The sources

* **The proposal.** SOLO's SAT-01 proposal, delivered in the SOLO report of
  2026-09-27 for dispatch 6 (item B15), section "Open questions, with proposed
  defaults". It is not in the repository; this document is its first committed
  copy. The board card's notes point to it: "Ten open questions with defaults
  are in the SOLO report of 2026-09-27."
* **The ruling.** The owner's dispatch of 2026-09-27, verbatim: "Every default
  in your report accepted; [...] SAT-01 to its ten defaults, owner and admin
  only in v1." Recorded on the board card: "The owner ruled SAT-01 to its ten
  defaults, with the answers readable by owner and admin only in v1."
  *"Owner and admin only in v1" is superseded 2026-10-02 by S-1002-D S7.*
* **The build instruction, same dispatch, verbatim:** "B15 SAT-01, after B17,
  built to the ten defaults: migrations numbered after 0098, held; the guest
  page /s/<code> on the 0072/0074 pattern; the message replaces the
  switched-off 24-hour one; a separate survey switch on by default; owner and
  admin list of answers per appointment; JP's copy review file [...] with the
  SMS under 160 ASCII characters." *Its "owner and admin list" is superseded
  2026-10-02 by S-1002-D S7.*
* **The numbering.** The owner's dispatch of 2026-09-27 (later), verbatim:
  "0099 registo fix, SAT-01 from 0100." Recorded in `CLAUDE.md` ("`0100`
  onward | SAT-01's migrations") and `packages/db/migrations-pending/README.md`.
  *Superseded 2026-10-01 by S-1001-A R2*, strategy's words: "Numbering: this is
  0100 (catalog-only pilot of the SET LOCAL gate). SAT-01 becomes 0101, the
  episode-policy item 0102." `CLAUDE.md` now reads "`0101` onward | SAT-01's
  migrations".
* **Today.** The owner's dispatch of 2026-09-29, verbatim: "SAT-01 starts:
  spec from 0100, copy in pt-PT sent to the owner for JP's review before any
  UI PR. No DB change without a held PR." *"From 0100" is superseded 2026-10-01
  by S-1001-A R2; JP's review is done (S9a).*
* **The amendment.** Strategy's dispatch S-1002-D of 2026-10-02, item P3.1,
  section 3.4.

### 3.2 The ten, quoted from the proposal

| # | Question | Ruled default, verbatim | Where this spec applies it | After S-1002-D (2026-10-02) |
|---|---|---|---|---|
| 1 | When to send | "24 hours after the visit ends. (The June draft said 3 days.)" | 5.1 | Confirmed by S3 for the automatic send. A manual send (S4) goes when staff press the button. |
| 2 | How often | "no more than one survey per patient every 60 days." | 5.1, 6.6 | Amended by S3: any send, manual or automatic, in the last 60 days skips the automatic send. Not applied to a manual send (S4). |
| 3 | Channel when the patient allows both | "email only. SMS only when there is no email." | 5.1 | Confirmed by S6, which adds the dialog that names the channel and the SMS cost line before a manual send. |
| 4 | A separate survey switch for each patient | "yes, on by default, and the patient can change it in the portal." | 5.3, 6.2, 7.4 | Extended by S8: also the page's opt-out button and the toggle on the patient profile. No send path overrides it. |
| 5 | Who sees the answers | "the owner and admins. Therapists do not see their ratings." Narrowed by the ruling to "owner and admin only in v1". | 2, 6.5 | **Superseded 2026-10-02 by S-1002-D S7.** |
| 6 | How long a code works | "14 days after the visit." | 6.3, 6.6 `resolve_survey_code` | **Superseded 2026-10-02 by S-1002-D S4**, read with the build order's "single-use 14-day token": 14 days from the send. SOLO's reading, not a ruling: counted from the visit, a manual send made 14 or more days after the visit would arrive dead. For the automatic send the two differ by one day. |
| 7 | The old "book your next visit" line | "removed. The survey message replaces it." | 7.1 | Unchanged. |
| 8 | Alert on a low score (0 to 6) with contact allowed | "no alert in version 1, only the list." | 8 | Unchanged. |
| 9 | The second patient on a shared NESA visit | "no survey in version 1, the same as today." | 5.1, 8 | Unchanged. |
| 10 | How long answers are kept | "comments deleted after 24 months, scores kept." | 6.7 | Confirmed by S12. |

All ten were found verbatim. None is unsourced.

### 3.3 The proposal's form, also accepted

The four items of the form, from the same proposal: "From 0 to 10, how likely
are you to recommend OsteoJP to a friend or family member? (This is the NPS
question.)", "From 1 to 5, how satisfied are you with this visit?", "Is there
anything you want to tell us? (optional, free text)", and "A box, empty by
default: 'I agree that OsteoJP may contact me about my answers.'" Also: "Opening
the link saves nothing. Only the 'Enviar' button saves. Each code works once.
[...] Like the confirm page, it never shows the therapist or the service."
S2 keeps the NPS question, its two extremes, text 16 and text 17.

### 3.4 The rulings of 2026-10-02 (S-1002-D, P3.1)

Strategy's words, character for character. Preface of the same dispatch: "JP
approved sections A to G and the timing block of SAT-01-copy-pt-for-JP.md on
2026-10-02."

| # | Ruling, verbatim | Where this spec applies it |
|---|---|---|
| S1 | Name: "Avaliação de satisfação" everywhere the copy says "Questionário de satisfação"; plural and short forms follow ("Avaliações de satisfação"; tab label "Avaliações de satisfação", never bare "Avaliações", which means clinical evaluations). | the copy file throughout; 7.3 |
| S2 | NPS question and its two extremes: kept. Text 16 (health note): kept. Text 17 (contact consent): kept. | 3.3; copy texts 8 to 10, 16, 17 |
| S3 | Automatic send: 24 h after an appointment is Concluída, at most one per patient per 60 days, skipped when any send (manual or automatic) exists in the last 60 days. | 5.1, 6.6 |
| S4 | Manual send: a button "Enviar avaliação" on the patient profile and in Comunicações. It attaches to the patient's most recent concluded appointment; disabled with a reason when there is none, when the patient opted out, when no permitted channel exists, or while an unanswered link is still valid. A manual send is not blocked by the 60-day rule. Allowed roles: the therapist for patients they treat, reception and admin at their clinics, owner. | 2, 5.4, 6.3, 6.6, 7.6 |
| S5 | Send status, shown next to the button and in the list: "Último envio: <date>, por <name>" for manual, "automático" for automatic, plus channel and answered or not. Stored per send: time, sender or automatic, channel, appointment. | 5.5, 6.3, 7.3, 7.6 |
| S6 | Channel: email when a permitted email exists, otherwise SMS, never both. Before a manual send the dialog names the channel; when it is SMS it says so and that SMS has a cost. The system still refuses an SMS that does not fit one message. | 5.1, 5.4, 9.2 |
| S7 | Answers carry the patient's identity. Visibility (JP), enforced in RLS, not only in the app: the therapist who attended the appointment, within their own clinics; reception and admin for appointments at their clinics; owner all. No other therapist. | 2, 6.5, 9.1 |
| S8 | O1 is on: opt-out on the page, the toggle in the patient profile and in the portal account page. No send path overrides it. | 5.3, 7.4, 7.8 |
| S9 | Text changes forced by S3, S4 and S7, written by you in the same style: text 7 becomes "As respostas são identificadas e lidas pela equipa da clínica onde foi atendido, incluindo o seu terapeuta." (the owner is getting JP's approval of this one line); text 34 covers manual sends; text 38 and the section F heading state the new visibility; new strings for the button, the dialog, the disabled reasons and the status line. Update docs/design/SAT-01-copy-pt.md and the spec; list every changed or new string in the report. | the copy file, texts 7, 34, 38, the section F heading, and 61 to 81 |
| S9a | JP approved the new text 7 on 2026-10-02 ("Aprovado", relayed by the owner). Record the approval in the spec and the copy file. All patient-facing texts are now approved; the only remaining gate on live sending is the owner turning the flag on after the ZZ TESTE canary. | this header; 5.1; 7.5; the copy file's approval section |
| S10 | English: translated from the approved pt-PT, published without a second review. | 7.1; the copy file, section English |
| S11 | Patient profile: a section listing that patient's sends and answers, to the roles S7 allows. | 1, 2, 7.7 |
| S12 | Comment retention 24 months as specified. | 6.7 |

**The build order, same dispatch, verbatim:**

> - 0101: tables; RLS per S7; the two SET LOCAL lines; a document with the R9 arm; pre-check and post-check; a behaviour check per role (therapist own, therapist other, reception own clinic, reception other clinic, admin, owner, anon). Tier C.
> - App PRs, each no-op for patients until a SAT live-send flag that is OFF by default:
>   - guest page with a single-use 14-day token;
>   - the automatic job;
>   - the manual send with S5 status;
>   - the list in Comunicações;
>   - S11;
>   - the portal toggle;
>   - O1.
> - The first live send is a supervised canary to a ZZ TESTE patient. The owner turns the flag on after the canary.
> - Platform Guide: one lesson "Avaliação de satisfação" (how to send, where the status shows, who sees answers), stating: SMS is paid and used only when the patient has no email; always collect the patient's email.

Section 10 is this order as pull requests.

## 4. What exists today (measured at `f8b3f32d`)

Not re-measured for the 2026-10-02 amendment. Each app pull request re-reads the
lines it cites before citing them.

There is no "Concluir consulta" button. A visit is closed by setting Estado to
Concluída, from the agenda drawer or the patient file; both call the same server
action.

| Piece | Where | What it does today |
|---|---|---|
| Closing a visit | `apps/web/lib/scheduling/actions.ts:1407` `updateAppointment`; post-commit enqueue at `:1937` | Writes the status, then enqueues status notifications. A series save can complete several rows; each gets its own event. |
| Event | `apps/web/lib/scheduling/reminders.ts:125-127` maps `completed` to `enqueueFollowUp`; `apps/web/lib/reminders/index.ts:68-78` emits `appointment/completed` (`inngest/client.ts:49`) | |
| **The send hook** | `apps/web/lib/reminders/inngest/functions.ts:167-183` `sendFollowUpNotification` | Sleeps until `endsAt + 24h`, then calls `dispatchFollowUp`. Idempotency key `appointmentId + ":follow_up"`. |
| The follow-up dispatch | `apps/web/lib/reminders/dispatch.ts:979-1025` `dispatchFollowUp` | Guards: patient not soft-deleted (`loadDispatchable`, `:541`), status still `completed`, a contact exists. Sends email AND SMS when both are allowed (`:992-993`). |
| The follow-up is dark | `apps/web/lib/reminders/notification-registry.ts:249-268` | `follow_up.email` and `follow_up.sms` are `approved: false` since 2026-09-04 (INC-followup-ignores-a-future-booking, owner ruling B). The run still fires and records `outcome = 'suppressed'` in `reminder_dispatches` (0075). |
| Follow-up copy | `apps/web/lib/reminders/templates.ts:514-545` | "Marcar proxima consulta" in the SMS. |
| SMS rules | `templates.ts:346` `SMS_SEGMENT_LIMIT = 160`; `:418` `assertSmsCompliant` | One GSM-7 segment or the render throws. House rule: no accents in SMS. |
| Confirm code pattern | migrations `0072` (table, resolve door) and `0074` (issue, withdraw, consume doors); `apps/web/lib/reminders/confirm-code.ts`, `confirm-code-store.ts`, `confirm-redeem.ts` | Code stored as an HMAC only, 8 base64url characters, SECURITY DEFINER doors granted to `authenticated` alone, the tenant proven inside each door. |
| Confirm guest page | `apps/web/app/c/[code]/page.tsx`, `actions.ts` | Opening renders and never consumes; unknown, expired and spent codes render the same page (SR-30); date, time and location only; `noindex`; durable rate limit `RULES.tokenRedeem` (10 per minute, `packages/rate-limit/limiter.ts:312`). |
| Patient channel switches | `packages/db/src/schema.ts:894` `reminder_sms_enabled`, `:905` `reminder_email_enabled` (both default true) | Patient-editable through column grants (0019, 0082) and the portal account screen (`apps/portal/app/portal/account/AccountView.tsx:175-176`). |
| SMS STOP | `apps/web/lib/reminders/inbound-reply.ts:244-257` | Sets `reminder_sms_enabled = false`. |
| Guest consent with a version label | `packages/i18n/src/intake-consent.ts`; `guest_clinical_intakes` (0087) | A label names the text shown; old labels are never edited. |
| Owner-only purge with audit | `0087` `purge_expired_guest_intakes(p_tenant_id)`; driver `apps/web/lib/guest-intake/retention.ts` | Per tenant, refuses a NULL tenant, one audit row per purged row, EXECUTE revoked from every app role. |
| RLS helpers | `public.jwt_tenant_id()` (0001, 0012), `public.jwt_role()` (used by 0045), `public.viewer_location_ids()` (0073), `public.viewer_treated_patient_ids()` (0074, either practitioner column) | |

Gaps that SAT-01 inherits and does not fix in v1:

* **"Corrigir estado" to Concluída enqueues nothing** (`correctAppointmentEstadoAction`,
  `actions.ts:2489`), so it sends no automatic survey either. Section 11, O8.
  Since S4, staff can still send one by hand: the manual send attaches to the
  most recent appointment whose status is `completed`, whichever path set it.
* **The NESA second patient** (`appointments.patient_2_id`) is not read by the
  dispatch, which loads one patient. Default 9 keeps it that way, for both
  sends.
* **Appointments have no episode link**, so the June draft's "first visit of
  each episode only" cannot be built. Default 2 replaces it with a 60-day
  cooldown, amended by S3.

## 5. The patient-facing flow

### 5.1 The automatic send (S3)

1. Staff set Estado to Concluída. Nothing new happens at that moment.
2. 24 hours after the appointment's `ends_at` (default 1, S3), the existing
   Inngest function wakes. **Its function id and idempotency key stay
   unchanged**, so a run already sleeping when the app PR deploys wakes into the
   new code rather than being orphaned.
3. The survey dispatch (replacing `dispatchFollowUp`, default 7) sends nothing
   unless every one of these holds, and records a `reminder_dispatches` row with
   `outcome = 'suppressed'` and the reason when one fails (`suppression_reason`
   is free text, so no migration is needed for new reasons):
   * **the SAT live-send flag is on.** It is off by default, its name is fixed
     in the first app pull request, and turning it on is the owner's (Tier D),
     after the ZZ TESTE canary (S9a, 7.5). The registry entries `survey.email`
     and `survey.sms` enter with JP's approval of 2026-10-02 recorded (S9a), so
     the flag is the one gate on live sending. ~~The registry entry for the body
     is approved (JP's approval; the entries enter `approved: false`).~~
     *Superseded 2026-10-02 by S-1002-D S9a.*
   * the patient is not soft-deleted and the appointment is still `completed`;
   * the patient's survey switch is on (default 4, S8);
   * a channel is allowed: **email if the tenant's email reminders are on, the
     patient's email switch is on and an email exists; otherwise SMS under the
     same three conditions for SMS; never both** (default 3, S6);
   * the recipient is `appointments.patient_id` only, never `patient_2_id`
     (default 9);
   * the database issues the send: `issue_survey_automatic` refuses when **any
     send, manual or automatic, exists for the same patient in the last 60
     days** (S3). The rule is decided inside the database under a per-patient
     lock, so two runs waking together for one patient (a series completed in
     one save), or an automatic run waking while staff send by hand, produce one
     send, not two. ~~Refuses a second code for the same appointment, and
     refuses when the same patient was sent a survey in the last 60 days.~~
     *Superseded 2026-10-02 by S-1002-D S3: the 60-day rule now counts manual
     sends, and it already covers a second automatic send for the same
     appointment.*
4. **Order of work, from INC-CONFIRM-07:** generate the code (touches nothing),
   render the body that carries it (a render that throws costs no row), then
   issue the send, then hand the body to the provider. A code is never minted in
   front of a throw. The same order holds for the manual send (5.4).
5. The SMS line is `Responder: <host>/s/<8 characters>`, bare host, the host
   read from the same variable the confirm link uses (`confirm-code.ts:68`,
   `REMINDERS_RESCHEDULE_BASE_URL`). The email carries the full link. The
   system refuses an SMS that does not fit one message (S6): the render throws
   and nothing is issued.

### 5.2 The page `/s/<code>`

Built on `apps/web/app/c/[code]/` and keeping its rules:

* **Opening performs nothing.** The render calls `resolve_survey_code` and never
  writes. A mail scanner following the link spends nothing.
* **Unknown, expired, spent and no-longer-eligible codes render one identical
  page** (SR-30). The page does not say which it was.
* **A code lives 14 days from its send** and works once (the build order's
  "single-use 14-day token"; 3.2 row 6). ~~14 days after the visit~~
  *(superseded 2026-10-02 by S-1002-D S4).*
* **The visit date only.** No therapist, no service, no time, no clinical
  content, no patient name. Text 7 tells the patient that the answers carry
  their identity and who reads them (S7, S9).
* `force-dynamic`, `robots: noindex, nofollow`, the same `Shell` and brand
  lockup.
* The form: question 1 (0 to 10, required), question 2 (1 to 5, required),
  question 3 (comment, optional, at most 1000 characters), the contact box
  (unticked), the submit button, and a separate "stop sending me surveys"
  button (O1, on by S8).
* **The POST** checks the code's shape first, then the durable rate limit keyed
  on the server-side IP (the confirm page's rule), then calls
  `submit_survey_response` or `opt_out_survey`, and redirects to an outcome
  flag. Field values never enter the URL, a log line, Sentry or
  `analytics_events`.
* Outcomes: answer recorded; opt-out recorded; the generic invalid page. A
  second submit of a spent code gets the generic page.

### 5.3 The patient's survey switch (S8)

On by default (default 4). The patient turns it off in three ways, all three on
by S8:

* in the portal account screen, a third switch beside the two reminder switches
  (default 4);
* on the survey page, the "stop sending me surveys" button;
* by asking the clinic: staff turn off the toggle on the patient profile (owner,
  admin and reception, the O1 (c) proposal; S8 does not name the roles).

**No send path overrides it (S8).** With the switch off, the automatic send is
suppressed with its reason and the manual button is disabled with copy text 71;
the manual door refuses it too, so a stale screen cannot send.

As written on 2026-09-29, *superseded 2026-10-02 by S-1002-D S8*: the page
button was "O1; not in the ten defaults, recommended", and the staff toggle
existed only "if the owner rules a staff toggle on the patient file (O1)".

Turning surveys off never touches `reminder_sms_enabled` or
`reminder_email_enabled`. SMS STOP is unchanged: a STOP the clinic receives
stays a channel-wide instruction (R11 legal precedence, `inbound-reply.ts`) and
therefore also stops survey SMS. Whether a reply can reach the clinic at all
depends on the sender (`reply-capability.ts`), which SAT-01 does not change.

### 5.4 The manual send (S4, S6)

* **The button** "Enviar avaliação" (copy text 61) sits on the patient profile,
  in the section of copy text 58, and on the Comunicações list (7.3).
* **Who may press it (S4):** the therapist for patients they treat
  (`viewer_treated_patient_ids()`, 0074); reception and admin at their clinics
  (the appointment the send attaches to is at one of `viewer_location_ids()`;
  SOLO's reading, section 2); the owner. Every other role gets no button and
  the door refuses it.
* **What it attaches to:** the patient's most recent appointment whose status
  is `completed` (latest `ends_at`), with the patient as `patient_id`, never
  `patient_2_id` (default 9). The door finds it; the caller never names it.
* **Disabled, with the reason shown (copy texts 70 to 73), when:** there is no
  concluded appointment; the patient opted out (S8); no permitted channel
  exists (the same channel rule as 5.1, S6); or a send to this patient is
  unanswered and its link is still valid (sent less than 14 days ago, not
  consumed).
* **Not blocked by the 60-day rule (S4).** A manual send does count toward the
  next automatic one (S3).
* **The dialog (S6)** names the channel before anything is sent: copy text 63
  for email; for SMS, copy text 64 says it goes by SMS and text 65 that SMS has
  a cost. The patient's address is not shown in the dialog.
* **The SMS that does not fit one message is still refused (S6)**, in the same
  order as 5.1 step 4: the render throws, no send is issued, and the dialog
  shows copy text 69.
* **The flag governs it too:** while the SAT live-send flag is off, a manual
  send reaches no patient, except the canary of 7.5.
* **The server works out the button's state, and the door decides.** The
  manual issue door re-checks every condition above under the same per-patient
  lock as 5.1, records `sent_by` from `auth.uid()` (never from the caller) and
  writes one `audit_log` row (6.7). Two staff pressing at once produce one send.
* **Open question O9 (section 11):** the four reasons do not cover a most recent
  concluded appointment that is already answered.

### 5.5 The send status (S5)

Stored per send (6.3): the time, the sender or "automatic", the channel, the
appointment, and whether the link was consumed by an answer or an opt-out.

Shown next to the button and in the list (copy texts 74 to 80):
"Último envio: <data>, por <nome>" for a manual send, "Último envio: <data>,
automático" for an automatic one, then "Canal: email" or "Canal: SMS", then
"Com resposta" or "Sem resposta". A send consumed by an opt-out reads "Sem
resposta"; the opt-out itself shows as the button's disabled reason (text 71).
Who sees the status is section 2.

## 6. The data model: a held migration plan, numbered `0101`

### 6.1 Numbering and holding

* SAT-01's migrations are on the ruled Tier C list (#1461). **One migration,
  `0101`, is planned** (S-1001-A R2: `0100` is the MAINTAIN revoke, #1520, and
  `0102` is the episode-policy item). A split by the R4 review cannot take
  `0102`; it needs a number from the owner.
* It is authored as
  `packages/db/migrations-pending/NEXT-AFTER-0100_sat01_satisfaction_survey.sql`
  (the README's rule: the name says what it must follow, and it carries no
  number of its own). It is promoted to `0101` only when `0100` is applied to
  production and merged. Apply order equals file order (2026-09-30).
* **Its first two statements are the SET LOCAL lines** (S-1002-A R10, the gate
  `scripts/migration-timeouts.test.mjs`): `SET LOCAL lock_timeout = '5s';` and
  `SET LOCAL statement_timeout = '60s';`.
* **The apply document** `docs/migration-apply-0101.md`, with its sha256
  sidecar, carries:
  * **a stage 0 R9 arm** (S-1002-A R9): it proves, or fails to prove, each of
    the three conditions for a clinic-hours sitting (the SET LOCAL gate on main;
    catalog-only or no table reception writes; the read-only pre-check run on
    production in an earlier sitting, its output recorded). Any condition not
    proven sends the sitting to closed hours;
  * **a read-only pre-check** and **a post-check**;
  * **a behaviour check per role**, each measured as an assigned principal with
    real JWT claims and printed OK, VACUOUS or FAIL, never passing on an empty
    set: therapist own (attended, at an own clinic: reads the answer), therapist
    other (did not attend: reads nothing), reception own clinic (reads),
    reception other clinic (reads nothing), admin (own clinics only), owner
    (every clinic in the tenant), anon (permission denied).
* **SOLO's reading of R9 for the planned shape, for the held PR's R4 to check,
  not a ruling:** condition (2) does not hold. The shape adds a column to
  `patients` and creates foreign keys to `patients` and `appointments`, which
  briefly lock two tables reception writes. Unless the held PR changes that
  shape, the arm reads condition (2) as not met and the sitting runs while both
  clinics are closed (the rule of 2026-09-27).
* It is rehearsed on the throwaway database at production's position, goes
  through R4, is held unarmed with the `held-for-apply` label and a question
  block, and is applied by GREEN from the apply document, in the window its R9
  arm allows. SOLO never applies it.
* **It changes no existing row.** It adds three tables, one column with a
  default, seven functions, policies and grants. There is no backfill, no
  UPDATE of existing data and no DELETE.

As written on 2026-09-29, *superseded 2026-10-01 by S-1001-A R2 (the number)
and 2026-10-02 by S-1002-D's build order (the document's contents)*:

> One migration, `0100`, is planned. `0101` is used only if the R4 review splits
> it. It is authored as `NEXT-AFTER-0099_sat01_satisfaction_survey.sql` [...] and
> promoted to `0100` only when every earlier number in the ruled queue is applied
> to production and merged. [...] applied by GREEN from an apply document with
> its sha256 sidecar, in a sitting while both clinics are closed. [...] It adds
> two tables, one column with a default, five functions, policies and grants.

### 6.2 `patients.survey_enabled`

`ALTER TABLE public.patients ADD COLUMN survey_enabled boolean NOT NULL DEFAULT true;`
A constant default does not rewrite the table. Plus
`GRANT UPDATE (survey_enabled) ON public.patients TO patient;`, which adds to
the column grants of 0019 and 0082 and is row-scoped by the existing
`patients_patient_update_selfscope` policy. **No table-level REVOKE is issued**,
because a table-level REVOKE drops every column grant with it. Staff change it
through the existing patient update path (S8, 6.7). Every send path reads it
(S8).

### 6.3 `appointment_survey_sends` and `appointment_survey_codes`

**One row per send (S5).** The send is what staff see; the code is what the
link carries, and no app role reads it.

`appointment_survey_sends`:

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | |
| `tenant_id` | uuid NOT NULL | REFERENCES `tenants(id)` |
| `appointment_id` | uuid NOT NULL | REFERENCES `appointments(id)` ON DELETE CASCADE; **not unique**: a manual send may follow an expired, unanswered one for the same appointment (S4) |
| `patient_id` | uuid NOT NULL | REFERENCES `patients(id)`; the recipient, copied from the appointment by the issue door |
| `channel` | text NOT NULL | CHECK IN (`email`, `sms`) |
| `origin` | text NOT NULL | CHECK IN (`automatic`, `manual`) |
| `sent_by` | uuid | REFERENCES `users(id)`; NULL for an automatic send; CHECK `(origin = 'manual') = (sent_by IS NOT NULL)`; set by the door from `auth.uid()` |
| `sent_at` | timestamptz NOT NULL DEFAULT now() | |
| `consumed_at` | timestamptz | set by submit or opt-out |
| `outcome` | text | CHECK IN (`answered`, `opted_out`); CHECK `(consumed_at IS NULL) = (outcome IS NULL)` |

Index `(tenant_id, patient_id, sent_at DESC)` for the 60-day rule and the
valid-link check. **No `expires_at` column**, following 0072 and SR-28: expiry
is read at resolve time as `sent_at + interval '14 days'`. Table grants: REVOKE
ALL from PUBLIC, `anon`, `authenticated` and `patient`, written as REVOKEs
because Supabase's default privileges grant them otherwise; then `GRANT SELECT
... TO authenticated` only, under the policy of 6.5. No INSERT, UPDATE or DELETE
grant to any app role.

`appointment_survey_codes`, the 0072 shape in its own table:

| Column | Type | Rule |
|---|---|---|
| `code_hash` | text PRIMARY KEY | CHECK `~ '^[0-9a-f]{64}$'` (HMAC hex) |
| `tenant_id` | uuid NOT NULL | REFERENCES `tenants(id)`, as 0072 |
| `send_id` | uuid NOT NULL UNIQUE | REFERENCES `appointment_survey_sends(id)` ON DELETE CASCADE; one code per send |

Table grants: REVOKE ALL from PUBLIC, `anon`, `authenticated` and `patient`; RLS
enabled with no policy. Only the doors touch it. **It cannot reuse
`appointment_confirm_codes`**: that table's partial unique index allows one live
code per appointment, so an unconsumed confirm code would block the survey code,
and its expiry is read from `starts_at`.

As written on 2026-09-29, *superseded 2026-10-02 by S-1002-D S4 and S5*: one
table, `appointment_survey_codes`, holding `appointment_id` **UNIQUE** ("one
survey per appointment, ever"), `patient_id`, `channel`, `issued_at` and
`consumed_at` beside the hash, with expiry read as `appointments.ends_at +
interval '14 days'` (default 6). S4 allows a second send for one appointment, S5
needs the sender and a send record staff can read, and the expiry now runs from
the send.

### 6.4 `appointment_survey_responses`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | |
| `tenant_id` | uuid NOT NULL | REFERENCES `tenants(id)` |
| `send_id` | uuid NOT NULL UNIQUE | REFERENCES `appointment_survey_sends(id)`, **no cascade** (O6); one answer per send |
| `appointment_id` | uuid NOT NULL UNIQUE | REFERENCES `appointments(id)`, **no cascade** (O6). UNIQUE holds while O9 is (a), the recommendation; under O9 (b) it is dropped and `send_id` alone is unique |
| `patient_id` | uuid NOT NULL | REFERENCES `patients(id)`, no cascade, as 0093 |
| `nps` | smallint NOT NULL | CHECK BETWEEN 0 AND 10 |
| `rating` | smallint NOT NULL | CHECK BETWEEN 1 AND 5 |
| `comment` | text | CHECK NULL or `char_length` BETWEEN 1 AND 1000 |
| `comment_purged_at` | timestamptz | CHECK `comment_purged_at IS NULL OR comment IS NULL` |
| `contact_consent` | boolean NOT NULL | the unticked box |
| `consent_version` | text NOT NULL | CHECK `btrim <> ''`; the label of the page text shown (questions, text 7 and the contact sentence), the `intake-consent.ts` rule: add a label, never edit one |
| `channel` | text NOT NULL | CHECK IN (`email`, `sms`); copied from the send row |
| `sent_at` | timestamptz NOT NULL | the send's `sent_at` |
| `submitted_at` | timestamptz NOT NULL DEFAULT now() | |

Index `(tenant_id, submitted_at DESC)` for the list. `send_id`,
`appointment_id`, `patient_id`, `channel` and `sent_at` are taken from the send
row inside the submit door, never from the caller. Table grants: REVOKE ALL from
PUBLIC, `anon`, `authenticated`, `patient`; then `GRANT SELECT ... TO
authenticated` only. No INSERT, UPDATE or DELETE grant to any app role.

A patient hard delete is already refused while the patient has appointments
(`apps/web/lib/patients/actions.ts`, `has_references`), and a survey needs an
appointment, so the patient FK never fires. The appointment hard delete
(`settings:manage`, password) is the one path that could reach a response: it
cascades to the sends, and the response's no-cascade reference to its send
refuses the delete while an answer exists (O6 (a)). An unanswered send goes
with its appointment.

### 6.5 RLS

* **Codes:** RLS on, no policy, no grant. Unreadable by every app role.
* **Responses (S7), one SELECT policy for `authenticated`:**
  `tenant_id = (select public.jwt_tenant_id())` AND (
  `(select public.jwt_role()) = 'owner'`
  OR (`(select public.jwt_role()) IN ('admin', 'reception')` AND the
  appointment's `location_id = ANY ((select public.viewer_location_ids()))`)
  OR (`(select public.jwt_role()) = 'therapist'` AND
  `(select auth.uid())` is the appointment's `practitioner_id` or
  `practitioner_2_id` AND the appointment's `location_id = ANY ((select
  public.viewer_location_ids()))`)).
  No other therapist reads a row. The appointment's location and practitioners
  are read through a SECURITY DEFINER helper (or copied onto the row by the
  submit door), never through the appointments policy, so a later change to
  that policy cannot widen or narrow S7.
* **Sends, one SELECT policy for `authenticated`** (SOLO's reading, section 2:
  S4's roles, because S5 shows the status beside S4's button): tenant, AND
  (owner, OR admin and reception with the appointment's `location_id` in
  `viewer_location_ids()`, OR therapist with `patient_id = ANY ((select
  public.viewer_treated_patient_ids()))`).
* **`patient` and `anon`:** no rows, by the policies and by grant.
* **No assignment, no rows:** the clinic arms read an empty
  `viewer_location_ids()` as nothing (section 2).

As written on 2026-09-29, *superseded 2026-10-02 by S-1002-D S7*:

> Responses, one SELECT policy for `authenticated`:
> `tenant_id = (select public.jwt_tenant_id())` AND
> (`(select public.jwt_role()) = 'owner'` OR
> (`(select public.jwt_role()) = 'admin'` AND the O2 rule)).
> The recommended O2 rule: the appointment's `location_id` is in
> `(select public.viewer_location_ids())`, the basis 0045 uses for admins. If
> the owner rules "every clinic", the admin arm is the role check alone.
> Therapist, reception, `patient`, `anon`: no rows, by the policy and by grant.

### 6.6 The doors (SECURITY DEFINER)

Every function: `SECURITY DEFINER`, `SET search_path = public`, owned by
`postgres` (0060's rule), REVOKE ALL from PUBLIC, `anon`, `patient` **by name**
(a REVOKE from PUBLIC does not touch a role granted by name), and the grant
listed. Every door takes the tenant and proves it in the same statement, so a
wrong pairing writes nothing. Names are proposals; the held PR fixes them.

| Function | Grant | What it does |
|---|---|---|
| `issue_survey_automatic(p_code_hash, p_tenant_id, p_appointment_id, p_channel)` returns text | `authenticated` | Reads the appointment in the tenant: status must be `completed`; recipient = `patient_id`; the patient's `survey_enabled` must be true (S8). Takes a per-patient transaction lock and refuses when any send, manual or automatic, exists for the patient in the last 60 days (S3). Writes one send (`origin = 'automatic'`, `sent_by` NULL) and its code. Returns `issued`, `cooldown` or `not_eligible`. |
| `issue_survey_manual(p_code_hash, p_tenant_id, p_patient_id, p_channel)` returns (result text, appointment_id uuid) | `authenticated` | Proves the caller's S4 right from the JWT role and `auth.uid()`. Finds the patient's most recent `completed` appointment itself. Under the same per-patient lock, refuses with a reason: `no_appointment`, `opted_out`, `no_channel` (the patient's switch for `p_channel` is off or the contact is missing), `open_link` (an unconsumed send younger than 14 days), `not_allowed`. Not subject to the 60-day rule (S4). Writes one send (`origin = 'manual'`, `sent_by = auth.uid()`), its code, and one `audit_log` row. |
| `survey_send_state(p_tenant_id, p_patient_id)` returns (state text, reason text, appointment_id uuid) | `authenticated` | The button's state, from the same predicate as `issue_survey_manual`, without writing: `ready`, or `disabled` with the reason, or `not_allowed`. The app renders texts 70 to 73 from it. |
| `resolve_survey_code(p_code_hash)` returns (tenant_id, appointment_id, visit_ends_at) | `authenticated` | One row only when the code exists, its send is unconsumed, `now() < sent_at + 14 days`, and the appointment is still `completed`. Zero rows for every other case, identically. Never writes. |
| `submit_survey_response(p_code_hash, p_tenant_id, p_nps, p_rating, p_comment, p_contact_consent, p_consent_version)` returns boolean | `authenticated` | Locks the send row, re-checks the resolve conditions, inserts one response, sets the send's `consumed_at` and `outcome = 'answered'`, writes one `audit_log` row. False, with nothing written, on any failure. |
| `opt_out_survey(p_code_hash, p_tenant_id)` returns boolean | `authenticated` | On a live code: sets the send's patient's `survey_enabled = false`, consumes the send with `outcome = 'opted_out'`, writes one `audit_log` row. |
| `purge_expired_survey_comments(p_tenant_id)` returns integer | **none**; EXECUTE revoked from `anon`, `authenticated`, `patient` and `service_role`, so only the owning role runs it (0087's shape) | Refuses a NULL tenant. Sets `comment = NULL, comment_purged_at = now()` where `submitted_at <= now() - interval '24 months'` and a comment remains. One `audit_log` row per purged response. Scores are kept (default 10, S12). An UPDATE, never a DELETE. |

The app calls `issue_survey_automatic`, `resolve_survey_code`,
`submit_survey_response` and `opt_out_survey` through
`withReminderTenantContext`, as `confirm-code-store.ts` calls 0074's doors, and
`issue_survey_manual` and `survey_send_state` with the staff member's own
session (`runScoped`), so `auth.uid()` is the sender. No service-role handle.

The existing tests that count SECURITY DEFINER functions move by six callable
doors plus one owner-only function; the expected count is a sum and is updated
in the held PR, not guessed.

As written on 2026-09-29, *superseded 2026-10-02 by S-1002-D S3, S4 and S5*: one
issue door, `issue_survey_code`, that "refuses a second code for the same
appointment" and returns `issued`, `cooldown`, `exists` or `not_eligible`; no
manual door and no state door; expiry from `ends_at`; "four callable doors plus
one owner-only function".

### 6.7 Audit and retention

* `audit_log` rows written by the guest doors (actor NULL, as for guest
  actions): `survey.submitted` and `survey.opt_out`, entity `appointment`,
  metadata `{ "channel": ... }` only. **Never a score, a comment or the consent
  choice** (rule 7: PII never in logs; the comment is treated as health data).
  `survey.comment_purged`, entity `appointment_survey_response`, metadata `{}`.
* **A manual send** (a permission-sensitive staff action, rule 6) writes
  `survey.sent`, actor the staff member, entity `appointment`, metadata
  `{ "channel": ..., "origin": "manual" }`. An automatic send is recorded in
  `reminder_dispatches`, as today.
* Staff turning a patient's switch off or on (S8) writes `patient.update`
  through the existing patient update path; the held PR's rehearsal proves
  that path's roles can write the new column and no role outside it can.
  ~~(if O1 (c) is ruled)~~ *superseded 2026-10-02 by S-1002-D S8.*
* Retention (default 10, S12): the purge function above, driven once per tenant
  by a daily job modelled on `apps/web/lib/guest-intake/retention.ts` (checks
  the table exists first, lists tenants, one call per tenant, logs counts only).
  The job must ship before the oldest answer is 24 months old; it can ship
  after v1. Send rows carry no free text and are kept.

## 7. The app changes

~~After JP's copy review.~~ *Superseded 2026-10-02 by S-1002-D S9a: the review
is done.* Every app pull request sends nothing to a patient while the SAT
live-send flag is off (the build order). Section 10 gives the order.

### 7.1 The automatic send path (Tier B: send path)

* `dispatchSurvey` replaces `dispatchFollowUp` inside the same Inngest function
  (5.1). `FOLLOW_UP_EMAIL`, `FOLLOW_UP_SMS` and the two `follow_up.*` registry
  entries are removed (default 7); historical `reminder_dispatches` rows keep
  their `follow_up.*` template ids.
* New templates `SURVEY_EMAIL` and `SURVEY_SMS`: pt from JP's approved copy
  (texts 1 to 3), en from the copy file's English section (S10). The registry
  entries `survey.email` and `survey.sms` record JP's approval of 2026-10-02
  for pt (S9a) and S10 for en. ~~Entering `approved: false`.~~ *Superseded
  2026-10-02 by S-1002-D S9a and S10.*
* The code module reuses `confirm-code.ts`'s alphabet, length (8) and HMAC.
  Recommended: the same key with a `survey:` domain prefix on the HMAC input,
  so no new secret is needed (O7).
* New render tokens: `survey_link`, `survey_expiry_date` (the send date plus 14
  days, long form). ~~Visit date plus 14 days.~~ *Superseded 2026-10-02 by
  S-1002-D S4 (3.2 row 6).*
* The SAT live-send flag is introduced here, off by default.

### 7.2 The guest page (Tier B: auth-adjacent guest write)

`apps/web/app/s/[code]/page.tsx` and `actions.ts`, per 5.2, without the opt-out
button, which comes with O1 (7.8). The consent label list lives beside
`intake-consent.ts` with a test pinning the sha256 of the shown text (text 7
included) to the current label.

### 7.3 The list in Comunicações (Tier B: data access and a capability)

* Capabilities `surveys:read` and `surveys:send` in
  `packages/auth/permissions.ts`, held by owner, admin, reception and therapist;
  which rows and which patients is decided by RLS (S7, 6.5) and the doors (S4,
  6.6), not by the capability. The permission-matrix tests are updated.
  ~~New capability `surveys:read`, owner and admin only.~~ *Superseded
  2026-10-02 by S-1002-D S7.*
* A section of Comunicações (`apps/web/lib/nav/comms-sections.ts`), tab label
  "Avaliações de satisfação" (S1, copy text 36), so no new sidebar row and no
  NAV-01 order change (O3, answered by the build order's "the list in
  Comunicações"). The route redirects a role without the capability; the query
  reads through RLS (`runScoped`).
* One row per send (S5). Columns: visit date, patient, therapist, clinic, send
  (copy text 79), answer (text 80), recommendation, satisfaction, comment,
  contact consent, channel, answered at. A row whose answer the viewer may not
  read shows copy text 81 in the answer columns. Newest first, a month filter,
  "Abrir ficha" for the patient, and the "Enviar avaliação" button per row,
  with its state.

### 7.4 The portal switch (Tier B: patient profile write)

`surveyEnabled` joins the profile whitelist in
`apps/api/app/api/v1/patient/profile/route.ts` and `apps/api/lib/patient/profile.ts`,
and the account screen gains the third switch (copy texts 32 to 35). The
portal's email fallback `?? false` against a database default of true
(`AccountView.tsx:176`) is a known mismatch; the new switch uses `?? true`,
matching its default.

### 7.5 What goes live when: the flag and the canary

* Merged code sends nothing to a patient: the SAT live-send flag is off by
  default (the build order).
* **The canary (the build order, S9a).** The first live send is a supervised
  send to a ZZ TESTE patient (`docs/board/FIXTURES.md`: the test patient
  carries the owner's own contact), made after the last app pull request of
  section 10 is merged, because texts 2 and 3 promise an opt-out on the page
  (7.8). It is watched end to end: the dispatch row, the message received, the
  page, an answer, the S5 status, and who can read the answer.
* **The owner turns the flag on after the canary** (Tier D). That is the only
  remaining gate on live sending (S9a).
* **How the canary passes a flag that is still off: SOLO's reading, not a
  ruling, fixed in the manual-send pull request.** Recommended: the flag reads
  off, canary or on; in canary a send goes out only to a patient on a
  one-entry list the owner sets, and everything else is suppressed with its
  reason. Open question O10.

As written on 2026-09-29, *superseded 2026-10-02 by S-1002-D S9a*: "Merged code
sends nothing: the entries are unapproved and the flag is off. Going live is
three owner steps (Tier D): JP's approval recorded in the registry by a pull
request, the flag set by the owner, and the RGPD confirmation (O4)."

### 7.6 The manual send with its status (Tier B: send path and data access)

Per 5.4 and 5.5: the button on the patient profile and per row in Comunicações,
`survey_send_state` for the state and the reason (copy texts 70 to 73), the
dialog (texts 62 to 67), `issue_survey_manual`, the dispatch in the order of
5.1 step 4, the outcome (texts 68, 69) and the status line (texts 74 to 78).

### 7.7 The patient profile section (S11) (Tier B: data access)

In the patient profile's "Avaliações de satisfação" section (copy text 58): the
patient's sends and answers, newest first, with the columns of copy section G,
read through RLS, so each answer shows only to the roles S7 allows (text 81
otherwise). No send yet: text 78. The section is in the patient profile, not in
the registos or any clinical record.

### 7.8 O1: the page's opt-out and the patient-profile toggle (S8) (Tier B: guest write and patient profile write)

The "stop sending me surveys" button and its outcome page (copy texts 19, 20,
28, 29) on `/s/<code>`, through `opt_out_survey`; the toggle on the patient
profile (texts 58 to 60) through the existing patient update path.

### 7.9 The Platform Guide lesson (Tier A: docs)

One lesson "Avaliação de satisfação" in `docs/guide/content/`, under the lesson
tree that `scripts/guide-content.test.mjs` checks: how to send, where the
status shows, who sees answers, and, in the build order's words, "SMS is paid
and used only when the patient has no email; always collect the patient's
email."

## 8. Out of scope in v1

* An alert on low scores (default 8).
* A survey for the NESA second patient (default 9).
* An automatic survey after "Corrigir estado" to Concluída (O8). A manual send
  can still reach that appointment (section 4).
* The monthly NPS figure and any chart (O5).
* Export of answers.
* Any change to reminder timing, the confirm link or SMS STOP.

Taken out of this list 2026-10-02:

* ~~Therapist access to any answer (default 5 and the ruling).~~ *Superseded by
  S-1002-D S7.*
* ~~English copy review: the en strings are translated from JP's approved pt
  text in the app PR and listed for approval there; J6 in the copy file asks who
  approves them.~~ *Superseded by S-1002-D S10: translated, published without a
  second review; the translation is in the copy file.*
* ~~Answers shown on the patient file.~~ *Superseded by S-1002-D S11.*

## 9. The tests each part needs

### 9.1 The held migration (DB-gated CI and the throwaway rehearsal)

* **The behaviour check per role (S7, the build order)** on responses, each role
  measured as an assigned principal with its real JWT claims, printed
  OK/VACUOUS/FAIL and never passing on an empty set: therapist own (attended,
  own clinic: reads it), therapist other (same clinic, did not attend: reads
  nothing), the attending therapist after losing the clinic assignment (reads
  nothing), reception own clinic (reads), reception other clinic (reads
  nothing), admin own clinic (reads) and other clinic (reads nothing), owner
  (every clinic of the tenant, none of another tenant), `patient` (zero rows),
  `anon` (permission denied). A NESA visit's second practitioner reads it.
  Staff with no clinic assignment read nothing.
* **The same matrix on sends** (S4's roles, 6.5): a therapist reads the sends
  of patients they treat and no other; reception and admin by clinic; owner all.
* **Direct writes refused**: INSERT, UPDATE, DELETE on all three tables by
  `authenticated`, `patient` and `anon` fail with 42501; SELECT on codes fails
  for every app role.
* **Grants asserted by name** for every function and role, including
  `service_role` on the purge function; a REVOKE from PUBLIC alone is not
  accepted as proof.
* **issue_survey_automatic**: wrong tenant writes nothing; a non-completed
  appointment is refused; `survey_enabled = false` is refused; a send to the
  patient inside 60 days is refused **whether it was automatic or manual**, and
  one at 61 days is issued (timestamps seeded in the database, because a fake
  JavaScript clock does not move `now()`); **two concurrent issues for one
  patient produce exactly one send**.
* **issue_survey_manual**: each reason fires on its own fixture and on no other
  (`no_appointment`, `opted_out`, `no_channel`, `open_link`, `not_allowed`);
  a send at 5 days after an automatic one is issued (not blocked by 60 days);
  an unconsumed send at 13 days blocks and at 15 days does not; it attaches to
  the most recent `completed` appointment and ignores a caller-supplied one;
  `sent_by` is the caller's `auth.uid()`; a therapist who does not treat the
  patient, and reception or admin of another clinic, are refused; one
  `audit_log` row with no score and no comment; a manual and an automatic issue
  racing for one patient produce one send.
* **survey_send_state** agrees with `issue_survey_manual` on every fixture above
  and writes nothing.
* **resolve**: unknown, consumed, expired (`sent_at + 14 days` passed) and
  status-changed codes return the same zero rows; a live code returns one row;
  a resolve writes nothing (row counts and `consumed_at` unchanged).
* **submit**: a valid submit writes one response, consumes the send with
  `outcome = 'answered'` and writes one audit row whose metadata holds no score
  and no comment; a replay returns false and writes nothing; `nps` below 0 and
  at 11, `rating` at 0 and 6, a 1001-character comment and a blank consent label
  are refused by the CHECKs; `send_id`, `patient_id` and `channel` come from the
  send even when the caller would have supplied others.
* **opt_out**: flips only the send's patient, consumes the send with
  `outcome = 'opted_out'`, leaves both reminder switches untouched, writes one
  audit row; afterwards both issue doors refuse that patient (S8).
* **purge**: nulls only comments older than 24 months, keeps scores, refuses a
  NULL tenant, refuses every app role, writes one audit row per purged row, and
  touches no other tenant.
* **Column grant**: the `patient` role's UPDATE column list after the migration
  equals the list before plus `survey_enabled`; a patient can flip their own
  switch and not another patient's.
* **Appointment delete**: an appointment with an unanswered send deletes and
  takes the send with it; one with an answer is refused (O6 (a)).
* **Rehearsal**: applies clean at production's position; the first two
  statements are the SET LOCAL lines; a before/after profile of `patients`
  shows no row changed; one mutation sweep over every predicate of the doors
  and policies, survivors listed (the owner's "one mutation sweep per op").

### 9.2 The send path

* The pt SMS renders as one GSM-7 segment of at most 160 characters for the
  longest date and a host of 32 characters, and throws beyond 160; the copy has
  no accents and no dash characters. The en SMS likewise.
* Email: no unfilled placeholder; plain text.
* The registry holds `survey.*` with `approvedBy` and `approvedAt` set (S9a,
  S10) and no longer holds `follow_up.*`; a test fails if a survey entry is
  approved without them.
* Dispatch matrix: both channels allowed gives email only; SMS only when there
  is no email or the email switch is off; neither gives a suppressed row with
  its reason; survey switch off, the 60-day rule (after an automatic and after a
  manual send), status changed and flag off each give a suppressed row;
  `patient_2_id` never receives one.
* The flag: off suppresses both sends; the canary state of 7.5 lets through
  only the listed patient.
* INC-CONFIRM-07: a render that throws leaves no send and no code row, for both
  sends.
* The Inngest function id and idempotency key are unchanged (asserted).

### 9.3 The guest page

* GET never writes (the resolve door only, asserted by spy).
* Unknown, expired, spent and status-changed codes produce byte-identical HTML.
* The page never renders a therapist name, service name, time or patient name,
  and always renders text 7.
* POST: malformed code refused before any database call; rate limit applied
  before the door; no field value in any log line or redirect URL; `noindex`.
* e2e on the lane stack: answer once, see the thank-you page, reopen the link,
  see the generic page; opt out, see the opt-out page, and the patient's switch
  reads off. Test hosts use reserved `*.invalid` names only.

### 9.4 The staff screens and the switches

* `surveys:read` and `surveys:send` held by owner, admin, reception and
  therapist (permission matrix). ~~Owner and admin only; therapist and reception
  redirected.~~ *Superseded 2026-10-02 by S-1002-D S7.*
* The Comunicações list and the patient profile section return, per role,
  exactly the rows of 9.1's matrix, and never pass on an empty fixture.
* The button: each disabled reason renders its text (70 to 73); the dialog
  names email or SMS, and shows text 65 only for SMS; the status line renders
  "por <nome>" for manual and "automático" for automatic.
* i18n parity: every new pt key has an en key.
* The portal switch round-trips through the profile API; the reminder switches
  do not move when it does. The staff toggle writes `patient.update`.

## 10. The pull request plan

The build order of S-1002-D (section 3.4). At most one pull request in checks
plus one being built (R3).

| # | Pull request | Tier | Opens when |
|---|---|---|---|
| 1 | The spec and the pt-PT copy (#1496, merged 2026-09-29), and **this amendment** | A (docs) | now |
| 2 | The held migration `0101`: the pending file, DB tests, rehearsal record, apply document with the R9 arm and its sha256 sidecar, pre-check, post-check, the behaviour check per role, GREEN dispatch, question block | C, held unarmed, `held-for-apply` | after `0100` is applied and merged; O6 and O9 can be authored to their recommendations and held |
| 3 | The guest page with the single-use 14-day token (7.2) | B, R4 | after `0101` is applied |
| 4 | The automatic job: send path, templates and the flag (7.1) | B, R4 | after 3 |
| 5 | The manual send with its S5 status (7.6) | B, R4 | after 4 |
| 6 | The list in Comunicações (7.3) | B, R4 | after 5 |
| 7 | The patient profile section, S11 (7.7) | B, R4 | after 6 |
| 8 | The portal toggle (7.4) | B, R4 | after 7 |
| 9 | O1: the page's opt-out and the patient-profile toggle (7.8) | B, R4 | after 8 |
| 10 | The Platform Guide lesson "Avaliação de satisfação" (7.9) | A (docs) | any time after 5 |
| 11 | The supervised canary to a ZZ TESTE patient, then the flag (7.5) | D, the owner | after 9 |
| 12 | The retention job (6.7) | B, R4 | any time before the oldest answer is 24 months old |

Pull requests 3 to 9 merge only after `0101` is on production, because a call
to a function that does not exist yet raises 42883 and aborts its caller; each
also checks that the tables exist and fails closed to "not sent" when they do
not.

The plan as written on 2026-09-29, *superseded 2026-10-02 by S-1002-D's build
order and S9a*:

> | # | Pull request | Tier | Opens when |
> |---|---|---|---|
> | 1 | **This one**: the spec and the pt-PT copy | A (docs) | now |
> | 2 | The held migration: the pending file, DB tests, rehearsal record, apply document with sha256 sidecar, GREEN dispatch, question block | C, held unarmed, `held-for-apply` | after O2 and O6 are ruled (it can be authored to the recommendations and held) |
> | 3 | The send path and templates (7.1), dark | B, R4 | after JP's copy review and after `0100` is applied |
> | 4 | The guest page (7.2) | B, R4 | after 3 |
> | 5 | The staff list, the capability and the portal switch (7.3, 7.4) | B, R4 | after 4 |
> | 6 | JP's approval recorded in the registry | D, the owner | when JP approves and the owner sets the flag |
> | 7 | The retention job (6.7) | B, R4 | any time before the oldest answer is 24 months old |

## 11. Open questions for the owner

Each has a recommended default. The rulings of 2026-10-02 closed O1 and O2 and
answered O3; the rest stay open.

| # | Question | Options | Recommended | Status 2026-10-02 |
|---|---|---|---|---|
| O1 | How does a patient without a portal account opt out? | (a) the portal only, as default 4 says; (b) plus a button on the survey page; (c) plus a staff toggle on the patient file | (b) and (c): every message then carries a working opt-out, and a patient who phones can be answered | **Ruled by S-1002-D S8: on, all three.** |
| O2 | Which answers does an admin see? | (a) every clinic in the tenant; (b) only appointments at the admin's own clinics, the 0045 basis | (b), matching Estatísticas and the clinical records rule | **Superseded by S-1002-D S7: (b), for reception too.** |
| O3 | Where does the staff list live? | (a) a section of Comunicações; (b) a new sidebar row | (a): no NAV-01 order change | **Answered (a) by the build order ("the list in Comunicações") and S1's tab label.** |
| O4 | RGPD: may the clinic send the survey on legitimate interest, with an opt-out in every message? | confirmation from whoever is responsible for RGPD | confirm before the flag is set; building can proceed | Not ruled. S9a names the owner's flag as the only remaining gate, so it is no longer a separate step in 7.5; the owner confirms it before turning the flag on if he wants it confirmed. |
| O5 | A monthly NPS figure on the list? | (a) in v1; (b) later | (b), as the proposal said | Open. |
| O6 | Deleting an appointment that has an answer | (a) refuse, as for notes, records and invoices; (b) delete the answer with it | (a): an answer is something a patient gave and is not lost silently | Open; the held PR is authored to (a). |
| O7 | The key for survey codes | (a) the confirm code key with a `survey:` prefix; (b) a new secret | (a): no new secret to set | Open. |
| O8 | Corrigir estado to Concluída | (a) sends nothing, as today; (b) sends a survey | (a) in v1; a manual send covers the case | Open. |
| O9 | **New 2026-10-02.** The manual button when the patient's most recent concluded appointment is already answered. S4's four reasons do not cover it, and a link sent for it would open the generic invalid page. | (a) disable the button with a fifth reason ("Indisponível: a avaliação da consulta mais recente já foi respondida.", to be added to the copy as text 82); (b) allow a second answer for the same appointment, one per send | (a): one answer per visit keeps the list's numbers comparable | Open; the held PR is authored to (a) and the copy waits for the ruling. |
| O10 | **New 2026-10-02.** How the canary passes a flag that is off (7.5) | (a) a canary state that sends only to one listed patient; (b) the owner turns the flag on for the canary and off again if it fails | (a): the flag never opens for every patient before the canary has passed | Open; decided in the manual-send pull request. |

## 12. The copy

Every string a patient or staff member will read is in
`docs/design/SAT-01-copy-pt.md`, numbered, with where it appears, and the
English translation (S10). Texts 1 to 60 are JP's approved texts of 2026-10-02,
with the S1 renames and the changes S9 required shown against the approved
wording; text 7 is the ruled sentence, approved by JP on 2026-10-02 (S9a).
Texts 61 to 81 are new staff strings for the button, the dialog, the disabled
reasons, the status line and the list (S9). ~~No app pull request opens before
JP's review comes back.~~ *Superseded 2026-10-02 by S-1002-D S9a: the review is
done.* The file JP reviewed is in the owner's handover folder as
`SAT-01-copy-pt-for-JP.md`.
