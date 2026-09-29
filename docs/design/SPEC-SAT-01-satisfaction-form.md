# SPEC SAT-01: the satisfaction form after a visit

**Status: SPEC ONLY. NOTHING IS BUILT, NO MIGRATION IS AUTHORED.** This document
adds no product code, no schema change, no flag and no dependency. Every patient
and staff string is in the companion file `docs/design/SAT-01-copy-pt.md`, which
goes to JP for review before any app pull request opens.

Author: SOLO, 2026-09-29, measured on `origin/main` at `f8b3f32d`. Board card:
`SAT-01-satisfaction-form`.

## 0. The one-paragraph answer

After a visit is closed (Estado set to Concluída), the patient receives one
message, 24 hours after the visit ends, by email or SMS depending on what the
patient allows. It carries a single-use link to a guest page with three
questions and one unticked contact box: a 0 to 10 recommendation score (the NPS
question), a 1 to 5 satisfaction rating, an optional comment, and "may we contact
you about your answers". Opening the link saves nothing; only the submit button
saves. The answers are readable by the owner and admins only. The message
replaces the post-visit "thank you, book your next visit" message that has been
switched off since 2026-09-04. The database half is one held Tier C migration
numbered `0100`; the app half is three pull requests that open only after JP has
reviewed the copy.

## 1. What it is for

The clinic has no measure of how patients rate a visit. SAT-01 gives the owner
two numbers per answered visit (recommendation 0 to 10, satisfaction 1 to 5), an
optional comment, and a record of whether the patient agreed to be contacted
about it. It is a management tool, not a clinical one: nothing it collects enters
the ficha, the registos or any clinical screen.

## 2. Who sees what (v1)

"Owner and admin only in v1" is the owner's ruling (section 3). The admin column
carries one open question, O2 in section 11.

| What | Owner | Admin | Therapist | Reception | Patient |
|---|---|---|---|---|---|
| The staff list of answers | yes, every clinic | yes (scope: O2) | no | no | no |
| A single answer's comment | yes | yes (scope: O2) | no | no | only while filling the form |
| The patient's survey switch (see and change) | only if O1 (c) is ruled | only if O1 (c) is ruled | no | only if O1 (c) is ruled | yes, in the portal |
| The survey page `/s/<code>` | n/a | n/a | n/a | n/a | the holder of the link, once |
| Survey codes | nobody reads them; they are stored only as a keyed hash | | | | |

A therapist never sees their own ratings (default 5). The staff list shows the
therapist and clinic of each appointment to the owner and admins, because the
ruling is "answers per appointment".

## 3. The ten defaults, as ruled

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
* **The build instruction, same dispatch, verbatim:** "B15 SAT-01, after B17,
  built to the ten defaults: migrations numbered after 0098, held; the guest
  page /s/<code> on the 0072/0074 pattern; the message replaces the
  switched-off 24-hour one; a separate survey switch on by default; owner and
  admin list of answers per appointment; JP's copy review file [...] with the
  SMS under 160 ASCII characters."
* **The numbering.** The owner's dispatch of 2026-09-27 (later), verbatim:
  "0099 registo fix, SAT-01 from 0100." Recorded in `CLAUDE.md` ("`0100`
  onward | SAT-01's migrations") and `packages/db/migrations-pending/README.md`.
* **Today.** The owner's dispatch of 2026-09-29, verbatim: "SAT-01 starts:
  spec from 0100, copy in pt-PT sent to the owner for JP's review before any
  UI PR. No DB change without a held PR."

### 3.2 The ten, quoted from the proposal

| # | Question | Ruled default, verbatim | Where this spec applies it |
|---|---|---|---|
| 1 | When to send | "24 hours after the visit ends. (The June draft said 3 days.)" | 5.1 |
| 2 | How often | "no more than one survey per patient every 60 days." | 5.1, 6.4 `issue_survey_code` |
| 3 | Channel when the patient allows both | "email only. SMS only when there is no email." | 5.1 |
| 4 | A separate survey switch for each patient | "yes, on by default, and the patient can change it in the portal." | 6.2, 7.5 |
| 5 | Who sees the answers | "the owner and admins. Therapists do not see their ratings." Narrowed by the ruling to "owner and admin only in v1". | 2, 6.5 |
| 6 | How long a code works | "14 days after the visit." | 6.3, 6.4 `resolve_survey_code` |
| 7 | The old "book your next visit" line | "removed. The survey message replaces it." | 7.1 |
| 8 | Alert on a low score (0 to 6) with contact allowed | "no alert in version 1, only the list." | 8 |
| 9 | The second patient on a shared NESA visit | "no survey in version 1, the same as today." | 5.1, 8 |
| 10 | How long answers are kept | "comments deleted after 24 months, scores kept." | 6.7 |

All ten were found verbatim. None is unsourced.

### 3.3 The proposal's form, also accepted

The four items of the form, from the same proposal: "From 0 to 10, how likely
are you to recommend OsteoJP to a friend or family member? (This is the NPS
question.)", "From 1 to 5, how satisfied are you with this visit?", "Is there
anything you want to tell us? (optional, free text)", and "A box, empty by
default: 'I agree that OsteoJP may contact me about my answers.'" Also: "Opening
the link saves nothing. Only the 'Enviar' button saves. Each code works once.
[...] Like the confirm page, it never shows the therapist or the service."

## 4. What exists today (measured at `f8b3f32d`)

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
| RLS helpers | `public.jwt_tenant_id()` (0001, 0012), `public.jwt_role()` (used by 0045), `public.viewer_location_ids()` (0073) | |

Gaps that SAT-01 inherits and does not fix in v1:

* **"Corrigir estado" to Concluída enqueues nothing** (`correctAppointmentEstadoAction`,
  `actions.ts:2489`), so it sends no survey either. Section 11, O8.
* **The NESA second patient** (`appointments.patient_2_id`) is not read by the
  dispatch, which loads one patient. Default 9 keeps it that way.
* **Appointments have no episode link**, so the June draft's "first visit of
  each episode only" cannot be built. Default 2 replaces it with a 60-day
  cooldown.

## 5. The patient-facing flow

### 5.1 The send

1. Staff set Estado to Concluída. Nothing new happens at that moment.
2. 24 hours after the appointment's `ends_at` (default 1), the existing Inngest
   function wakes. **Its function id and idempotency key stay unchanged**, so a
   run already sleeping when the app PR deploys wakes into the new code rather
   than being orphaned.
3. The survey dispatch (replacing `dispatchFollowUp`, default 7) sends nothing
   unless every one of these holds, and records a `reminder_dispatches` row with
   `outcome = 'suppressed'` and the reason when one fails (`suppression_reason`
   is free text, so no migration is needed for new reasons):
   * the survey flag is armed (a new env flag, named in the app PR; setting it
     is the owner's, Tier D) and the registry entry for the body is approved
     (JP's approval; the entries enter `approved: false`);
   * the patient is not soft-deleted and the appointment is still `completed`;
   * the patient's survey switch is on (default 4);
   * a channel is allowed: **email if the tenant's email reminders are on, the
     patient's email switch is on and an email exists; otherwise SMS under the
     same three conditions for SMS; never both** (default 3);
   * the recipient is `appointments.patient_id` only, never `patient_2_id`
     (default 9);
   * the database issues a code: `issue_survey_code` refuses a second code for
     the same appointment, and refuses when the same patient was sent a survey
     in the last 60 days (default 2). The cooldown is decided inside the
     database under a per-patient lock, so two runs waking together for one
     patient (a series completed in one save) send one survey, not two.
4. **Order of work, from INC-CONFIRM-07:** generate the code (touches nothing),
   render the body that carries it (a render that throws costs no row), then
   issue the row, then hand the body to the provider. A code is never minted in
   front of a throw.
5. The SMS line is `Responder: <host>/s/<8 characters>`, bare host, the host
   read from the same variable the confirm link uses (`confirm-code.ts:68`,
   `REMINDERS_RESCHEDULE_BASE_URL`). The email carries the full link.

### 5.2 The page `/s/<code>`

Built on `apps/web/app/c/[code]/` and keeping its rules:

* **Opening performs nothing.** The render calls `resolve_survey_code` and never
  writes. A mail scanner following the link spends nothing.
* **Unknown, expired, spent and no-longer-eligible codes render one identical
  page** (SR-30). The page does not say which it was.
* **The visit date only.** No therapist, no service, no time, no clinical
  content, no patient name.
* `force-dynamic`, `robots: noindex, nofollow`, the same `Shell` and brand
  lockup.
* The form: question 1 (0 to 10, required), question 2 (1 to 5, required),
  question 3 (comment, optional, at most 1000 characters), the contact box
  (unticked), the submit button, and a separate "stop sending me surveys"
  button (O1).
* **The POST** checks the code's shape first, then the durable rate limit keyed
  on the server-side IP (the confirm page's rule), then calls
  `submit_survey_response` or `opt_out_survey`, and redirects to an outcome
  flag. Field values never enter the URL, a log line, Sentry or
  `analytics_events`.
* Outcomes: answer recorded; opt-out recorded; the generic invalid page. A
  second submit of a spent code gets the generic page.

### 5.3 The patient's survey switch

On by default (default 4). The patient turns it off in three ways:

* in the portal account screen, a third switch beside the two reminder switches
  (default 4);
* on the survey page, the "stop sending me surveys" button (O1; not in the ten
  defaults, recommended because a patient without a portal account otherwise
  has no way to opt out without phoning);
* by asking the clinic, if the owner rules a staff toggle on the patient file
  (O1).

Turning surveys off never touches `reminder_sms_enabled` or
`reminder_email_enabled`. SMS STOP is unchanged: a STOP the clinic receives
stays a channel-wide instruction (R11 legal precedence, `inbound-reply.ts`) and
therefore also stops survey SMS. Whether a reply can reach the clinic at all
depends on the sender (`reply-capability.ts`), which SAT-01 does not change.

## 6. The data model: a held migration plan, numbered `0100`

### 6.1 Numbering and holding

* SAT-01's migrations are on the ruled Tier C list (#1461) and are numbered
  from `0100` (owner, 2026-09-27). **One migration, `0100`, is planned.** `0101`
  is used only if the R4 review splits it.
* It is authored as `packages/db/migrations-pending/NEXT-AFTER-0099_sat01_satisfaction_survey.sql`
  (the README's rule: the name says what it must follow, and it carries no
  number of its own). It is promoted to `0100` only when every earlier number
  in the ruled queue is applied to production and merged; by the owner's apply
  order of 2026-09-29 ("0098, 0099, 0097, 0096" after ANEXO-LINK) that is after
  `0096`.
* It is rehearsed on the throwaway database at production's position, goes
  through R4, is held unarmed with the `held-for-apply` label and a question
  block, and is applied by GREEN from an apply document with its sha256
  sidecar, in a sitting while both clinics are closed. SOLO never applies it.
* **It changes no existing row.** It adds two tables, one column with a
  default, five functions, policies and grants. There is no backfill, no UPDATE
  of existing data and no DELETE.

### 6.2 `patients.survey_enabled`

`ALTER TABLE public.patients ADD COLUMN survey_enabled boolean NOT NULL DEFAULT true;`
A constant default does not rewrite the table. Plus
`GRANT UPDATE (survey_enabled) ON public.patients TO patient;`, which adds to
the column grants of 0019 and 0082 and is row-scoped by the existing
`patients_patient_update_selfscope` policy. **No table-level REVOKE is issued**,
because a table-level REVOKE drops every column grant with it.

### 6.3 `appointment_survey_codes`

The 0072 shape, in its own table. **It cannot reuse `appointment_confirm_codes`**:
that table's partial unique index allows one live code per appointment, so an
unconsumed confirm code would block the survey code, and its expiry is read from
`starts_at`, which is wrong for a link sent after the visit.

| Column | Type | Rule |
|---|---|---|
| `code_hash` | text PRIMARY KEY | CHECK `~ '^[0-9a-f]{64}$'` (HMAC hex) |
| `tenant_id` | uuid NOT NULL | REFERENCES `tenants(id)`, as 0072 |
| `appointment_id` | uuid NOT NULL | REFERENCES `appointments(id)` ON DELETE CASCADE, **UNIQUE**: one survey per appointment, ever |
| `patient_id` | uuid NOT NULL | REFERENCES `patients(id)`; the recipient, copied from the appointment by the issue door |
| `channel` | text NOT NULL | CHECK IN (`email`, `sms`) |
| `issued_at` | timestamptz NOT NULL DEFAULT now() | |
| `consumed_at` | timestamptz | set by submit or opt-out |

Index `(tenant_id, patient_id, issued_at DESC)` for the cooldown. **No
`expires_at` column**, following 0072 and SR-28: expiry is read at resolve time
as `appointments.ends_at + interval '14 days'` (default 6), so an edit to the
visit's time cannot leave a stale copy behind. Table grants: REVOKE ALL from
PUBLIC, `anon`, `authenticated` and `patient`, written as REVOKEs because
Supabase's default privileges grant them otherwise; RLS enabled with no policy.
Only the doors below touch it.

### 6.4 `appointment_survey_responses`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | |
| `tenant_id` | uuid NOT NULL | REFERENCES `tenants(id)` |
| `appointment_id` | uuid NOT NULL UNIQUE | REFERENCES `appointments(id)`, **no cascade** (O6) |
| `patient_id` | uuid NOT NULL | REFERENCES `patients(id)`, no cascade, as 0093 |
| `nps` | smallint NOT NULL | CHECK BETWEEN 0 AND 10 |
| `rating` | smallint NOT NULL | CHECK BETWEEN 1 AND 5 |
| `comment` | text | CHECK NULL or `char_length` BETWEEN 1 AND 1000 |
| `comment_purged_at` | timestamptz | CHECK `comment_purged_at IS NULL OR comment IS NULL` |
| `contact_consent` | boolean NOT NULL | the unticked box |
| `consent_version` | text NOT NULL | CHECK `btrim <> ''`; the label of the page text shown (questions and contact sentence), the `intake-consent.ts` rule: add a label, never edit one |
| `channel` | text NOT NULL | CHECK IN (`email`, `sms`); copied from the code row |
| `sent_at` | timestamptz NOT NULL | the code's `issued_at` |
| `submitted_at` | timestamptz NOT NULL DEFAULT now() | |

Index `(tenant_id, submitted_at DESC)` for the list. `patient_id`, `channel` and
`sent_at` are taken from the code row inside the submit door, never from the
caller. Table grants: REVOKE ALL from PUBLIC, `anon`, `authenticated`, `patient`;
then `GRANT SELECT ... TO authenticated` only. No INSERT, UPDATE or DELETE grant
to any app role.

A patient hard delete is already refused while the patient has appointments
(`apps/web/lib/patients/actions.ts`, `has_references`), and a survey needs an
appointment, so the patient FK never fires. The appointment hard delete
(`settings:manage`, password) is the one path that could reach a response: O6.

### 6.5 RLS

* Codes: RLS on, no policy, no grant. Unreadable by every app role.
* Responses, one SELECT policy for `authenticated`:
  `tenant_id = (select public.jwt_tenant_id())` AND
  (`(select public.jwt_role()) = 'owner'` OR
  (`(select public.jwt_role()) = 'admin'` AND the O2 rule)).
  The recommended O2 rule: the appointment's `location_id` is in
  `(select public.viewer_location_ids())`, the basis 0045 uses for admins. If
  the owner rules "every clinic", the admin arm is the role check alone.
* Therapist, reception, `patient`, `anon`: no rows, by the policy and by grant.

### 6.6 The doors (SECURITY DEFINER)

Every function: `SECURITY DEFINER`, `SET search_path = public`, owned by
`postgres` (0060's rule), REVOKE ALL from PUBLIC, `anon`, `patient` **by name**
(a REVOKE from PUBLIC does not touch a role granted by name), and the grant
listed. Every door takes the tenant and proves it in the same statement, so a
wrong pairing writes nothing. Names are proposals; the held PR fixes them.

| Function | Grant | What it does |
|---|---|---|
| `issue_survey_code(p_code_hash, p_tenant_id, p_appointment_id, p_channel)` returns text | `authenticated` | Reads the appointment in the tenant: status must be `completed`; recipient = `patient_id`; the patient's `survey_enabled` must be true. Takes a per-patient transaction lock, refuses when a code for the same patient was issued in the last 60 days, refuses a second code for the appointment. Returns `issued`, `cooldown`, `exists` or `not_eligible`. |
| `resolve_survey_code(p_code_hash)` returns (tenant_id, appointment_id, visit_ends_at) | `authenticated` | One row only when the code exists, is unconsumed, `now() < ends_at + 14 days`, and the appointment is still `completed`. Zero rows for every other case, identically. Never writes. |
| `submit_survey_response(p_code_hash, p_tenant_id, p_nps, p_rating, p_comment, p_contact_consent, p_consent_version)` returns boolean | `authenticated` | Locks the code row, re-checks the resolve conditions, inserts one response, sets `consumed_at`, writes one `audit_log` row. False, with nothing written, on any failure. |
| `opt_out_survey(p_code_hash, p_tenant_id)` returns boolean | `authenticated` | On a live code: sets the code's patient's `survey_enabled = false`, consumes the code, writes one `audit_log` row. |
| `purge_expired_survey_comments(p_tenant_id)` returns integer | **none**; EXECUTE revoked from `anon`, `authenticated`, `patient` and `service_role`, so only the owning role runs it (0087's shape) | Refuses a NULL tenant. Sets `comment = NULL, comment_purged_at = now()` where `submitted_at <= now() - interval '24 months'` and a comment remains. One `audit_log` row per purged response. Scores are kept (default 10). An UPDATE, never a DELETE. |

The app calls the first four through `withReminderTenantContext`, as
`confirm-code-store.ts` calls 0074's doors. No service-role handle.

The existing tests that count SECURITY DEFINER functions move by four callable
doors plus one owner-only function; the expected count is a sum and is updated
in the held PR, not guessed.

### 6.7 Audit and retention

* `audit_log` rows written by the doors (actor NULL, as for guest actions):
  `survey.submitted` and `survey.opt_out`, entity `appointment`, metadata
  `{ "channel": ... }` only. **Never a score, a comment or the consent choice**
  (rule 7: PII never in logs; the comment is treated as health data).
  `survey.comment_purged`, entity `appointment_survey_response`, metadata `{}`.
* Staff turning a patient's switch off (if O1 (c) is ruled) writes
  `patient.update` through the existing patient update path; the held PR's
  rehearsal proves that path's role can write the new column and no role
  outside it can.
* Retention (default 10): the purge function above, driven once per tenant by a
  daily job modelled on `apps/web/lib/guest-intake/retention.ts` (checks the
  table exists first, lists tenants, one call per tenant, logs counts only).
  The job must ship before the oldest answer is 24 months old; it can ship
  after v1.

## 7. The app changes (after JP's copy review)

### 7.1 The send path (Tier B: send path)

* `dispatchSurvey` replaces `dispatchFollowUp` inside the same Inngest function
  (5.1). `FOLLOW_UP_EMAIL`, `FOLLOW_UP_SMS` and the two `follow_up.*` registry
  entries are removed (default 7); historical `reminder_dispatches` rows keep
  their `follow_up.*` template ids.
* New templates `SURVEY_EMAIL` and `SURVEY_SMS`, pt from JP's approved copy and
  en translated from it (section 8), with new registry entries `survey.email`
  and `survey.sms` entering `approved: false`.
* The code module reuses `confirm-code.ts`'s alphabet, length (8) and HMAC.
  Recommended: the same key with a `survey:` domain prefix on the HMAC input,
  so no new secret is needed (O7).
* New render tokens: `survey_link`, `survey_expiry_date` (visit date plus 14
  days, long form).

### 7.2 The guest page (Tier B: auth-adjacent guest write)

`apps/web/app/s/[code]/page.tsx` and `actions.ts`, per 5.2. The consent label
list lives beside `intake-consent.ts` with a test pinning the sha256 of the
shown text to the current label.

### 7.3 The staff list (Tier B: data access and a capability)

* New capability `surveys:read`, owner and admin only, in
  `packages/auth/permissions.ts`; the permission-matrix tests updated.
* A section of Comunicações (`apps/web/lib/nav/comms-sections.ts`), so no new
  sidebar row and no NAV-01 order change (O3). The route redirects a role
  without the capability; the query reads through RLS (`runScoped`).
* Columns: visit date, patient, therapist, clinic, recommendation, satisfaction,
  comment, contact consent, channel, answered at. Newest first, a month filter,
  and "Abrir ficha" for the patient.

### 7.4 The portal switch (Tier B: patient profile write)

`surveyEnabled` joins the profile whitelist in
`apps/api/app/api/v1/patient/profile/route.ts` and `apps/api/lib/patient/profile.ts`,
and the account screen gains the third switch. The portal's email fallback
`?? false` against a database default of true (`AccountView.tsx:176`) is a known
mismatch; the new switch uses `?? true`, matching its default.

### 7.5 What goes live when

Merged code sends nothing: the entries are unapproved and the flag is off. Going
live is three owner steps (Tier D): JP's approval recorded in the registry by a
pull request, the flag set by the owner, and the RGPD confirmation (O4).

## 8. Out of scope in v1

* An alert on low scores (default 8).
* A survey for the NESA second patient (default 9).
* A survey after "Corrigir estado" to Concluída (O8).
* The monthly NPS figure and any chart (O5).
* Therapist access to any answer (default 5 and the ruling).
* English copy review: the en strings are translated from JP's approved pt text
  in the app PR and listed for approval there; J6 in the copy file asks who
  approves them.
* Export of answers, and answers shown on the patient file.
* Any change to reminder timing, the confirm link or SMS STOP.

## 9. The tests each part needs

### 9.1 The held migration (DB-gated CI and the throwaway rehearsal)

* **Isolation matrix** on responses: owner of tenant A reads A's rows only;
  admin per O2 (own clinic yes, other clinic no, printed as OK/VACUOUS/FAIL,
  never passing on an empty set); therapist, reception and `patient` read zero
  rows; `anon` gets permission denied. Each role measured as an assigned
  principal with its real JWT claims.
* **Direct writes refused**: INSERT, UPDATE, DELETE on both tables by
  `authenticated`, `patient` and `anon` fail with 42501; SELECT on codes fails
  for every app role.
* **Grants asserted by name** for every function and role, including
  `service_role` on the purge function; a REVOKE from PUBLIC alone is not
  accepted as proof.
* **issue**: wrong tenant writes nothing; a non-completed appointment is
  refused; `survey_enabled = false` is refused; a second code for the same
  appointment is refused; a second patient code inside 60 days is refused and
  one at 61 days is issued (timestamps seeded in the database, because a fake
  JavaScript clock does not move `now()`); **two concurrent issues for one
  patient produce exactly one code**.
* **resolve**: unknown, consumed, expired (ends_at + 14 days passed) and
  status-changed codes return the same zero rows; a live code returns one row;
  a resolve writes nothing (row counts and `consumed_at` unchanged).
* **submit**: a valid submit writes one response, consumes the code and writes
  one audit row whose metadata holds no score and no comment; a replay returns
  false and writes nothing; `nps` below 0 and at 11, `rating` at 0 and 6, a 1001-character
  comment and a blank consent label are refused by the CHECKs; `patient_id` and
  `channel` come from the code even when the caller would have supplied others.
* **opt_out**: flips only the code's patient, consumes the code, leaves both
  reminder switches untouched, writes one audit row.
* **purge**: nulls only comments older than 24 months, keeps scores, refuses a
  NULL tenant, refuses every app role, writes one audit row per purged row, and
  touches no other tenant.
* **Column grant**: the `patient` role's UPDATE column list after the migration
  equals the list before plus `survey_enabled`; a patient can flip their own
  switch and not another patient's.
* **Rehearsal**: applies clean at production's position; a before/after profile
  of `patients` shows no row changed; one mutation sweep over every predicate of
  the doors and policies, survivors listed (the owner's "one mutation sweep per
  op").

### 9.2 The send path

* The pt SMS renders as one GSM-7 segment of at most 160 characters for the
  longest date and a host of 32 characters, and throws beyond it; the copy has
  no accents and no dash characters.
* Email: no unfilled placeholder; plain text.
* The registry holds `survey.*` at `approved: false` and no longer holds
  `follow_up.*`; a test fails if a survey entry is approved without `approvedBy`
  and `approvedAt`.
* Dispatch matrix: both channels allowed gives email only; SMS only when there
  is no email or the email switch is off; neither gives a suppressed row with
  its reason; survey switch off, cooldown, status changed, flag off and
  unapproved each give a suppressed row; `patient_2_id` never receives one.
* INC-CONFIRM-07: a render that throws leaves no code row.
* The Inngest function id and idempotency key are unchanged (asserted).

### 9.3 The guest page

* GET never writes (the resolve door only, asserted by spy).
* Unknown, expired, spent and status-changed codes produce byte-identical HTML.
* The page never renders a therapist name, service name, time or patient name.
* POST: malformed code refused before any database call; rate limit applied
  before the door; no field value in any log line or redirect URL; `noindex`.
* e2e on the lane stack: answer once, see the thank-you page, reopen the link,
  see the generic page; opt out, see the opt-out page, and the patient's switch
  reads off. Test hosts use reserved `*.invalid` names only.

### 9.4 The staff list and the switch

* `surveys:read` held by owner and admin only (permission matrix); therapist
  and reception are redirected from the route and see no Comunicações section
  for it.
* The list query returns zero rows for an admin of another clinic (if O2 rules
  own clinics) and never passes on an empty fixture.
* i18n parity: every new pt key has an en key.
* The portal switch round-trips through the profile API; the reminder switches
  do not move when it does.

## 10. The pull request plan

At most one pull request in checks plus one being built (R3).

| # | Pull request | Tier | Opens when |
|---|---|---|---|
| 1 | **This one**: the spec and the pt-PT copy | A (docs) | now |
| 2 | The held migration: the pending file, DB tests, rehearsal record, apply document with sha256 sidecar, GREEN dispatch, question block | C, held unarmed, `held-for-apply` | after O2 and O6 are ruled (it can be authored to the recommendations and held) |
| 3 | The send path and templates (7.1), dark | B, R4 | after JP's copy review and after `0100` is applied |
| 4 | The guest page (7.2) | B, R4 | after 3 |
| 5 | The staff list, the capability and the portal switch (7.3, 7.4) | B, R4 | after 4 |
| 6 | JP's approval recorded in the registry | D, the owner | when JP approves and the owner sets the flag |
| 7 | The retention job (6.7) | B, R4 | any time before the oldest answer is 24 months old |

Pull requests 3 to 5 merge only after `0100` is on production, because a call
to a function that does not exist yet raises 42883 and aborts its caller; each
also checks that the tables exist and fails closed to "not sent" when they do
not.

## 11. Open questions for the owner

None of these is decided here. Each has a recommended default. The ten ruled
defaults do not answer them.

| # | Question | Options | Recommended |
|---|---|---|---|
| O1 | How does a patient without a portal account opt out? | (a) the portal only, as default 4 says; (b) plus a button on the survey page; (c) plus a staff toggle on the patient file | (b) and (c): every message then carries a working opt-out, and a patient who phones can be answered |
| O2 | Which answers does an admin see? | (a) every clinic in the tenant; (b) only appointments at the admin's own clinics, the 0045 basis | (b), matching Estatísticas and the clinical records rule |
| O3 | Where does the staff list live? | (a) a section of Comunicações; (b) a new sidebar row | (a): no NAV-01 order change |
| O4 | RGPD: may the clinic send the survey on legitimate interest, with an opt-out in every message? | confirmation from whoever is responsible for RGPD | confirm before the flag is set; building can proceed |
| O5 | A monthly NPS figure on the list? | (a) in v1; (b) later | (b), as the proposal said |
| O6 | Deleting an appointment that has an answer | (a) refuse, as for notes, records and invoices; (b) delete the answer with it | (a): an answer is something a patient gave and is not lost silently |
| O7 | The key for survey codes | (a) the confirm code key with a `survey:` prefix; (b) a new secret | (a): no new secret to set |
| O8 | Corrigir estado to Concluída | (a) sends nothing, as today; (b) sends a survey | (a) in v1 |

## 12. The copy

Every string a patient or staff member will read is in
`docs/design/SAT-01-copy-pt.md`, numbered, with where it appears, and the
questions for JP. The same file is in the owner's handover folder as
`SAT-01-copy-pt-for-JP.md` to forward. No app pull request opens before JP's
review comes back.
