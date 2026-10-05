import "server-only";
import { createHash } from "node:crypto";
import { auditLog, getDbAdmin } from "@osteojp/db";
import { isSmsCapablePT, normalizePhonePT } from "@osteojp/notify";
import { assertPiiFreeAuditMetadata } from "../audit/metadata-contract";
import { sendSms, suppressionReasonOf } from "./clients";
import { confirmLinkEnabled, generateConfirmCode } from "./confirm-code";
import { issueConfirmCode, withdrawConfirmCode } from "./confirm-code-store";
import { renderMessagingCheckBody, smsSegments } from "./messaging-check-body";
import {
  isAppointmentIdShape,
  isUnacceptedOnlineRequest,
  providerFailureOf,
  refusalFromSuppression,
  type MessagingCheckRefusal,
  type ProviderFailure,
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
       * The provider's own ERROR CODE, for `send_failed`, when the error it
       * raised carried one. A closed shape (`isProviderCode`): digits, or
       * capitals and underscores.
       *
       * THIS USED TO BE `detail`, THE PROVIDER'S OWN WORDS, and those words
       * hold the number the owner typed. Nothing on this type is free text
       * any more: a result is a reason from a closed list, a code, a length
       * and a boolean, so there is nothing a caller could log, store or put in
       * a URL that names a handset.
       */
      providerCode?: string | null;
      /** For `body_refused`: the length the renderer refused, when it had one. */
      length?: number | null;
      /**
       * True when a live code was minted for the named appointment, the
       * message did not go, AND the code could not be withdrawn. It stays
       * live, unsent, and blocks that appointment's real reminder from
       * carrying a link, so the page has to say so.
       */
      linkNotWithdrawn?: boolean;
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
    // The renderer's sentence is ours and names no handset, but it is still
    // prose, and nothing prose leaves this function. The length is the fact.
    return { ok: false, reason: "body_refused", length: rendered.length };
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
  let thrown: ProviderFailure | null = null;
  try {
    sent = await sendSms({ to, body, templateId: "reminder.24h.sms" });
  } catch (err) {
    // ========================================================================
    // THE ERROR IS REDUCED HERE AND ITS MESSAGE GOES NO FURTHER.
    // ========================================================================
    // This line used to keep `err.message`, on the reasoning that "no phone
    // number can appear here: the only interpolated value is the provider's
    // message". The provider's message IS where the number appears: Twilio
    // writes the recipient into it. It then went to the audit row, the
    // redirect URL and the screen.
    //
    // `providerFailureOf` reads the error's code and status and nothing else.
    // `err` is not logged, not stored and not returned.
    thrown = providerFailureOf(err);
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

  // WHY NOTHING WENT, AS ONE VALUE FROM THE CLOSED LIST, or null when it did.
  // A held-back result with no recorded reason is the E.164 guard in
  // clients.ts, the only producer of one.
  const refusal: MessagingCheckRefusal | null = delivered
    ? null
    : thrown
      ? thrown.reason
      : suppression
        ? refusalFromSuppression(suppression)
        : sent?.id === "skipped:invalid_phone"
          ? "invalid_phone"
          : "send_failed";

  // Same compensation the dispatcher uses: a code that never went cannot be
  // allowed to block the appointment's real reminder from minting one.
  //
  // GUARDED, AND ITS ANSWER IS KEPT. It was `await`ed bare with its result
  // dropped: a throw here was a 500 on a screen that must never 500, it
  // skipped the audit row below, and it left the code live with nothing saying
  // so. A `false` (no row went) was silent in the same way. Either is now a
  // fact the audit row records and the page reports. The log line carries ids
  // only, never the error: a database error can quote the statement it failed.
  let codeWithdrawn: boolean | null = null;
  if (issued && !delivered) {
    try {
      codeWithdrawn = await withdrawConfirmCode({
        tenantId: args.tenantId,
        codeHash: issued.codeHash,
      });
    } catch {
      codeWithdrawn = false;
    }
    if (!codeWithdrawn) {
      console.error(
        "[messaging-check] a confirm code was minted, the test message did not go, and the code could not be withdrawn; this appointment's next reminder will carry no confirm link",
        { tenantId: args.tenantId, appointmentId: args.appointmentId ?? null },
      );
    }
  }

  // ==========================================================================
  // THE AUDIT ROW HOLDS IDS, ENUMS, COUNTS AND ONE HASH. NO FREE TEXT.
  // ==========================================================================
  // `failure` used to be the provider's own words, and this file was the one
  // named exception to the audit metadata contract for it. The exception is
  // gone: `failure` is a reason from the closed list, the provider's code and
  // status sit beside it, and the row goes through the same guard every audit
  // helper uses, so a later edit that puts prose here is refused at the write.
  const metadata = {
    // The NUMBER IS NEVER STORED. A hash records that the same handset was
    // used twice without putting a contact detail in a table staff can read.
    toHash: createHash("sha256").update(to).digest("hex"),
    segmentLength: body.length,
    codeWasLive: Boolean(issued),
    sandbox: sent?.sandbox ?? null,
    result: sent?.id ?? "threw",
    failure: refusal,
    providerErrorCode: thrown?.code ?? null,
    providerStatus: thrown?.status ?? null,
    codeWithdrawn,
  };
  assertPiiFreeAuditMetadata(metadata, "messaging-check");

  await getDbAdmin()
    .insert(auditLog)
    .values({
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: "messaging.check.send",
      entityType: "sms",
      entityId: args.appointmentId ?? null,
      metadata,
      ip: args.ip,
    });

  if (refusal) {
    return {
      ok: false,
      reason: refusal,
      providerCode: thrown?.code ?? null,
      linkNotWithdrawn: codeWithdrawn === false,
    };
  }
  return {
    ok: true,
    segments: smsSegments(body.length),
    length: body.length,
    codeWasLive: Boolean(issued),
    body,
  };
}
