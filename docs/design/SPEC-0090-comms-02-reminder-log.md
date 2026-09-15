# SPEC 0090, COMMS-02: the reminder log's missing half

**Status: SPEC ONLY. No migration file exists, and this document authors none.**
Author: PURPLE, 2026-09-14 overnight dispatch (SR-62). Derived from `origin/main` at `1dde3111`.

**Number and order.** 0088 (authored by BLUE, applied by GREEN) is in flight, and only one
migration may be in flight at a time. #1338's parked
`packages/db/migrations-pending/NEXT-AFTER-0088_attachments_soft_delete.sql` is promoted to
0089. This spec's migration takes **0090** only once 0089 is applied and merged. If that
order changes, the number is taken at authoring time, never before.

Card: `COMMS-02-reminder-log-migration`. Closes question Q-COMMS-01-1 (`docs/QUESTIONS.md`).

---

## 0. The owner's ruling this spec is built on (2026-09-14, overnight)

> The recipient number is stored MASKED in the form `+3519xxxxx699`. The full number is
> NEVER persisted.

**The consequence, stated because it was chosen deliberately.** The log answers "which
number PATTERN was this reminder sent to". It does NOT answer "was it the RIGHT number" at
full precision. `+3519xxxxx699` keeps the country code, the first national digit and the
last three digits. Any two mobile numbers that share those produce the same masked value,
so a typo in the five hidden digits is invisible to the log. Proving the exact destination
still needs the provider's own message record, looked up by the message id the row already
carries in `provider_message_id`. This is the RGPD trade the owner made: the database never
holds a second copy of a patient's phone number, and the log is a pattern check, not proof
of the exact destination.

---

## 1. What exists today, and why INC-lv cannot be closed from the database

| Fact | Where |
|---|---|
| `reminder_dispatches` holds one row per ATTEMPT to hand a message over (`sent`, `suppressed`, `provider_error`). It has no recipient column, by ruling: "a hash nobody needs is a pseudonymous identifier nobody can justify". | `packages/db/migrations/0075_reminder_dispatches.sql`, sha256 `e268bc0ddbaa72358e8b6d5fb47ce6087b9f7013ca804e48c30bd32f25360aaa` |
| A therapist reads zero rows. The only SELECT policy admits owner, admin and reception. | same file, policy `reminder_dispatches_staff_select` |
| `scheduleAppointmentReminders` computes the due offsets and fans out `appointment/reminder.due` events. It writes NOTHING to the database. When no offset is still in the future it returns `{ scheduled: 0 }` and leaves no trace anywhere except Inngest. | `apps/web/lib/reminders/inngest/functions.ts:61-91` |
| The SMS number is normalised at send time (`normalizePhonePT`) and handed to Twilio. It is not recorded. | `apps/web/lib/reminders/dispatch.ts:271-336` |
| The ledger writer, and the status callback's UPDATE, which sets only `provider_status`, `provider_error_code` and `status_at`. | `apps/web/lib/reminders/dispatch-ledger.ts` (`recordDispatch`; UPDATE at `:132-139`) |

**The gap that keeps INC-lv open** (card `INC-lv-sms-reminder-not-received-20260912`). The
card names three candidate causes:

- **(a)** no `appointment/scheduled` event was ever handled;
- **(b)** the booking or the move came after the 24h send instant, so no SMS leg was
  scheduled;
- **(c)** the run reached dispatch and was suppressed or refused.

A `reminder_dispatches` row answers (c). **Nothing in the database separates (a) from
(b)**, because the scheduling decision is recorded nowhere. 0090 records it.

**0090 is NOT retroactive, and it does not close INC-lv itself.** That slot (2026-09-12
11:00, Linda-a-Velha) was scheduled before any schedule row existed, and no backfill can
recreate a decision that was never written down. INC-lv still closes only on the #1324
production read plus the Inngest dashboard. 0090 makes the NEXT incident of this shape
answerable from the database.

---

## 2. The migration, in three parts

### 2.1 New table `reminder_schedule_legs`: the schedule-time record

One row per reminder OFFSET, for each `appointment/scheduled` event the scheduler handles,
**including the offsets it decided NOT to schedule**. With today's `REMINDER_OFFSETS` (48h
email, 24h SMS; `apps/web/lib/reminders/offsets.ts:31-34`), every handled event writes
exactly two rows.

| Column | Type | Rule |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `tenant_id` | `uuid NOT NULL` | FK `tenants(id)`. Architecture rule 1. |
| `appointment_id` | `uuid NOT NULL` | FK `appointments(id) ON DELETE CASCADE`, for 0075's reason: operational telemetry, not a legal record. |
| `appointment_starts_at` | `timestamptz NOT NULL` | The `startsAt` the event carried. A reschedule shows up as a later row with a different value. |
| `offset_id` | `text NOT NULL` | CHECK `btrim(offset_id) <> ''`. Text, not an enum, for 0075 ruling 1's reason. |
| `channel` | `text NOT NULL` | CHECK `channel IN ('sms', 'email')` |
| `send_at` | `timestamptz NOT NULL` | The computed send instant, whether or not it was scheduled. |
| `disposition` | `text NOT NULL` | CHECK `disposition IN ('scheduled', 'not_scheduled_past')`. `not_scheduled_past` is cause (b), written down. |
| `source_event_ts` | `bigint NOT NULL` | The Inngest event's `ts`, in milliseconds. Part of the dedupe key. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | When the scheduler handled the event. |

- **UNIQUE `(tenant_id, appointment_id, offset_id, channel, source_event_ts)`.** A retried
  step, or a duplicate delivery of the same event, inserts nothing (`ON CONFLICT DO
  NOTHING`). A reschedule is a new event with a new `ts`, so it writes new rows.
- **INDEX `(tenant_id, appointment_id, created_at DESC)`.**
- **Append-only, with no state column.** "Superseded" is derived, not stored: a leg is
  superseded when a later row exists for the same appointment. No row is ever updated, so
  the table carries no UPDATE and no DELETE grant at all.
- **Build check, HALT if it fails.** The Inngest SDK must expose `event.ts` inside
  `scheduleAppointmentReminders`. Nothing in `apps/web/lib/reminders` reads it today. If it
  is absent, the dedupe key above is wrong and the build returns to this spec. It does not
  invent a substitute key.

### 2.2 `reminder_dispatches`: the masked recipient and the link to the leg

- **`recipient_masked text NULL`**, with:

  ```sql
  CONSTRAINT reminder_dispatches_recipient_masked_shape
    CHECK (
      recipient_masked IS NULL
      OR (channel = 'sms' AND recipient_masked ~ '^\+351[0-9]x{5}[0-9]{3}$')
    )
  ```

  The regular expression admits exactly the ruled shape: `+351`, one digit, five literal
  `x`, three digits. **A full number such as `+351` followed by nine digits fails the
  CHECK**, so the database refuses to store a full number even if a future writer regresses.
  That is the machine-verifiable form of "NEVER persisted".
- **`schedule_leg_id uuid NULL`**, FK `reminder_schedule_legs(id)`, `ON DELETE NO ACTION`.
  A leg is only ever removed by the appointment cascade, which removes the dispatch rows in
  the same statement. The column is NULL for rows written before 0090, and for sends whose
  event was already sleeping when the code deployed.
- **UPDATE becomes column-level.** Today `authenticated` holds table-level UPDATE (0075).
  0090 replaces it:

  ```sql
  REVOKE UPDATE ON public.reminder_dispatches FROM authenticated;
  GRANT UPDATE (provider_status, provider_error_code, status_at)
    ON public.reminder_dispatches TO authenticated;
  ```

  The status callback writes only those three columns (`dispatch-ledger.ts:132-139`), so a
  recipient or a link can never be rewritten after the fact. This is asserted with
  `has_column_privilege`, never by attempting the write.
- **`COMMENT ON TABLE` is rewritten.** The sentence "Carries no recipient" is replaced by
  the masked-recipient ruling and its date, so the catalogue does not contradict the column.
- **No backfill, and a backfill from `patients.phone` is FORBIDDEN.** A patient's CURRENT
  number is not the number a past message went to. Writing it into historical rows would
  manufacture evidence.

### 2.3 Therapist RLS

Each of the two tables gets a separate **PERMISSIVE FOR SELECT** policy. Never `FOR ALL`,
which would also grant DELETE.

```sql
CREATE POLICY "<table>_therapist_select" ON public.<table>
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) = 'therapist'
    AND EXISTS (
      SELECT 1
        FROM public.appointments a
       WHERE a.id = appointment_id
         AND a.tenant_id = (select public.jwt_tenant_id())
         AND (a.practitioner_id = (select auth.uid())
              OR a.practitioner_2_id = (select auth.uid()))
    )
  );
```

- **Why 0086's shared-resource disjunct cannot widen this.** The `EXISTS` subquery runs
  under `appointments_rls` for the therapist, and a policy on a subquery can only REMOVE
  rows. The explicit predicate is a conjunction on `practitioner_id` or
  `practitioner_2_id = auth.uid()`. So a NESA appointment on which the therapist holds
  neither slot fails it, even though 0086 lets that therapist read the appointment itself.
  The `created_by = auth.uid()` arm is excluded the same way: a therapist who booked a
  colleague's appointment does not see its reminders. Section 4 proves this by test; this
  paragraph is the reasoning, not the proof.
- **`reminder_schedule_legs` policies, the complete list:**
  - `reminder_schedule_legs_staff_select`, FOR SELECT: owner, admin and reception of the
    tenant, mirroring 0075;
  - `reminder_schedule_legs_therapist_select`, FOR SELECT: above;
  - `reminder_schedule_legs_pipeline_insert`, FOR INSERT: owner and admin, the
    `withReminderTenantContext` seam 0075 uses.
- **Grants for the new table.** `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated` and
  `patient`, each written out by name (the 0072 and 0075 lesson), then
  `GRANT SELECT, INSERT ON public.reminder_schedule_legs TO authenticated`. No UPDATE, no
  DELETE.
- **App capability.** `reminders:log_read` is added to `therapist` in
  `packages/auth/permissions.ts`, in the same PR. `listReminderLog` keeps reading through
  `runScoped` as the viewer, so the policy decides the rows.

---

## 3. Writers (same PR as the migration, merged only after the apply)

1. **Masking happens in the app, before the database is called.** A pure
   `maskPhoneForLog(e164)` in `packages/notify`: the input must match `^\+351\d{9}$`, or the
   function returns null; the output is `+351`, the first national digit, `xxxxx`, and the
   last three digits. The full number never travels to Postgres, so it cannot appear in a
   statement log or an error payload either. `DispatchLedgerRow.recipientMasked` is typed as
   a branded string that only this function returns, so passing a raw number is a compile
   error. A unit test pins the ruled example shape, and null for everything else.
2. **Which rows carry it.** Every SMS row whose number normalised: `sent`, `provider_error`,
   and a `suppressed` row with reason `landline` (the number normalised, but the channel
   cannot take it). `invalid_phone` rows and every email row: NULL.
3. **`scheduleAppointmentReminders`** gains one `step.run("record-schedule", ...)` BEFORE its
   `due.length === 0` return. It computes the disposition for EVERY offset in
   `REMINDER_OFFSETS` and inserts through `withReminderTenantContext` with `ON CONFLICT DO
   NOTHING`. Like `recordDispatch`, it never throws into scheduling: a failed write is
   logged with ids only, and scheduling continues. The honest consequence: a missing leg row
   means "the scheduler did not handle an event, OR its write failed", and the log line is
   the tie-breaker.
4. **The link.** `ReminderDueData` gains an optional `scheduleLegId`, passed through
   `sendAppointmentReminder` into `recordDispatch`. `REMINDER_IDEMPOTENCY_KEY`
   (`functions.ts:58-59`) is built from named fields, so an added payload field does not
   change run identity.

---

## 4. Tests in the same PR (DB-gated, run in CI's RLS job)

- **Therapist A,** a practitioner on appointment X, reads X's legs and dispatches.
  **Therapist B,** on neither slot of X, reads 0 rows. Both are measured as the assigned
  principal, and "A reads a narrowed, non-empty set" is asserted before "B reads zero".
- **NESA arm.** An appointment whose `practitioner_id` is the shared resource, at therapist
  B's location, with B on neither slot: B reads the appointment (0086) and reads 0 legs and
  0 dispatches.
- **`created_by` arm.** B created the appointment and is not a practitioner on it: 0 rows.
- **Therapist as `practitioner_2_id`:** reads.
- **Other roles.** Reception and admin read; the `patient` role reads nothing; another
  tenant reads nothing.
- **The CHECK.**
  - A full `+351` number with nine digits: refused.
  - The ruled masked shape on an `email` row: refused.
  - The ruled masked shape on an `sms` row: accepted.
  - Four `x` instead of five: refused.
- **Grants.**
  - `has_table_privilege('authenticated', 'reminder_schedule_legs', 'UPDATE')` and
    `'DELETE'`: false.
  - `has_column_privilege` on `reminder_dispatches.recipient_masked` UPDATE: false.
  - `has_column_privilege` on `reminder_dispatches.provider_status` UPDATE: true.
- **Writes.**
  - A therapist INSERT into either table: refused.
  - A duplicate leg insert with the same `source_event_ts`: inserts 0 rows.
- **The section 5 read** against a fixture holding one appointment of each cause: each cause
  comes back on its own row.

---

## 5. The read that closes the next INC-lv from the database (shape only, not a script)

For each appointment:

| What the database holds | Cause |
|---|---|
| No leg rows at all | (a) the scheduler never handled an event |
| The latest event's 24h SMS leg is `not_scheduled_past` | (b) booked or moved after the send instant |
| A `scheduled` leg with `send_at` in the past, and no dispatch row | the run never reached dispatch |
| A dispatch row | (c): outcome, reason, provider code, and the masked number |

When it is needed, it is authored as an SR-61 ref-addressed file and run by the owner or
GREEN, never by this lane.

---

## 6. Apply

- Authored after 0089 is applied and merged. PURPLE authors, GREEN applies (SR-63). Apply
  before merge.
- **Pre-check (read-only):**
  - `recipient_masked` and `reminder_schedule_legs` are absent;
  - the three 0075 policies are present, by name;
  - the journal head is 0089.
- **Post-check:**
  - the new policies and the CHECK are present, by name;
  - the `has_column_privilege` rows from section 4 hold;
  - the `reminder_dispatches` row count is unchanged.

---

## 7. Not in 0090

- **Email recipients.** Email rows keep a NULL recipient. Ruled 2026-09-14 (Q-SR62-P3-1: no).
- **Retention.** 0075 ruling 3 carded it separately. These tables grow the same way and
  inherit that card.
- **Recording the EMIT.** A leg records that the scheduler handled an event. An event that
  was never sent to Inngest (a Fisiozero import, OBS-07) looks the same as one Inngest never
  delivered. The emitters are out of scope.

---

## 8. Questions logged

- **Q-SR62-P3-1** (`docs/QUESTIONS.md`): does an email reminder row record a masked
  destination too? **RULED 2026-09-14 (owner): NO.** Email reminder rows keep a NULL
  recipient. The CHECK that admits `recipient_masked` only on `channel = 'sms'` is the final
  shape, not a placeholder awaiting a ruling.
- No question on this spec remains open.
