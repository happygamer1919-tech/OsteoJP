# Notification safety lane — work notes

Running record for the choke point, the approval registry, and the environment
sweep. Ground truth is the committed code; this file records decisions and open
threads that the code cannot state for itself.

## Count reconciliation (settled, do not drift again)

- **11 distinct patient-facing bodies**: 10 in `apps/web/lib/reminders/templates.ts`
  (48h, 24h, confirmation, follow-up, no-show, each in email and SMS) plus 1
  patient activation body in `apps/api/lib/auth/activation.ts`.
- **12 refusing registry entries**: 10 in web, plus 2 in api, because the single
  activation body is delivered on two channels and the registry is keyed per
  (id, channel) so an SMS approval can never leak into an email approval.
- Both numbers are correct; they count different things. Asserted in
  `apps/web/lib/reminders/notification-registry.test.ts`, not just documented.
- Earlier reports said "eight" (a miscount carried from the five-function audit)
  and then "eleven entries" (conflating bodies with entries). Both superseded.

## Root-domain fallbacks (item 4 scope)

| # | Location | Fallback | Status |
|---|---|---|---|
| 1 | `apps/web/lib/reminders/clients.ts:63` | `reminders@osteojp.pt` | REMOVED |
| 2 | `apps/web/lib/invites/email.ts:44` | `reminders@osteojp.pt` | REMOVED |
| 3 | `apps/api/lib/notify/clients.ts:85` | `no-reply@osteojp.pt` | REMOVED |
| 4 | `apps/web/lib/reminders/dispatch.ts:142` | `https://osteojp.pt` | REMOVED |
| 5 | `apps/web/lib/reminders/link-token.ts:81` | silent `null` when `REMINDERS_LINK_SECRET` is unset | FIXED (loud log, still returns null) |
| 6 | `apps/api/lib/auth/activation.ts:117` | `PATIENT_ACTIVATION_REDIRECT_URL` silently omitted | LEFT (dead code; see the AUTH thread below) |

Fallback 4 was cited as `dispatch.ts:136` in the briefing; the #760 merge shifted it
to `:142`. Same line, same defect.

Found by the item 4 sweep, beyond the four known:

- **5** was the sharpest. `signRescheduleToken` **throws** when the secret is
  absent; `verifyRescheduleToken` returned **null**, the same value it returns for
  a forged or expired token. A deployment missing the secret therefore presented to
  every patient as "invalid link" with no signal anywhere. It still returns null
  (the caller must not be able to distinguish a misconfiguration from a forgery)
  but now logs loudly first.
- **6** is dead code today and is left alone deliberately.

Judged benign, recorded so the next sweep does not re-litigate them:

- `TWILIO_SMS_FROM ?? TWILIO_MESSAGING_SERVICE_SID` (both apps) is a genuine
  either-or, not a degradation. Validated as "one of" rather than as two names.
- `PATIENT_ACTIVATION_CHANNEL` defaults to SMS by owner ruling. It does silently
  coerce an unknown value to SMS, which is worth revisiting if that path ever
  ships.

The verified Resend identity is on `send.osteojp.pt`, not the root domain, so
every removed fallback was a guaranteed send-time rejection wearing a
healthy-looking default. Fallback 4 is a link base URL: unset in prod means every
reminder and no-show email carries a reschedule link that 404s on the marketing
site.

`REMINDERS_EMAIL_FROM` is now **required on the invite path as well as reminders**.
Boot validation must list it for both apps.

**Naming smell, logged and NOT fixed in this lane:** a reminders-named env var
powers staff invites. Renaming or splitting it is a follow-up, not a blocker.

## Open threads for the portal Definition of Ready

- **`sendPatientActivation` grants a session by design.** It mints a Supabase
  recovery link and delivers it by SMS. That conflicts with Decision D (patient
  login is a 6-digit SMS OTP, phone-only identify) and with the ruling that a
  patient link is one-action and never escalatable into a session. It is dead
  code today (no caller; see `docs/handoff/WAVE-12-CLOSE-20260727.md:78`) and is
  now registered `approved:false` so wiring a route to it cannot make it live.
  **Candidate for outright deletion. Decide during AUTH work (DoR item 1), not
  in this lane.** It is deliberately excluded from the JP approval packet: a dead
  template must not consume a clinical owner's review.

## Residual risk: end-to-end suppression is unobserved

The gate is proven in unit tests. No reminder has executed end to end through
Inngest since the app was synced on 2026-08-03, so the suppression path has never
been seen in a real run.

**What Ivan should look for after this branch deploys.** Not actionable from the
build shell; this needs a prod observer.

- **Trigger:** the next real appointment created by clinic staff. That emits
  `appointment/scheduled`, which fans out to two functions,
  `send-appointment-confirmation` (immediate) and `schedule-appointment-reminders`.
- **Where:** Vercel function logs for the **osteojp-platform** project, and the
  Inngest **run history** for app `osteojp-reminders`.
- **Expected log line format**, one per suppressed send:

  ```
  [notify] suppressed template=confirmation.sms channel=sms appointment=<uuid> reason=template_unapproved
  ```

- **Expected reason is `template_unapproved`**, not `live_send_disabled`, even
  though `REMINDERS_LIVE_SEND` is currently `false`. The approval gate is checked
  first by design, so it reports the more decisive cause. Seeing
  `live_send_disabled` instead would mean the registry was bypassed and is worth
  reporting.
- **Expected Inngest outcome:** the run **succeeds**. A suppressed send is a
  no-op, not an error, so a failed run means something other than the gate.
- **Expected count:** exactly one suppression line per channel the patient has
  contact for. Patient defaults are `reminder_sms_enabled` true and
  `reminder_email_enabled` false, so a patient with a phone and no email
  preference produces one SMS line and no email line.


## JP approval packet (item 6)

`docs/notifications-approval-packet.md`, 537 lines. Written in pt-PT for a
clinical owner, not for engineers.

- **10 template sections**, one per registry entry, each with id, trigger, the
  authored template, a rendered example with real sample data, and for SMS the
  encoding and measured segment count. Every number in that file is generated
  from the shipping code with real fixtures, not written by hand.
- **Patient activation is excluded** per owner ruling: it is dead code and a
  candidate for deletion, and a dead template must not consume clinical review.
- **Two 24h variants** of the clinic-supplied wording, both accent-free GSM-7.
- `apps/web/lib/reminders/approval-packet.test.ts` fails if a registry template
  has no packet section. Prevents an eleventh body being approved in a batch that
  JP never saw.

### Measured facts worth keeping

| Fact | Value |
|---|---|
| Signed reschedule token | **183 chars** (link 208) |
| Clinic wording as supplied, filled + link | 371 chars, **not GSM-7**, **6 UCS-2 segments** |
| Variant A, short link | 122 chars, **1 segment** |
| Variant B, short link | 160 chars, **1 segment, zero margin** |
| Variant A/B with the CURRENT signed link | 303 / 341 chars, **2 / 3 segments** |
| All 5 shipped PT SMS bodies | GSM-7, 84-103 chars, **1 segment each** |

One segment for the clinic's wording is achievable **only with a short link**.
The 208-char signed link cannot fit. A clinic-domain short-link service is the
engineering prerequisite; until it exists the clinic wording costs 2-3 segments,
which is why the shipped SMS points at the clinic phone instead.

Variant B sits at exactly the 160 limit with **zero margin**: a longer phone
number or one extra word silently pushes it to two segments. Flagged in the
packet.

### Open with JP / lawyer (G8 batch)

The 50% no-show fee line. Announcing a fee by SMS does not make it enforceable;
it is generally only chargeable if the patient agreed somewhere. Two questions in
the packet: does a signed document already provide for it, and if not does JP want
one or does the line come out.

`REMINDERS_FEE_NOTICE_ENABLED` is the intended flag name, default OFF. It is
**specified, not built**, and the packet says so explicitly — claiming a
protection that does not exist yet is the exact pattern this lane has spent the
session removing. It gets built with the chosen variant, after the decision.

---

# Counsel and owner rulings, 2026-08-03

Legal basis for reminders: art. 6(1)(b) plus 9(2)(h). Contact data tied to an
appointment is art. 9 health data. **No consent needed for reminders**, which
settles a question this lane had been treating as open.

## Copy approvals — CLOSED

All ten patient bodies are `approved: true`, `approvedBy: "JP"`,
`approvedAt: "2026-08-03"`.

**Source: JP's written reply of 2026-08-03, a blanket approval of all ten bodies
as they appear in the packet.** Not a verbal relay, not inferred from silence.

Consequences worth stating plainly:

- The approval gate no longer stops anything. **`REMINDERS_LIVE_SEND` is now the
  only thing between an approved body and a real patient's phone.** The test
  `sends NOTHING with live send off, even though all 10 are approved` is the
  load-bearing one from here on.
- Patient activation stays **unapproved**: it was excluded from the packet as
  dead code, so a blanket approval of the packet must not reach it. Asserted.
- **Open:** JP has not chosen between the shipped 24h SMS body and variant A.
  Follow-up sent. If he picks variant A, that body enters the registry
  `approved: false` and goes through the gate like any other copy change.

## SMS opt-out posture — CLOSED

No email fallback when a patient disables SMS. Ratified by JP in writing
2026-08-03. Recorded in the packet's defaults matrix.

## Cancel cutoff — 24 hours (JP, 2026-08-03)

Portal and token cancel paths refuse inside 24h of appointment start, pt-PT copy
directing the patient to telephone.

**Design consequence, resolved:** the 24h SMS arrives *at* the cutoff, so its
link is **confirm-only**. The 48h email may offer cancel, but the cutoff is
re-evaluated **at redemption**, not at issuance — a cancel link created at 48h
can be clicked 30 hours later, inside the cutoff. Per-offset action matrix is in
`docs/rgpd-token-flow.md` §5.

## Reschedule minimum notice — PENDING JP

Unanswered. **The new-slot constraint is deliberately not built.** Do not infer a
value from the cancel cutoff; they are different decisions.

## Reschedule notifications — binding scope for DoR item 4

Every patient-initiated change (cancel and reschedule included) lands in the
in-app notification centre for reception and the assigned therapist. Owner-
mandated, no longer merely planned.

## Payload minimisation — now a compliance property

Counsel reviewed and requires it maintained. Enforced by
`apps/web/lib/reminders/payload-minimization.test.ts`, verified to fail when a
`patientPhone` field is added to an event type. The first version of that check
used a word-boundary match and **missed `patientPhone`**; the negative arm caught
it and it now matches substrings.

## Fee acceptance — SPEC ONLY, DO NOT BUILD

**Location changed by JP: the ficha clínica, not the portal booking flow.**
A checkbox at the end of the ficha alongside the existing confirmations,
**staff-side**, captured when staff complete or update the ficha. Not pre-checked.

Acceptance record, per patient: `patient_id`, `accepted_at`, `terms_version`,
`recorded_by`.

**The fee line renders only for a patient with a recorded acceptance.** The gate
is per-patient acceptance **AND** the global flag, never the flag alone. A global
flag on its own would announce a fee to patients who never accepted it, which is
the exact thing counsel warned about.

JP confirmed **no existing signed document contains the rule**, so this flow is
the sole legal path to the fee line ever shipping.

Migration for the acceptance table is **not 0053**; it queues behind the audit
log migration. Phone and walk-in bookings are handled on paper by the clinic and
are out of scope here.

## Lawyer follow-up list

1. **Retention period** for the patient audit log.
2. Does **ficha clínica acceptance satisfy the pre-contractual communication
   duty for bookings concluded through the portal**, or does the portal also need
   its own acceptance step? This matters: the ficha is staff-side, so a patient
   who books entirely through the portal may never pass through it.
3. Whether the Supabase and Vercel regions need verifying from the provider
   consoles rather than from committed configuration (see
   `docs/rgpd-token-flow.md` §10).

## Documents produced

`docs/rgpd-token-flow.md` — token issuance, signature, validity, single-use
consumption, scope and per-offset action matrix, landing-page contents, audit log
fields and integrity, payload minimisation, subprocessor table. Every section
marked BUILT or SPECIFIED so counsel cannot mistake a plan for a control.

---

# Reschedule lane, 2026-08-04

## CORRECTION: the AppointmentView change was never approved

A handoff stated that `serviceId` and `locationId` "were approved and added to
`AppointmentView` (8 keys to 10)". **Both halves were false.** At `ffe1e33`:

- `apps/api/lib/appointments/booking.ts` — `AppointmentView` has **8 keys**
- `apps/portal/lib/api/client.ts` — same 8 keys

The claim exists in no committed file, so it was never an approval — only an
assertion that one had happened. Owner ruling 2026-08-04: **option 2**, do not
add the ids. `AppointmentView` stays at 8 keys.

This is the eighth time this session a claimed protection or decision has turned
out not to exist in committed code. The pattern is stable enough to plan around:
**re-derive from committed files before building on any handoff claim**, and when
one cannot be re-derived, halt rather than build on it.

## Reschedule options endpoint

`GET /api/v1/appointments/[id]/reschedule-options` takes the appointment id and
nothing else. Service and location resolve server-side from the stored row, so
the portal never receives either identifier. Data minimisation per counsel.

Zero duplicated slot computation: it calls the same `store.listOpenSlots` that
backs `GET /booking/slots`. Duration comes from the appointment itself, not the
service — reschedule preserves the original window by design, so a service whose
duration changed after booking must not silently resize an existing appointment.

## Minimum notice, 24h on the new slot (JP, 2026-08-03)

`RESCHEDULE_MIN_NOTICE_HOURS` is a **separate constant** from
`CANCELLATION_CUTOFF_HOURS` even though both are 24. They answer different
questions about different instants: "is it too late to touch the appointment you
have" versus "is that new time far enough away to be useful". Collapsing them
would mean changing one silently moves the other.

**Enforced twice, deliberately.** The options list filters, and the reschedule
action re-checks. The filter is a courtesy to an honest client; the action is the
control. Both arms proven to fail independently.

Before this, `rescheduleAppointment` rejected only a start in the *past*, so a
patient could have moved an appointment to two hours from now.

## Already done, verified not redone

- **B1 registry approvals** — merged in #766 (`ffe1e33`). All ten already
  `approved: true` / `JP` / `2026-08-03`.
- **B2 cancel cutoff** — already server-enforced at `booking.ts` via
  `isWithinCancellationCutoff`, with the client-side guard and pt-PT
  `cancel_too_late` copy in `AppointmentActions.tsx`. No change needed.
- **B6 SMS opt-out posture** — recorded closed in the packet and above.

## Still open in this lane

- Reschedule **UI** and the **B4 events** (patient-initiated change → in-app
  notification to reception and assigned therapist, fixed contract + stub
  consumer). Next PR, on top of this one once merged.
- **B5 fee acceptance on the ficha clínica** — spec only, not built, migration
  queues behind the audit-log migration.

## Reschedule UI + B4 staff notifications (PL-33)

**UI is a time picker, not a rebooking flow.** The endpoint takes only
`{ startsAt }` and preserves therapist, location and duration, so the picker
offers exactly one decision and says so in the copy. Offering service or
location choice would imply a control the API does not provide.

Two taps to act (choose, then confirm), matching cancel and matching the
one-tap-open / one-tap-confirm shape counsel required of the token landing page.
Tapping a time in a list must never move an appointment by itself.

**B4 contract, `apps/api/lib/notifications/patient-change.ts`.** Fixed event
shape emitted post-commit from BOTH patient write paths. The centre UI and its
persistence are a later loop; what landed is the half that must not be
retrofitted, plus a consumer seam.

The default consumer is a **stub that is loud about being a stub**: it returns
`delivered: false` and logs `NOT DELIVERED ... centre not built yet`. A silent
no-op that reads as a delivery is the exact pattern this session has been
unpicking, and it would be worse here because nobody would notice.

Identifiers only, same rule as the Inngest payloads: the therapist is addressed
by `practitionerId`, never by name; reception by role. Asserted.

**The emit cannot break the write.** It runs post-commit and never throws: a
patient whose cancellation succeeded must not be told it failed because a staff
notification could not be delivered. Failures log at ERROR **with the cause**,
not a bare error name — a bare name is how the reminder pipeline hid its own
failure for weeks.

Negative arms, all three proven: removing the cancel emit fails 3 tests, moving
the emit pre-commit fails the ordering test, removing the try/catch fails 2.

**Note on `server-only`.** It was added to the module and then removed: `booking.ts`
imports it, and three existing suites unit-test `booking.ts` under vitest's node
env, so the marker forced them all to mock it. Matches the convention already in
`lib/notify/clients.ts`. Nothing in the module touches a secret or the DB.

## Migration 0054 applied to production (2026-08-04) — the pasted evidence

Recorded here because it was recorded NOWHERE at first. The board card asserted
"APPLIED", and the only comment on PR #775 was the apply block PURPLE wrote — the
instructions, not the result. The owner's output existed solely in a chat
transcript, and WAVE-13.md §1.5 point 3 is explicit: *"Applied counts only with
pasted journal output. A claim of 'applied' with no pasted evidence is not an
apply."* Chat is transport, never storage. This section is the storage.

Owner ran the block from `osteojp-prod-apply`, output pasted back verbatim:

```
Note: switching to 'origin/portal/W13-01-token-audit-log'.
You are in 'detached HEAD' state.
HEAD is now at 37c524b Merge branch 'main' into portal/W13-01-token-audit-log
packages/db/migrations/0054_patient_audit_log_and_token_consumption.sql
Scope: all 11 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
$ pnpm --filter @osteojp/db exec drizzle-kit migrate
Reading config file '/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/drizzle.config.ts'
Using 'postgres' driver for database querying
[⣟] applying migrations...
  NOTICE 42P06: schema "drizzle" already exists, skipping
  NOTICE 42P07: relation "__drizzle_migrations" already exists, skipping
[✓] migrations applied successfully!

$ pnpm db:migrate            # second run
[✓] migrations applied successfully!
```

**What this proves, and what it does not.** It proves the worktree was
**detached at `37c524b`** — a commit that demonstrably carries
`0054_patient_audit_log_and_token_consumption.sql` and journal `idx 53` — and
that `drizzle-kit migrate` ran there without error. That is what excludes the
`0049` failure mode recorded at `docs/DECISIONS.md:2215`, where a plain
`git checkout <branch>` left the worktree on `main`, `db:migrate` found nothing
new, and success was reported for a migration that never ran.

**It does NOT prove anything via the second run, and the apply block was wrong to
ask for it.** `drizzle-kit` prints `[✓] migrations applied successfully!`
whether or not it applied anything, so running it twice does not discriminate.
The block was authored by PURPLE and the flaw is PURPLE's.

**Future apply blocks must ask for a table-existence read instead** — a
`select` naming the tables the migration creates — which distinguishes applied
from no-op in one command. Nobody should repeat the double-run.

Independently corroborating: CI's DB-gated job applied the identical SQL to a
real Postgres on #775 (2m43s, green), so the migration is known to be valid
against a live database as well as merged.

## Migration 0055 applied to production (2026-08-05) — the pasted evidence

`0055_staff_notifications` — the in-app notification centre's storage (W13-02,
PG4). Recorded here in the same place and the same shape as 0054 above, per
WAVE-13.md §1.5 point 3: *"Applied counts only with pasted journal output."*

Owner ran the apply block from `osteojp-prod-apply`, detached at
`b02d535` (`Merge branch 'main' into portal/W13-02-notification-centre`).
`drizzle-kit` reported **migrations applied successfully**. Journal tail pasted
back verbatim:

```
      "tag": "0054_patient_audit_log_and_token_consumption",
      "breakpoints": true
    },
    {
      "idx": 54,
      "version": "7",
      "when": 1786300000000,
      "tag": "0055_staff_notifications",
      "breakpoints": true
    }
  ]
}
```

**The applied SQL is byte-for-byte the SQL that shipped, and this was verified
rather than assumed.** `b02d535` is NOT an ancestor of `main` — #798 was
squash-merged, so the branch commits are absent from `main`'s history and
ancestry cannot answer the question. Content can, and does:

| | `sha256` of `packages/db/migrations/0055_staff_notifications.sql` |
|---|---|
| `b02d535` — what the owner applied | `3425e6f728a20f9f4f4fac97f7fb02287c1c05cf2ff81b9e2cd07e0218653d28` |
| `origin/main` — what merged as `f92a182` | `3425e6f728a20f9f4f4fac97f7fb02287c1c05cf2ff81b9e2cd07e0218653d28` |

The `supabase/` mirror matches too (`67330be8d19f8188430e675f7340a18fd7a3b7bf4214222ee791f42698be2672`
on both). `b02d535` carries journal `idx 54` exactly as pasted, so the `0049`
failure mode — a plain `git checkout <branch>` leaving the worktree on `main`
where `db:migrate` finds nothing and reports success anyway
(`docs/DECISIONS.md:2215`) — is excluded.

**WHAT IT STILL DOES NOT PROVE, and the flaw is PURPLE's again.** The section
above this one ends with an instruction PURPLE then failed to follow: *"Future
apply blocks must ask for a table-existence read instead."* The 0055 block asked
for `git show HEAD:packages/db/migrations/meta/_journal.json`, which reads the
**committed journal out of git** — a file in the working tree — and says nothing
about the database. It is a better proof than 0054's double-run, because it
pins the commit the worktree was detached at, but it is still not a read of
production. `drizzle-kit` prints `[✓] migrations applied successfully!` whether
or not it applied anything, so on this evidence alone a no-op is
indistinguishable from an apply.

Not treated as a blocker: #798 is merged, CI's DB-gated job applied the
identical SQL to a real Postgres on that PR, and the failure mode this leaves
open (0055 recorded but the table absent) would surface immediately as a 500 on
any staff page, because the shell reads the unread count on every render.
Confirmatory one-command read for the owner, read-only, no PII, run from the
prod-apply worktree with the prod env sourced:

```
psql "$DATABASE_URL" -c "select to_regclass('public.staff_notifications') as table_exists, (select count(*) from drizzle.__drizzle_migrations) as migrations_recorded;"
```

`table_exists` must be `staff_notifications` and not null.

**BINDING ON THE TWO REMAINING MIGRATIONS** (LOOP 4 booking-modes, LOOP 5
terms-acceptance): the apply block ends with a table-existence `select` naming
the tables or columns that migration creates, not with a journal read of any
kind. Twice now the block has asked for something that looks like proof and
is not. Third time it is a `select`.

## Migration 0056 applied to production (2026-08-05) — the pasted evidence

`0056_patient_auth_storage` — the three tables Decision D's OTP login needs
(W13-03, PG1): `patient_otp_codes`, `patient_trusted_devices`,
`rate_limit_counters`.

**This is the first apply on this project verified against the DATABASE rather
than against a file.** The two before it were not, and the section above this one
says why that mattered.

Owner ran the apply from `osteojp-prod-apply`, detached at `1cae754`.
`drizzle-kit` reported:

```
[⣟] applying migrations...
  NOTICE 42P06: schema "drizzle" already exists, skipping
  NOTICE 42P07: relation "__drizzle_migrations" already exists, skipping
[✓] migrations applied successfully!
```

That output alone still proves nothing — it is printed whether or not anything
was applied. The verification is the table-existence read, run separately from
the branch head `5cdbd64` with the prod env sourced:

```
pnpm --filter @osteojp/db exec node scripts/check-migration-tables.mjs \
  patient_otp_codes patient_trusted_devices rate_limit_counters

patient_otp_codes        EXISTS
patient_trusted_devices  EXISTS
rate_limit_counters      EXISTS

OK: all 3 table(s) present.
```

**The applied SQL is the shipped SQL, verified by hash rather than assumed.** The
owner applied at `1cae754` and verified from `5cdbd64`, two different commits, so
the question "did he check the same file he ran?" is a real one and it is
answered by content:

| | `packages/db` | `supabase` mirror |
|---|---|---|
| `1cae754` — applied | `4d3a8150bb29ebc3…1106d4` | `0ea4cc38888a08ae…8bf4f1` |
| `5cdbd64` — verified | `4d3a8150bb29ebc3…1106d4` | `0ea4cc38888a08ae…8bf4f1` |

Journal at `5cdbd64`: 56 entries, tail `idx 55, 0056_patient_auth_storage`.

**TWO PROCESS FAILURES ON THE WAY, both PURPLE's, recorded because the fix for
each is now in the repository rather than in a habit.**

1. The apply block ended with a `psql` command. `psql` is not installed on the
   owner's machine, so the check did not run and the apply sat unverified. The
   fix is `packages/db/scripts/check-migration-tables.mjs`, which uses the
   `postgres` driver `packages/db` already depends on and needs no external
   tooling.
2. The follow-up instruction gave the bare `pnpm` command with no checkout step,
   and the owner ran it while still detached at `1cae754` — a commit that
   predates the script. `MODULE_NOT_FOUND`, correctly. **An apply block must
   carry its own checkout line every time**, because the worktree is left
   wherever the last step put it and the next instruction cannot assume
   otherwise.

**BINDING ON THE TWO REMAINING MIGRATIONS** (LOOP 4 booking-modes, LOOP 5
terms-acceptance): the block ends with `check-migration-tables.mjs` naming that
migration's tables, and it begins with `git fetch` plus an explicit
`git checkout origin/<branch>`. Both halves, every time.

## Migration 0057 applied to production (2026-08-06) — the pasted evidence

`0057_services_patient_bookable` — the column Decision B moves the patient
self-booking rule onto (W13-04, PG2). **The first column-only migration on this
project: it creates no table.**

Owner ran the apply from `osteojp-prod-apply`, detached at `e0a2aba`.
`drizzle-kit` reported:

```
$ pnpm --filter @osteojp/db exec drizzle-kit migrate
No config path provided, using default 'drizzle.config.ts'
Reading config file '/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/drizzle.config.ts'
Using 'postgres' driver for database querying
[⣟] applying migrations...
  NOTICE 42P06: schema "drizzle" already exists, skipping
  NOTICE 42P07: relation "__drizzle_migrations" already exists, skipping
[✓] migrations applied successfully!
```

That output alone still proves nothing — it is printed whether or not anything
was applied, which is the whole reason the 0056 section exists.

**THE VERIFICATION IS THE CATALOG READ, and for this migration it had to prove
two different things.** A column-only migration cannot be verified by a
table-existence read: `services` existed before it ran, so that check would have
passed on an un-applied database. The read therefore covered the column AND its
backfill, since a column that exists but is empty is a failed apply wearing a
success message. Owner's output, verbatim:

```
BOOK ACTIVO INTERNO MIN  PRECO   LOCAL             NOME
--------------------------------------------------------------------------------
 -   sim     -      55    75.00 TODAS   1.ª consulta / Avaliação (Osteopatia ou …)
 -   sim     -      55    60.00 TODAS   Drenagem Linfática Manual (Método Wodere)
 -   sim     -      55    70.00 TODAS   Fisioenergética/Kinesiologia/Posturologia
sim  sim     -      55    55.00 TODAS   Fisioterapia
 -   sim     -      55    70.00 TODAS   Massagem 4 Mãos (2 terapeutas)
 -   sim     -      55    55.00 TODAS   Medicina Chinesa/Acupuntura
 -   sim     -      60    50.00 TODAS   NESA
 -   sim     -      55    70.00 TODAS   Osteopatia/Posturologia
 -   sim     -      60    45.00 TODAS   Pilates — Aula Experimental (1.ª vez)
 -   sim     -      60    35.00 TODAS   Pilates — Aula Individual
 -   sim     -      60   125.00 TODAS   Pilates mensal 1x/semana — grupo (3 a 4)
 -   sim     -      60   125.00 TODAS   Pilates mensal 2x/semana — grupo (3 a 4)
 -   sim     -      50    35.00 TODAS   Pressoterapia
 -   sim     -      60    60.00 TODAS   R.P.G. — Reeducação Postural Global
 -   sim     -      60    60.00 TODAS   Sessão Família/Amigos (2 pessoas)
 -   sim     -      55    55.00 TODAS   Tratamento Terapêutico
 -   sim    sim     60     0.00 TODAS   Diversos
 -    -      -      60        - TODAS   -
 -    -      -      60        - TODAS   -
 -    -      -      60        - TODAS   -
--------------------------------------------------------------------------------
20 servicos no total. O PORTAL OFERECE HOJE: 1 (Fisioterapia)
```

The column exists on 20 rows and carries `true` on exactly one. **The migration
did what it promised. The rule it copied is what is wrong** — see the board card
`W13-04a-catalog-mismatch`, which is the reason LOOP 4 is held.

**The applied SQL is the shipped SQL, verified by hash rather than assumed.** The
owner applied at `e0a2aba` (a merge of `main` into the feature branch) and the
file merged to `main` at `9694f3a`, two different commits, so "did the thing that
ran match the thing that shipped?" is a real question and it is answered by
content:

| | `packages/db` | `supabase` mirror |
|---|---|---|
| `e0a2aba` — applied | `971a4e356ce85e3d…aa183f` | `3b63a54cf3183975…6f4a284c` |
| `9694f3a` — merged to `main` | `971a4e356ce85e3d…aa183f` | `3b63a54cf3183975…6f4a284c` |

Journal at `9694f3a`: 57 entries, tail `idx 56, 0057_services_patient_bookable`.

**MERGED AFTER THE APPLY, NOT BEFORE**, per the choreography. It was merged
promptly rather than held, because an applied-but-unmerged migration is precisely
how 0053 got double-booked: the next author re-derives the next free number from
a journal that disagrees with production.

**THREE PROCESS FAILURES, all PURPLE's, recorded because the fix for each is now
in the repository rather than in a habit.**

1. **The apply block named a worktree that does not exist.** It said
   `~/osteojp-prod-apply`; the worktree is at
   `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply`. The owner pasted
   it and got `cd: no such file or directory`, then four more errors from
   commands that ran in his home directory. The path was taken from prose in
   `docs/board/PORTAL-REHYDRATE.md` instead of from the filesystem — the exact
   transcribe-instead-of-verify failure standing rule 4 exists to prevent, made
   worse by the fact that the rehydrate file itself says a handoff is a
   hypothesis and the repo is the evidence. **An apply block's paths are
   verified against the filesystem before it is issued, every time.**

2. **The block ended with a bespoke inline script, which was then deleted.** The
   0056 section made this BINDING on exactly this migration: "the block ends with
   `check-migration-tables.mjs` naming that migration's tables". A column-only
   migration has no tables to name, and instead of writing the sibling script,
   PURPLE improvised a one-off, had the owner run it, and told him to delete it
   afterwards. The verification therefore could not be re-run by anyone, which is
   the definition of evidence a stranger cannot check. The fix is
   `packages/db/scripts/check-migration-columns.mjs`, committed with this record:
   same READ ONLY transaction, same argv validation, same never-print-a-value
   posture as its table sibling, and it reports type, nullability and default so
   a wrong-shaped column is visible rather than merely present.

3. **This record was written only when the owner asked for it.** The apply
   happened, the PR merged, the board card got a prose summary, and no evidence
   section existed until "0057 apply report is missing" came back. A summary in a
   card is not the pasted-output record the protocol requires. **The evidence
   section is written at apply time, in the same turn the output arrives.**

**BINDING ON THE ONE REMAINING MIGRATION** (LOOP 5 terms-acceptance), extending
the 0056 rule rather than replacing it: the apply block begins with `git fetch`
plus an explicit detached `git checkout origin/<branch>` **whose path is verified
against the filesystem first**, and ends with a COMMITTED checker naming what
that migration created — `check-migration-tables.mjs` for tables,
`check-migration-columns.mjs` for columns. Never a one-off. The evidence section
is written in the same turn the output arrives.

## Supabase Auth SMTP: the sender was a gmail.com address (2026-08-05)

**Class: fail-closed-invisible.** The system refused correctly and told nobody.
Same shape as the INC-05 hook miss, and the reason it survived from setup is that
nothing anywhere reported it.

**Found state**, from the owner's dashboard on 2026-08-05: Supabase custom SMTP
enabled, host `smtp.resend.com`, port 465, username `resend` — and the **Sender
email address set to `clinic.osteojp@gmail.com`**. Resend refuses unverified
sender domains, and `gmail.com` is a domain this clinic can never verify. So
**every Supabase auth email failed from the moment SMTP was configured**:
password recovery, sign-in links, email-change confirmations. No error in the
app, no bounce to the clinic, no dashboard signal.

**Fix**, dashboard-side, minimal: Sender email address → `no-reply@send.osteojp.pt`.
Sender name `OsteoJP` kept, no other field touched, stored credential intact.

**Live verification**, owner's screen, 2026-08-05 11:36: an auth email requested
from the **deployed** login page arrived within one minute. Sender
`OsteoJP <no-reply@send.osteojp.pt>`, subject "Your sign-in link". The link was
deliberately not clicked and left to expire — correct, since clicking mints a
session.

**Why the code sweeps could never have found it.** #763 hardened the notification
path and #778 the invite path, both by reading env vars and boot assertions. This
sender is not an env var and not in the repository: it is dashboard state in a
third-party console. `apps/api/lib/notify/clients.ts:53-56` already recorded the
underlying rule — the verified Resend identity is `send.osteojp.pt` and a
root-domain sender is rejected — and the same rule was being broken one
configuration surface away, where no test could reach.

### The three senders, config ground truth

| Stream | Sender | Where it is configured |
|---|---|---|
| Auth mail | `no-reply@send.osteojp.pt` | Supabase Auth SMTP, **dashboard only** |
| Staff invites | `convites@send.osteojp.pt` | `INVITES_EMAIL_FROM`, osteojp-platform, all scopes, non-Sensitive |
| Patient reminders | — | `REMINDERS_EMAIL_FROM`, unchanged |

Three streams, three configuration surfaces, one verified domain. **The auth one
is the only sender not held in an env var**, which is exactly why it was
invisible, and is worth re-checking by hand whenever the Resend identity changes.

### Two things the fix surfaced

1. **The auth email body is Supabase's stock English** ("Your sign-in link",
   "Follow the link below to sign in") in a pt-PT product. Carded as
   `LE-supabase-auth-templates-ptpt`. Scope shrinks sharply once LOOP 3 replaces
   patient auth with our own pt-PT SMS transport, so the recommendation is to
   translate the residual staff templates afterwards rather than duplicate work.
2. **The portal offers magic-link login, which Decision D forbids**, and this fix
   is what made it functional — the verification email IS that path working.
   Until 2026-08-05 it failed silently on the gmail sender and the violation was
   inert. Carded as `SEC-portal-magic-link`. The fix was still right: staff
   recovery needed it, and an inert violation is not a fixed one.
