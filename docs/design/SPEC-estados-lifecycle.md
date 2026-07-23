# SPEC - Estados lifecycle + Twilio/Resend wiring + inbound SMS

Status: **DESIGN source of truth (W12-10). No product code, no migration, no dependency, no env/flag.** This spec gates the W12-11 build. It defines the five estados Rodica specified, mapped onto the EXISTING dual-axis schema without collapsing it, the Resend/Twilio send points, the net-new inbound-SMS reply capability, and the visual reconciliation with the W11-00 name-only agenda face.

Supersedes `SPEC-sms-confirmation.md` section 8 (adds inbound reply parsing) and subsumes its link-page confirm flow. Does not delete that spec; annotates it.

## 1. The two axes stay orthogonal (non-negotiable)

The estados are a PRESENTATION over two existing, independent columns. No merged status column is proposed; the same discipline as `record_status` vs `ai_review_state` (CLAUDE.md rule 4) applies.

- **Lifecycle** `appointment_status` = `scheduled | confirmed | completed | cancelled | no_show` (`packages/db/src/schema.ts:42-48`). "Where is the appointment in its lifecycle?"
- **Confirmation** `appointment_confirmation_state` = `pending | confirmed | declined`, plus `confirmation_received_at` and `confirmation_channel` (`schema.ts:54-58`; migration 0024). "Did the patient confirm the reminder?"

Ground truth (verified read-only 2026-07-23): the confirmation axis has **no writer today** - it is set to `pending` by the DB default and reset to `pending` on clone (`apps/web/lib/scheduling/clone-core.ts:58,89`); nothing flips it to `confirmed`/`declined`. The confirmation glyph (`apps/web/app/agenda/confirmation-indicator.tsx`) renders it read-only, deliberately monochrome (Clock/Check/X), never merged with `status`.

## 2. The five estados -> axis mapping

Each estado is DERIVED from `(status, confirmation_state)` by a pure display function. It reads both axes and writes neither. No new column.

| Estado | Glyph (Rodica) | Colour | Derivation from the two axes |
|--------|----------------|--------|------------------------------|
| **Agendada** | circle | yellow | `status = scheduled` AND `confirmation = pending` |
| **Confirmada** | thumbs-up | green | `confirmation = confirmed` (patient confirmed) OR `status = confirmed` (staff set), and status not terminal |
| **Concluida** | circle | green | `status = completed` |
| **Cancelada** | thumbs-down | red | `status = cancelled` (incl. a patient negative reply, which also sets `confirmation = declined`) |
| **Falta** | name crossed with a line | red | `status = no_show` |

### 2.1 Canonical derivation (pseudocodigo, pure; W12-11 implements as a shared helper)

```
estado(status, confirmation):
  if status == "completed":  return Concluida     # terminal lifecycle wins
  if status == "cancelled":  return Cancelada
  if status == "no_show":    return Falta
  # status in { scheduled, confirmed }
  if confirmation == "confirmed" or status == "confirmed":  return Confirmada
  if confirmation == "declined":  return Cancelada   # see 4.4: a negative reply also sets status=cancelled
  return Agendada                                     # scheduled + pending
```

Terminal lifecycle states (`completed`/`cancelled`/`no_show`) dominate the estado regardless of the confirmation axis. Only for a non-terminal appointment does the confirmation axis distinguish Agendada from Confirmada.

### 2.2 The two "confirmed" notions (note, minor decision)

There are two independent "confirmed" concepts: the lifecycle `status = confirmed` (a staff action) and `confirmation_state = confirmed` (the patient confirmed a reminder). Rodica's **Confirmada** estado means the PATIENT confirmed, i.e. `confirmation_state = confirmed`. The derivation above treats `status = confirmed` as also showing Confirmada (so a staff-confirmed appointment is not mislabelled Agendada). Recommended default: keep both paths mapping to Confirmada; do not add a column. If the owner wants Confirmada to mean patient-confirmed ONLY, drop the `status == "confirmed"` clause (a one-line change in the helper). Registered as a minor note under Q-W12-01.

## 3. Visual language + reconciliation with W11-00 (name-only face)

W11-00 v3 locked the agenda face to a NAME-ONLY list where `cancelled = line-through` was the sole non-name cue (Fisiozero ruling). Rodica's estados re-introduce glyphs and give **Falta** a strikethrough too. Two conflicts, both registered:

- **Cancelada vs Falta (Q-W12-01).** Rodica: Falta = name crossed with a line (a strikethrough) AND Cancelada = red thumbs-down. Two strikethrough-like cues would collide. **Recommended default:** Falta = strikethrough on the name; **Cancelada = a distinct red glyph, NOT a strikethrough**, so the two never look alike. W12-01 verified + holds the interim invariant (`strikethrough = cancelled` only, all four surfaces); THIS spec sets the final language once Rodica confirms. The canonical binding after the ruling: strikethrough belongs to **Falta** (and NOT to Confirmada, ever - folds in the W12-01 non-defect finding).
- **Glyphs vs the name-only face.** Adding per-estado glyphs re-introduces non-name cues on a face the owner made name-only. **Recommended default:** a small LEADING estado marker before the name (colour-not-only: the estado is ALSO in the hover panel + `aria-label`, and the name stays authoritative), a controlled amendment to the name-only ruling. If the owner prefers the face pure name-only, glyphs live only in the hover popup + the Marcacoes list, not on the agenda face. Owner decision (folded into Q-W12-01).

Accessibility: every estado is conveyed by TEXT (label in hover/aria), never colour alone (WCAG 1.4.1), matching the existing ConfirmationIndicator discipline.

## 4. Send points + writers (what fires when)

### 4.1 Booking -> Agendada + Resend email (ALREADY wired)

On appointment create/reschedule a Resend "confirmation" email fires (`apps/web/lib/reminders/inngest/functions.ts:129-142` -> `dispatch.ts`), sandbox-gated by `REMINDERS_LIVE_SEND` (`clients.ts`). Estado = Agendada. The current template carries a reschedule/cancel link (`templates.ts` `{{reschedule_link}}`), NOT a confirm link. No change needed for Agendada; the confirm mechanism is the 24h reminder (4.2).

### 4.2 48h + 24h -> Twilio reminder (ALREADY wired, outbound)

Two outbound reminder offsets (48h + 24h, `apps/web/lib/reminders/offsets.ts:21-22`) run via Inngest, sandbox-gated. **W12-11 adds** to the 24h reminder a confirm mechanism: a signed SIM/NAO link (the confirm page, 4.3) AND acceptance of a plain SMS reply (inbound, 4.4). The `/api/inngest` route keeps its known middleware exclusion in deployed envs.

### 4.3 Confirm page (link) -> WRITES confirmation_state (net-new; subsumes SPEC-sms-confirmation)

A signed, tenant-scoped SIM/NAO page (per `SPEC-sms-confirmation.md` sections 5-6) that flips the 0024 axis. This is the FIRST writer of `confirmation_state`. Confirm -> `confirmation = confirmed`, `confirmation_received_at = now`, `confirmation_channel = "link"`. Negative -> see 4.4. Idempotent (re-press is a no-op). W12-11 builds it.

### 4.4 Inbound SMS reply -> Confirmada / Cancelada (net-new, the core of this spec)

A patient texting the clinic number a confirmation or a negative. NOTHING for this exists today (no Twilio inbound webhook, no TwiML, no reply parser - verified absent). W12-11 designs + builds:

- **Public inbound webhook** (e.g. `POST /api/webhooks/twilio/inbound`), CSRF-exempt, validated by the `X-Twilio-Signature` HMAC (Twilio auth token) - reject unsigned/invalid.
- **Tenant + appointment resolution:** tenant from the RECIPIENT number (the tenant's Twilio number). Appointment from the SENDER (patient phone) correlated to the patient's nearest OUTSTANDING reminded appointment within a window (SMS replies carry no token). Ambiguity (multiple pending) -> take the soonest upcoming; log the ambiguity (no PII). A future refinement may embed a short code in the outbound reminder for exact correlation.
- **Keyword parsing (pt-PT, case/accent-insensitive):** confirm = { SIM, S, CONFIRMAR, CONFIRMO }; negative = { NAO, N, CANCELAR, CANCELO }. Exact set is a Rodica/JP decision (Q-W12-03). Unrecognized -> ignore + optional "resposta nao reconhecida" auto-reply (owner decision).
- **Idempotent axis/status flip (server, service-role, tenant_id explicit):**
  - confirm -> `confirmation = confirmed`, `confirmation_received_at = now`, `confirmation_channel = "sms"`. Status unchanged (stays scheduled). Estado -> Confirmada.
  - negative -> `confirmation = declined`, `confirmation_received_at = now`, `confirmation_channel = "sms"`, AND `status = cancelled`. Estado -> Cancelada. (This is why the derivation maps `declined` to Cancelada.)
  - Re-processing the same inbound message is a no-op (dedupe on Twilio message SID).
- **STOP / opt-out (legal, Q-W12-03):** STOP/SAIR/CANCELAR-TUDO -> record an opt-out; no further SMS to that number. START/SUBSCREVER -> re-subscribe. Requires an opt-out store (4.5 / build gate).
- **Abuse / rate:** per-sender rate limit; drop unmatched/hostile input; never act on a reply that does not resolve to a pending reminder.
- **No PII in logs:** never log the message body or the phone in clear (hash the phone; the audit_log entry references the appointment id, not the content). CLAUDE.md rule 7.

### 4.5 Staff-driven terminal states

- Arrived + completed -> `status = completed` -> Concluida (existing drawer control).
- Did not show -> `status = no_show` -> Falta (existing drawer control).
- These are unchanged; the estado language just renames how they render.

## 5. Build-gate list (what W12-11 needs before it can build)

W12-11 is BLOCKED until ALL of:

1. **Twilio as a NEW vendor - owner approval** (CLAUDE.md owner-confirmable: new third-party vendor).
2. **Twilio EU region + a signed DPA** - hard GDPR requirement (CLAUDE.md rule 8; the W11-05 Twilio-EU/DPA follow-up). A US region or a missing DPA is a hard blocker.
3. **Q-W12-01 ruling** (Cancelada vs Falta visuals; glyphs-on-face vs hover-only; the two-"confirmed" note).
4. **Q-W12-03 ruling** (inbound consent + STOP/opt-out policy + the exact SIM/NAO keyword set).
5. **pt-PT copy + send times** for the reminder + confirm page + inbound auto-replies (JP/owner; the 2026-07-03 SMS-confirmation questions - reference, do not duplicate).
6. **A migration (W12-11, RLS + isolation test in-PR):** an inbound-message / opt-out log table (tenant_id, patient/appointment ref, twilio_message_sid unique for idempotency, direction, parsed_intent, received_at) + a patient opt-out flag. Every domain table gets tenant_id + an RLS policy + an isolation test (CLAUDE.md).
7. **Env/flags:** `REMINDERS_LIVE_SEND` (exists), Twilio credentials (account SID, auth token, messaging service / from-number), and an inbound-enabled flag; secrets live in Vercel/Supabase, never in code.
8. **The confirm page + the inbound webhook routes** (both public, tenant-from-token or tenant-from-number, server-side only, no client secret).

W12-11 will almost certainly SPLIT (visuals; confirm-page writer; inbound webhook + migration; STOP/opt-out) - one migration in flight, CYAN pre-merge audit for the migration/RLS parts, OWNER-MERGE.

## 6. Explicit non-goals of THIS spec

- No product code, no migration, no dependency, no env/flag, no Twilio/Resend change. Design only.
- No merged status column. The axes stay orthogonal.
- Does not DECIDE the vendor/legal gates (Twilio approval, EU/DPA, consent, keywords, copy, send times) - it NAMES them as build gates.
- Does not design WhatsApp/other channels.

## 7. Cross-references

- `docs/design/SPEC-sms-confirmation.md` - the link-page confirm flow (sections 5-6) is subsumed here; its section 8 "no inbound reply parsing" non-goal is SUPERSEDED (annotated in that file).
- `docs/design/QUESTIONS.md` - Q-W12-01 (Cancelada vs Falta visuals, glyphs-on-face, two-confirmed note) + Q-W12-03 (inbound consent/STOP/keywords + Twilio EU/DPA). Both gate W12-11.
- W12-01 (strikethrough=cancelled verify) - holds the interim invariant this spec finalizes.
- `packages/db/src/schema.ts:42-58` - the two enums this spec presents.
