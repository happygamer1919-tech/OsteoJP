# One-action token flow and patient audit log — technical description

Prepared for the clinic's data-protection counsel. Plain technical English.
No secrets: environment variables are named, never valued.

**Status of this document.** It describes the SPECIFICATION agreed after
counsel's rulings of 2026-08-03. Sections are marked **BUILT** or **SPECIFIED**.
Nothing here is a claim that unbuilt behaviour exists. As of this writing the
token flow is partly built: signing and verification exist, single-use
consumption and the audit log do not.

---

## 1. Purpose

A patient receives an appointment reminder by email (48h before) or SMS (24h
before). The message may carry a link that lets the patient confirm or cancel
that appointment without logging in.

The link is a **one-action token**. It is not a login, it grants no session, and
it cannot be exchanged for one.

---

## 2. Token issuance — BUILT

Issued at reminder render time, immediately before the message is handed to the
transport. Never issued in bulk or in advance.

The token is a two-part string, `<payload>.<signature>`:

- **payload** — base64url of a compact JSON object containing: tenant identifier,
  appointment identifier, and an expiry instant (`exp`, Unix seconds).
  It contains **no patient identifier, no name, no contact detail, and no
  clinical data.**
- **signature** — HMAC-SHA256 over the encoded payload, keyed by a server-side
  secret held only in the deployment environment (`REMINDERS_LINK_SECRET`).

Current length is 183 characters for the token, 208 for the full URL.

The secret is required at boot; there is no fallback value. A deployment without
it fails rather than issuing unsigned links.

## 3. Verification — BUILT

On redemption the server recomputes the signature over the received payload and
compares it to the presented signature using a **constant-time** comparison, so a
failed comparison does not leak information through timing. Any of the following
yields an identical generic rejection: malformed token, bad signature, expired
token, unknown appointment.

If the signing secret is absent, verification refuses and **logs a distinct
operational error**. It returns the same generic rejection to the caller, so a
misconfigured deployment is never distinguishable from a forged token by anyone
holding a link.

## 4. Validity window — SPECIFIED

Counsel requires 24 to 72 hours from issuance, never past the appointment start.

**Rule adopted, per offset:**

| Reminder | Issued | Token valid until | Effective window |
|---|---|---|---|
| 48h email | 48h before start | appointment start | **48 hours** |
| 24h SMS | 24h before start | appointment start | **24 hours** |

**Justification.** Tying expiry to the appointment start rather than to a fixed
duration satisfies both constraints at once with a single rule, and it means a
token is dead the moment it could no longer be acted on meaningfully. Both
offsets land inside the 24–72 hour band by construction, so no offset can drift
outside it without also changing the reminder schedule. A fixed 72-hour window
would outlive the appointment and leave a live token for a visit that has already
happened.

## 5. Scope — one action, and which action — SPECIFIED

A token authorises exactly one action on exactly one appointment. It cannot be
replayed for a different appointment, a different action, or a different patient.

The permitted action depends on the offset, because the clinic's cancellation
cutoff is **24 hours** before the appointment (owner ruling, 2026-08-03):

| Reminder | Actions offered | Reason |
|---|---|---|
| 48h email | Confirm **and** cancel | Sent outside the cutoff |
| 24h SMS | **Confirm only** | Arrives at or inside the cutoff; cancelling is no longer permitted |

**The cutoff is enforced at redemption, not only at issuance.** A cancel link
issued at 48h is legitimately outside the cutoff when it is created, but the
patient may click it 30 hours later, inside the cutoff. The server re-evaluates
the cutoff against the clock at redemption and refuses with pt-PT copy directing
the patient to telephone the clinic. Enforcing only at issuance would leave a
window in which a link that was valid when sent performs an action the clinic
has ruled out.

## 6. Single use — STORAGE AUTHORED, BEHAVIOUR NOT YET BUILT

Counsel requires that a consumed token be refused. A signature alone cannot
express this: a correctly signed token verifies identically every time it is
presented. Single use therefore requires **server-side consumption state**.

**Status, precisely.** The consumption table is defined in migration `0054`,
authored and under review, not yet applied and not yet written to by any code.

A consumption record keyed by a **hash of the token** (never the token itself),
written in the **same database transaction as the action it authorises**. The
action and the record commit together or not at all, so a crash between them
cannot leave an action performed with the token still redeemable, nor a token
burned with no action taken.

**How single use is actually guaranteed.** The token hash is the table's primary
key, and the insert happens inside the transaction that performs the action. A
second redemption therefore loses on the primary key and its entire transaction
rolls back, the action included. This matters because the obvious alternative —
read whether the token is consumed, then act, then record it — is not safe: two
redemptions arriving together would both read "not consumed" and both proceed.
The guarantee is the constraint, not a check.

The stored value is constrained to 64 lowercase hexadecimal characters, which a
token itself can never be, so storing a live token by mistake is rejected by the
database rather than silently accepted.

Redemption of an already-consumed token yields the same generic rejection as an
invalid one.

## 7. Landing page — SPECIFIED

Opening a link does **not** perform the action. The page shows a summary and
requires an explicit confirmation: one tap to open, one tap to confirm, then the
action executes.

Displayed: appointment **date**, **time**, **location**, and the action offered.

**Not displayed: the service or treatment name.** Adopted deliberately. Several
service names in this clinic identify a treatment type, so showing them would
disclose health data to anyone holding the link — including someone reading a
shared phone's lock screen. Since the page cannot show the name for some services
without disclosing treatment type, and a page whose contents vary by service
leaks by omission, no service name is shown for any appointment.

No clinical notes, no diagnosis, no practitioner-authored content ever appears.

## 8. Audit log for patient-triggered writes — STORAGE AUTHORED, BEHAVIOUR NOT YET BUILT

Covers both patient paths: token redemption and authenticated portal actions.

**Status, precisely.** The table is defined in migration `0054`. At the time of
writing that migration is authored and under review; it has not been applied to
production, and no code writes to the table yet. Nothing in this section is a
claim that the behaviour exists.

| Field | Content | Stored as |
|---|---|---|
| Author | The patient (identifier) | `patient_id` |
| Authentication means | `signed_token` or `otp_session` | `auth_means` |
| Timestamp | UTC, server clock | `occurred_at` |
| IP address | Of the requesting client | `ip` |
| Appointment | Appointment identifier | `appointment_id` |
| Action | e.g. `confirm`, `cancel`, `reschedule` | `action` |
| Result | Success, or the reason for refusal | `outcome` + `reason` |

**Why Result is stored as two columns.** As a single free-text field, finding
every refusal would require knowing every phrasing any writer had ever used, and
a phrasing that drifted would hide refusals silently — the exact failure the
field exists to prevent. `outcome` is therefore a two-value field (`success` or
`refused`) that makes refusals findable by predicate, and `reason` carries the
refusal text. The database refuses a refusal with no stated reason. The two
columns together are this Result field; neither is an addition to it.

**Author and Appointment may be empty, deliberately.** A forged or malformed
token is refused *before* anything is identified, and that refusal must still be
recorded. Requiring an identifier would force the code either to invent one or
to skip the row.

**Integrity.** Append-only, in three independent layers:

1. **No `UPDATE` or `DELETE` privilege** is granted on either table to the
   application roles.
2. **No `UPDATE` or `DELETE` policy exists**, and the database denies any
   command for which no policy exists.
3. **A trigger refuses modification** — `UPDATE`, `DELETE` and `TRUNCATE` alike.

The third layer is not redundant. Row-level security does not apply to a role
holding the `BYPASSRLS` attribute, and it does not gate `TRUNCATE` at all, so
layers 1 and 2 alone would leave the trail erasable by a single statement. The
trigger closes both.

Refusals are recorded as well as successes: a rejected cancellation attempt
inside the cutoff is exactly the kind of event a later dispute turns on.

**Retention.** The retention hook is the `occurred_at` timestamp, with a
dedicated index sized for a scheduled purge. The retention period itself is a
decision for the clinic and counsel and is **not set in code**; no default period
is implied by the presence of the hook. A purge must run with sufficient
privilege to pass the trigger above, so erasure is an explicit privileged act
rather than something the application can perform.

## 9. Payload minimisation — BUILT

Background jobs run on a third-party queue (Inngest, US). Events dispatched to it
carry **identifiers and instants only**: appointment identifier, tenant
identifier, scheduling instants, channel, offset. **No name, no telephone number,
no email address, no clinical data.**

Contact details are read at execution time, inside a tenant-scoped database
query, used to address the message, and discarded. They are never persisted in
the queue and never cross a border in the event body.

This is enforced by an automated test (`payload-minimization.test.ts`) that fails
if any field whose name suggests contact data or PII is added to an event type,
and separately fails if any new field appears that is not on an explicit
allowlist. The check was verified to fail when a `patientPhone` field is
introduced.

## 10. Subprocessors

| Subprocessor | Function | Location | Transfer basis |
|---|---|---|---|
| Twilio | SMS delivery | US | DPF, SCC in reserve |
| Resend | Email delivery | US | SCC module 3 |
| Inngest | Background job queue | US | SCC module 3 |
| Supabase | Database, authentication, storage | **EU (Frankfurt), Central EU** | Intra-EU; no transfer |
| Vercel | Application hosting | US company; compute region `fra1` (Frankfurt) | DPF, SCC in reserve |

**Provenance note, so counsel can weigh it.** The Supabase region and the Vercel
compute region are stated in the project's committed configuration and
documentation. They have **not** been re-read from the live provider consoles for
this document. If counsel needs them as verified fact rather than as documented
configuration, the clinic owner should confirm both from the provider dashboards.

Patient telephone numbers and email addresses reach Twilio and Resend
respectively at send time, which is the transfer those bases cover. Message
bodies contain appointment date, time, location and the clinic telephone number.
They contain no clinical content.

---

## 11. Environment variables referenced

Names only.

`REMINDERS_LINK_SECRET`, `REMINDERS_RESCHEDULE_BASE_URL`, `REMINDERS_LIVE_SEND`,
`REMINDERS_EMAIL_FROM`, `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_MESSAGING_SERVICE_SID`,
`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.

## 12. Open items

1. **Retention period** for the patient audit log — clinic and counsel.
2. **Reschedule minimum notice** — with the clinic owner; the constraint is not
   built pending his answer.
3. Whether **ficha clínica acceptance** satisfies the pre-contractual
   communication duty for bookings concluded through the portal, or whether the
   portal needs its own acceptance step. See the work notes.

   **SHARPER AS OF 2026-08-07 (W13-05), AND STILL NOT ANSWERED HERE.** The ficha
   acceptance flow is now BUILT and live in the staff platform:
   `patient_terms_acceptances` (migration 0058, applied), the staff-side checkbox
   on the ficha clínica, and a per-patient gate on the fee line. LOOP 5 was
   explicitly instructed to flag this question and not to answer it, and it did
   not.

   What building it changed is that the question is no longer hypothetical, and
   the gap is now measurable rather than theoretical:

   - Acceptance is captured **only** by a staff member, in the room, on the ficha.
   - A patient who books entirely through the portal and has not yet been seen
     therefore has **no acceptance row**, and cannot obtain one without a visit.
   - The fee line consequently never reaches that patient, because the per-patient
     gate fails closed. **That is the safe direction**, and it is why building the
     mechanism does not create an exposure while this question is open.
   - The open risk is the opposite one and is counsel's to weigh: whether a
     portal-concluded booking needs the terms communicated **at booking time**,
     in which case a staff-side-only capture is insufficient regardless of what
     the fee line does.

   **Nothing in the portal booking flow was touched**, per LOOP 5 section 5.
   Deciding this is external counsel's under WF-15; engineering owns no part of
   the answer, only the flag.
