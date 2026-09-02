import "server-only";
import { createHash } from "node:crypto";
import { auditLog, getDbAdmin } from "@osteojp/db";
import { normalizePhonePT } from "@osteojp/notify";
import { sendSms } from "./clients";
import { renderSms, type ReminderContext } from "./templates";
import {
  confirmLinkEnabled,
  confirmLinkLine,
  generateConfirmCode,
} from "./confirm-code";
import { issueConfirmCode, withdrawConfirmCode } from "./confirm-code-store";
import { senderCanReceiveReplies } from "./reply-capability";

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
  | { ok: false; reason: "invalid_phone" | "rate_limited" | "send_failed" | "no_link" };

/** The body a 24h reminder would carry today, for a fixed sample appointment. */
function sampleContext(): ReminderContext {
  return {
    patientFirstName: "Teste",
    appointmentDateLong: "amanha",
    appointmentDateShort: "23/05",
    appointmentTime: "14:30",
    practitionerName: "Equipa OsteoJP",
    // The longest real clinic name, so the test measures the WORST case rather
    // than a comfortable one.
    clinicLocation: "Castelo Branco",
    clinicPhone: "+351 210 000 000",
    rescheduleLink: "https://osteojp.pt/r/sample",
  };
}

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

  // The link is the thing under test. With the capability disarmed there is
  // nothing to look at, so this refuses rather than sending a body that does
  // not exercise the feature.
  if (!confirmLinkEnabled()) return { ok: false, reason: "no_link" };

  // A LIVE code only when the owner named an appointment to spend one on.
  const issued = args.appointmentId
    ? await issueConfirmCode({ tenantId: args.tenantId, appointmentId: args.appointmentId })
    : null;
  const code = issued?.code ?? generateConfirmCode();

  const body = renderSms("24h", "pt", sampleContext(), {
    confirmLink: confirmLinkLine(code),
    replyInstruction: senderCanReceiveReplies(),
  });

  const sent = await sendSms({ to, body, templateId: "reminder.24h.sms" });
  const delivered = !sent.id.startsWith("skipped:");

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
        sandbox: sent.sandbox,
        result: sent.id,
      },
      ip: args.ip,
    });

  if (!delivered) return { ok: false, reason: "send_failed" };
  return {
    ok: true,
    segments: Math.ceil(body.length / 160),
    length: body.length,
    codeWasLive: Boolean(issued),
    body,
  };
}
