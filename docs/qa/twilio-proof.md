# Twilio SMS integration — proof of wiring (qa/twilio-proof)

**Date:** 2026-07-06 · **Branch:** `qa/twilio-proof` · **Scope:** tests + smoke script + this doc. No product code changed, no flags flipped, no migrations, no workflow changes.

## 1. Actual call chain (verified by reading the code, not the docs)

```
Inngest trigger                         apps/web/lib/reminders/inngest/functions.ts
  appointment/scheduled  ──► scheduleReminders fans out one
                             appointment/reminder.due per offset (48h, 24h)
  appointment/reminder.due ─► sendReminder sleeps until sendAt, then dispatch
  (confirmation: immediate on scheduled · follow_up: +24h after completed ·
   no_show: on status event — all idempotency-keyed, cancelOn reschedule)
        │
        ▼
dispatchReminder / dispatchConfirmation / dispatchFollowUp / dispatchNoShow
                                        apps/web/lib/reminders/dispatch.ts
  loadReminderData (Drizzle, tenant-scoped)
  → status gate → planReminderChannels (tenant config × patient prefs × contact)
  → resolveLocale → buildReminderContext
        │
        ▼
renderSms / renderConfirmationSms / …   apps/web/lib/reminders/templates.ts
  Accent-free PT copy. assertSmsCompliant() throws AT RENDER TIME if the
  message contains a non-GSM-7 char or exceeds 160 chars (single segment).
        │
        ▼
(NO PHONE NORMALIZATION STEP — see finding F1)
        │
        ▼
sendSms                                 apps/web/lib/reminders/clients.ts
  gate: REMINDERS_LIVE_SEND === "true" (exact string; anything else = sandbox,
        zero network, SDK never imported)
  creds: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
         from = TWILIO_SMS_FROM ?? TWILIO_MESSAGING_SERVICE_SID
  → twilio(sid, token).messages.create({ to, from, body })
```

A second, mirrored sender exists for patient activation:
`apps/api/lib/notify/clients.ts` — same gate, same env, same payload shape.

**Sender identity (verified, not assumed):** the code passes `from:` — there is
no `messagingServiceSid` parameter anywhere. With prod configured as
`TWILIO_SMS_FROM=OsteoJP`, the `from` is the approved PT alphanumeric sender
string `"OsteoJP"`. If `TWILIO_SMS_FROM` is unset it falls back to passing the
Messaging Service SID as `from` (which Twilio accepts).

**TWILIO_* env vars referenced in code** (both client files; also `.env.example`):
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`,
`TWILIO_MESSAGING_SERVICE_SID`.

## 2. Findings

- **F1 — No E.164 phone normalization exists.** `patients.phone` is free text
  (staff form caps at 32 chars; the portal PATCH accepts any 7–15-digit string
  with optional `+`, spaces stripped for validation only — the RAW value is
  stored). `dispatch.ts` passes it verbatim to `sendSms`, which passes it
  verbatim to Twilio. Once `REMINDERS_LIVE_SEND` flips, any number stored as
  `912 345 678` or `00351912345678` will be rejected by Twilio (error 21211)
  and that patient's reminder will fail. The normalization tests requested for
  this QA pass ("9xxxxxxxx → +3519xxxxxxxx") **cannot exist yet — there is no
  unit to test**. Behaviour is pinned by characterization tests instead
  (`twilio-proof.test.ts` §3) so a future normalization PR flips them
  deliberately. Logged in `docs/QUESTIONS.md` (2026-07-06).
  **RESOLVED 2026-07-07** (fix/twilio-e164-and-runbook): `normalizePhonePT`
  added and wired at the dispatch layer + inside both `sendSms` wrappers;
  invalid numbers skip with a structured ids-only warning. The
  characterization tests below are now real E.164 expectations.
- **F2 — Runbook names an env var the code never reads.**
  `docs/cutover-runbook.md` (§1.5, §env-table) instructs setting
  `TWILIO_SENDER_ID=OsteoJP` in Vercel prod. The code reads `TWILIO_SMS_FROM`.
  Followed literally, prod would silently fall back to
  `TWILIO_MESSAGING_SERVICE_SID` or suppress sends as unconfigured. Pinned by a
  test; logged in `docs/QUESTIONS.md`. **Action: set `TWILIO_SMS_FROM=OsteoJP`
  in Vercel prod (and fix the runbook wording).**
  **RESOLVED 2026-07-07** (fix/twilio-e164-and-runbook): runbook §1.5 + env
  table corrected to `TWILIO_SMS_FROM`; the Vercel env change remains Ivan's
  manual step.
- **F3 — `apps/api/lib/notify/clients.ts` had zero tests.** Now covered
  (`apps/api/lib/notify/clients.test.ts`).

## 3. Test coverage added (runs in the `Lint + typecheck + test` CI check)

`apps/web/lib/reminders/twilio-proof.test.ts`
- Worst-case rendering for **every** SMS template kind (48h, 24h, confirmation,
  follow_up, no_show) × PT/EN with the longest realistic location
  (`Montemor-o-Novo`) and phone (`+351 210 000 000`): pure GSM-7, ≤160 chars,
  no accented chars. Plus: SMS carries no patient name and no reschedule link
  (why long names / long tokens cannot burst the segment).
- Sender resolution: `from = "OsteoJP"` when `TWILIO_SMS_FROM=OsteoJP`;
  fallback to `TWILIO_MESSAGING_SERVICE_SID`; `TWILIO_SMS_FROM` precedence;
  `TWILIO_SENDER_ID` is ignored by the code (F2 pin).
- Launch gate: with full creds, `REMINDERS_LIVE_SEND` ∈ {unset, "false", "1",
  "TRUE", "yes"} ⇒ sandbox result, Twilio SDK never constructed.
- Error handling: Twilio 4xx (21211) and 5xx rejections propagate out of
  `sendSms` (→ Inngest step failure/retry), never swallowed.
- Phone pass-through characterization (F1 pin): common local formats reach
  Twilio verbatim; only stored E.164 is live-safe.

`apps/api/lib/notify/clients.test.ts` (new — module previously untested)
- Gate exactness, gate-off/creds-missing sandbox behaviour, live payload with
  alphanumeric sender, messaging-service fallback, 4xx/5xx propagation.

Pre-existing (unchanged, part of the proof): `clients.test.ts` (sandbox = zero
network, PII-safe dry-run logs), `templates.test.ts` (verbatim copy, GSM-7
guard unit tests), `reminders-e2e.smoke.test.ts` (dispatch-level dry-run E2E),
`inngest/functions.test.ts` (scheduling/idempotency wiring).

## 4. Live smoke script — `scripts/twilio-smoke.mjs` (LOCAL ONLY, never CI)

```sh
# Proof 1 only — zero cost: validates creds (account GET) + prints messaging
# services / alpha senders, and the exact sender the prod code would resolve.
node scripts/twilio-smoke.mjs

# Proof 1 + Proof 2 — sends exactly ONE SMS (~cents) rendered through the REAL
# production template path (renderSms("24h","pt", …), imported from
# apps/web/lib/reminders/templates.ts), then polls to a terminal status and
# asserts exactly 1 segment.
TWILIO_SMOKE_CONFIRM=yes SMOKE_TO_NUMBER=+3519XXXXXXXX node scripts/twilio-smoke.mjs
```

- Creds: reads `TWILIO_*` from the environment / `.env.local` (repo root or
  `apps/web/`). If absent it attempts `vercel env pull`, then prints manual
  instructions and exits 1. **2026-07-06:** `vercel env pull` currently fails
  with "Could not retrieve Project Settings" for `osteojp-platform` — paste the
  SID + auth token from the Twilio Console into `.env.local` manually.
- Requires Node ≥ 22.18 (native type-stripping to import the real `.ts`
  template module). Repo standard is Node 22.x.
- Never prints `TWILIO_AUTH_TOKEN`. Uses the REST API directly (Basic auth);
  no SDK required at repo root.
- Proof 2 refuses non-E.164 targets. Use your own number only — never a seeded
  patient number.
- Exit codes: 0 ok · 1 missing creds · 2 proof failure (auth failed, send
  rejected, >1 segment, or not delivered).

## 5. Proof 2 results (fill in after running)

| Field | Value |
| --- | --- |
| Message SID | _(pending)_ |
| Final status | _(pending)_ |
| Segments | _(pending — must be 1)_ |
| From shown on handset | _(pending — expect "OsteoJP")_ |
| Timestamp (UTC) | _(pending)_ |
| Run by | _(pending)_ |

Notes: _(anything unexpected — delivery latency, sender shown, carrier)_
