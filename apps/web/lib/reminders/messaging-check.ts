import "server-only";
import { createHash } from "node:crypto";
import { auditLog, getDbAdmin } from "@osteojp/db";
import { isSmsCapablePT, normalizePhonePT } from "@osteojp/notify";
import { sendSms, suppressionReasonOf } from "./clients";
import { confirmLinkEnabled, generateConfirmCode } from "./confirm-code";
import { issueConfirmCode, withdrawConfirmCode } from "./confirm-code-store";
import { renderMessagingCheckBody, smsSegments } from "./messaging-check-body";
import {
  isAppointmentIdShape,
  isUnacceptedOnlineRequest,
  refusalFromSuppression,
  type MessagingCheckRefusal,
} from "./messaging-check-reasons";
import { loadMessagingCheckTarget } from "./messaging-check-target";

// THE OWNER'S DELIVERY TEST. One real 24h reminder body, to one number he types.
//
// ==========================================================================
// WHY THIS EXISTS AT ALL, WHEN THE PIPELINE ALREADY HAS TESTS
// ==========================================================================
// Everything up to the carrier is proven in CI. What CI cannot answer is what a
// PORTUGUESE HANDSET actually shows: whether the sender id survives, whether the
// line wraps, whether the link is tappable, and whether the message arrives as
// one segment or two. Those are facts about Twilio, the carrier and the phone,
// and the only instrument that reads them is a phone.
//
// IT SENDS THROUGH THE PRODUCTION PATH ON PURPOSE. `sendSms` carries the
// template-approval gate, the REMINDERS_LIVE_SEND flag and the E.164
// normalisation. A separate "test sender" would prove a test sender works.
//
// ==========================================================================
// THE CODE IN THE TEST MESSAGE IS NOT LIVE BY DEFAULT, AND THAT IS A CHOICE
// ==========================================================================
// A LIVE code needs an appointment: `appointment_confirm_codes.appointment_id`
// is NOT NULL with an FK, and 0072's partial unique index allows exactly one
// live code per appointment. Minting one for an arbitrary appointment would
// SPEND A REAL PATIENT'S ONE SLOT on a delivery test — their next reminder would
// then arrive with no link and nothing would say why.
//
// So the default sends a SAMPLE code, which resolves to the generic page —
// which is itself a useful thing to see, since it is what every expired and
// spent code shows. An owner who wants the full round trip passes an
// appointment id he has chosen, and then the code IS live and the link
// confirms that appointment. The page says which of the two it did.
//
// PII rule 7: the number is never logged and never stored. The audit row keeps
// a sha256 of it, the same shape `sms_inbound_events.from_phone_hash` uses.

export type MessagingCheckResult =
  | { ok: true; segments: number; length: number; codeWasLive: boolean; body: string }
  | {
      ok: false;
      /**
       * The closed list lives in `messaging-check-reasons.ts`, where the page
       * can walk it. Three of them, said here because they are easy to misread:
       *
       * `body_refused` - THE RENDERER REFUSED THE BODY, and nothing was sent
       * or written. This is the outcome the owner hit on 2026-09-02 as a 500.
       * The body came to 185 characters - the 136 of the approved 24h body
       * plus the confirm link, plus 49 for a reply instruction the environment
       * had armed - and the single-segment rule refused it. The refusal is
       * correct; a diagnostic page reporting it as a crash is not.
       *
       * `live_send_disabled`, `missing_provider_config`, `template_unapproved`
       * - THE NOTIFICATION GATE HELD THE MESSAGE BACK and no provider was
       * called. Not `send_failed`: nothing was attempted.
       *
       * `pending_request` - the appointment named is an online request
       * reception has not accepted, and nothing was sent or minted.
       */
      reason: MessagingCheckRefusal;
      /**
       * What the provider said, for the OWNER'S OWN SCREEN only. A diagnostic
       * page whose only output is "not sent" sends the person who ran it to a
       * dashboard they may not have; the whole point of this page is to answer
       * WHY. Never a phone number, never a patient field - the provider's
       * message and code, which name a configuration problem.
       */
      detail?: string;
    };

// The sample appointment the body describes lives in `messaging-check-body.ts`
// (`messagingCheckSampleContext`), beside the one function that renders it, so
// the page can SHOW the body through the same code this file SENDS it through.

/**
 * Send one test message.
 *
 * The caller has already established that the actor is the owner and that the
 * rate limit permitted this attempt; this function does the work and the audit.
 */
export async function sendMessagingCheck(args: {
  tenantId: string;
  actorUserId: string;
  phone: string;
  appointmentId?: string | null;
  ip: string | null;
}): Promise<MessagingCheckResult> {
  const to = normalizePhonePT(args.phone);
  if (!to) return { ok: false, reason: "invalid_phone" };

  // A LANDLINE IS REFUSED HERE, exactly as the reminder path refuses it before
  // sending. `normalizePhonePT` admits the Portuguese `2` prefix, which is a
  // perfectly good number that cannot receive SMS - so without this check the
  // owner types a clinic landline, Twilio rejects it, and the page answers with
  // a 500 instead of the one sentence that would have told him why.
  if (!isSmsCapablePT(to)) return { ok: false, reason: "landline" };

  // The link is the thing under test. With the capability disarmed there is
  // nothing to look at, so this refuses rather than sending a body that does
  // not exercise the feature.
  if (!confirmLinkEnabled()) return { ok: false, reason: "no_link" };

  // ==========================================================================
  // RENDER FIRST, MINT SECOND. THE ORDER IS THE FIX (INC-CONFIRM-07).
  // ==========================================================================
  // The code is a VALUE here and a ROW below. Generating one touches nothing,
  // so a body that the single-segment rule refuses costs no write at all - and
  // the refusal comes back as a sentence for the page rather than as a 500.
  //
  // THE BODY IS BUILT BY THE SAME FUNCTION THE REMINDER JOB CALLS, which is
  // what makes this page a delivery test rather than a lookalike: the two
  // cannot drift, and `sms-body.test.ts` asserts the equality.
  const code = generateConfirmCode();
  const rendered = renderMessagingCheckBody(code);
  if (!rendered.ok) {
    return { ok: false, reason: "body_refused", detail: rendered.refusal };
  }
  const body = rendered.body;

  // ==========================================================================
  // A LIVE CODE IS NEVER MINTED FOR AN ONLINE REQUEST RECEPTION HAS NOT ACCEPTED
  // ==========================================================================
  // With an appointment id the code below is LIVE: the link in the test message
  // opens /c/<code>, and pressing Confirmar there moves that appointment from
  // `scheduled` to `confirmed` (confirm-redeem.ts). For an online request that
  // is the acceptance itself, taken from a text message instead of from
  // reception, with none of what an acceptance does.
  //
  // The reminder job refuses exactly this row before it sends anything
  // (`isUnacceptedPedido`, dispatch.ts, R10), so no real reminder ever carries
  // a live code for one. This page was the only path that could. It now
  // refuses, BEFORE the mint and BEFORE the send, so nothing is written and
  // nothing reaches a handset.
  //
  // The id's shape is checked first because a string that is not a uuid
  // reaches Postgres as a cast and raises, and A DIAGNOSTIC PAGE MUST NEVER
  // 500 (see below). An id that names no visible appointment is not refused
  // here: it behaves as it always has, and the message carries a code that
  // names no row.
  if (args.appointmentId) {
    if (!isAppointmentIdShape(args.appointmentId)) {
      return { ok: false, reason: "invalid_appointment" };
    }
    const target = await loadMessagingCheckTarget(args.tenantId, args.appointmentId);
    if (target && isUnacceptedOnlineRequest(target)) {
      return { ok: false, reason: "pending_request" };
    }
  }

  // A LIVE code only when the owner named an appointment to spend one on, and
  // only now that there is a body worth sending. `issueConfirmCode` returns null
  // when a live code already exists for that appointment (0072's partial unique
  // index); the message then carries a code that names no row, which resolves to
  // the generic page exactly as the sample code does. `codeWasLive` reports
  // which of the two happened rather than leaving the owner to guess.
  const issued = args.appointmentId
    ? await issueConfirmCode({
        tenantId: args.tenantId,
        appointmentId: args.appointmentId,
        code,
      })
    : null;

  // ==========================================================================
  // THE TRANSPORT IS AWAITED INSIDE A CATCH, AND THAT IS THE WHOLE P0 FIX.
  // ==========================================================================
  // packages/notify/src/gate.ts awaits the provider with no try/catch, so a
  // Twilio rejection propagates out of dispatch. THE REMINDER PATH SURVIVES
  // THAT because it runs inside an Inngest job, where a throw is a retryable
  // job failure nobody sees. THIS PAGE IS A USER-FACING SERVER ACTION: the same
  // throw is a 500 on the owner's screen, with the reason only in Sentry.
  //
  // A DIAGNOSTIC PAGE MUST NEVER 500. Its entire job is to report what
  // happened, so an unhandled provider error is the one outcome it cannot be
  // allowed to produce - and it is exactly the outcome the owner hit.
  let sent: Awaited<ReturnType<typeof sendSms>> | null = null;
  let failure: string | undefined;
  try {
    sent = await sendSms({ to, body, templateId: "reminder.24h.sms" });
  } catch (err) {
    // The provider's own words, trimmed. Twilio's errors name the
    // configuration problem ("is not a valid phone number", "is not currently
    // reachable", an alphanumeric-sender restriction), which is what the owner
    // needs. No phone number and no patient field can appear here: the only
    // interpolated value is the provider's message.
    failure = err instanceof Error ? err.message.slice(0, 300) : "unknown transport error";
  }
  // ==========================================================================
  // DELIVERED MEANS A PROVIDER TOOK IT. `sandbox` IS THE FIELD THAT SAYS SO.
  // ==========================================================================
  // This used to read `!sent.id.startsWith("skipped:")`, and the comment beside
  // it said `skipped:` is what a gate refusal looks like. It is not: the gate
  // in packages/notify marks a held-back message `sandbox:sms`, and `skipped:`
  // is only the E.164 guard in clients.ts, which this function's own
  // normalisation makes unreachable. So with live sending off, the template
  // unapproved or no sender configured, NO MESSAGE LEFT and this returned
  // `ok: true` - the page said "sent, check the handset" - and a live code
  // minted for a named appointment was left in place for a message nobody
  // received.
  //
  // `sandbox` is true exactly when no network call was made (clients.ts), so
  // it is the question being asked.
  const delivered = sent !== null && !sent.sandbox;
  // A SUPPRESSION IS NOT A FAILURE AND MUST NOT READ AS ONE. The gate's own
  // reason travels back as a named refusal, so the owner reads which switch is
  // off rather than guessing at a silent no-op.
  const suppression = sent && !delivered ? suppressionReasonOf(sent) : undefined;
  if (!failure && sent && !delivered) failure = suppression ?? sent.id;

  // Same compensation the dispatcher uses: a code that never went cannot be
  // allowed to block the appointment's real reminder from minting one.
  if (issued && !delivered) {
    await withdrawConfirmCode({ tenantId: args.tenantId, codeHash: issued.codeHash });
  }

  await getDbAdmin()
    .insert(auditLog)
    .values({
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: "messaging.check.send",
      entityType: "sms",
      entityId: args.appointmentId ?? null,
      // The NUMBER IS NEVER STORED. A hash records that the same handset was
      // used twice without putting a contact detail in a table staff can read.
      metadata: {
        toHash: createHash("sha256").update(to).digest("hex"),
        segmentLength: body.length,
        codeWasLive: Boolean(issued),
        sandbox: sent?.sandbox ?? null,
        result: sent?.id ?? "threw",
        failure: failure ?? null,
      },
      ip: args.ip,
    });

  // A message the gate held back names its own reason and needs no detail: the
  // sentence on the page says which switch is off.
  if (suppression) return { ok: false, reason: refusalFromSuppression(suppression) };
  if (!delivered) return { ok: false, reason: "send_failed", detail: failure };
  return {
    ok: true,
    segments: smsSegments(body.length),
    length: body.length,
    codeWasLive: Boolean(issued),
    body,
  };
}
