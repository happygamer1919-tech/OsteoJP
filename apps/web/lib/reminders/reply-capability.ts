// CAN THE CONFIGURED OUTBOUND SENDER RECEIVE A REPLY?
//
// ==========================================================================
// THE DEFECT THIS EXISTS TO CLOSE, stated as behaviour rather than as config.
// ==========================================================================
// WF-18 B added "Responda SIM para confirmar ou NAO para cancelar" to the 24h
// SMS. The live sender is `OsteoJP` - a PT ALPHANUMERIC SENDER ID, which is
// one-way: a handset shown one either disables the reply field or fails the
// send. So the message asked a question that could not be answered.
//
// AND THE FAILURE IS SILENT ON THE PATIENT'S SIDE, WHICH IS WHAT MAKES IT
// WORSE THAN NOT ASKING. Someone who types SIM believes they have confirmed.
// The clinic's agenda still reads `agendada`, reception rings them, and the
// patient is certain they already answered. Asking and not hearing damages
// trust in a way that never asking does not.
//
// THE MESSAGE ADAPTS TO THE SENDER, rather than the message waiting for the
// sender. The Portuguese number is delayed on Twilio inventory and the clinic
// is sending reminders today.
//
// ==========================================================================
// WHAT COUNTS AS REPLYABLE, AND WHY THE FLAG ONLY COVERS ONE CASE.
// ==========================================================================
//   E.164 in TWILIO_SMS_FROM   -> YES. A real number receives SMS.
//   anything else in that var  -> NO. `OsteoJP` is the live value and it is
//                                 one-way. THE FLAG CANNOT OVERRIDE THIS:
//                                 the code KNOWS the sender cannot receive,
//                                 and an operator declaration must not be
//                                 able to contradict a fact the code has.
//   messaging service only     -> ASK THE OPERATOR. `TWILIO_MESSAGING_SERVICE_SID`
//                                 names a service whose sender POOL this code
//                                 cannot see; the pool may hold a two-way
//                                 number, an alphanumeric id, or both, and
//                                 Twilio picks at send time. That is genuinely
//                                 unknowable from here, so it is declared
//                                 rather than guessed - REMINDERS_REPLY_CAPABLE,
//                                 exact string "true", default OFF.
//   nothing configured         -> NO.
//
// DEFAULT OFF IN EVERY AMBIGUOUS CASE. The failure mode of a wrong "yes" is a
// patient who thinks they confirmed; the failure mode of a wrong "no" is a
// patient who has to ring the clinic, which is what they do today. Those are
// not symmetric, and the default follows the cheaper one.
//
// Pure module: no DB, no SDK, no `server-only`. `env` is injectable so the
// matrix can be tested without mutating process.env.

import type { EnvSource } from "@osteojp/notify";

/**
 * The flag, for the messaging-service case only. Exact string "true" arms it -
 * the same fail-safe rule REMINDERS_LIVE_SEND and REMINDERS_FEE_NOTICE_ENABLED
 * follow, and for the same reason: a typo in a Vercel variable must fail
 * closed, not open.
 */
export const REPLY_CAPABLE_FLAG = "REMINDERS_REPLY_CAPABLE" as const;

/**
 * E.164: a leading `+`, a non-zero country digit, then 7 to 14 more digits.
 *
 * DELIBERATELY NARROWER THAN "CAN RECEIVE SMS". A numeric SHORT CODE (12345)
 * can receive replies and is not E.164, so this answers "no" for one. The
 * clinic has no short code and will not buy one; a false "no" costs a line of
 * copy, and being permissive here would cost a patient a reply nobody hears.
 */
const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Whether a reply to the outbound sender can reach us.
 *
 * MIRRORS `twilioSender()` IN clients.ts: TWILIO_SMS_FROM takes precedence and
 * the messaging service is the fallback. If those two ever disagree about which
 * sender is in play, this function would be answering about a sender that is
 * not the one sending - so the precedence is restated here rather than assumed,
 * and `reply-capability.test.ts` pins it against that function's behaviour.
 */
export function senderCanReceiveReplies(env: EnvSource = process.env): boolean {
  const from = env.TWILIO_SMS_FROM?.trim();
  if (from) return E164.test(from);

  const service = env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (service) return env[REPLY_CAPABLE_FLAG] === "true";

  // No sender at all. The send itself is suppressed as
  // `missing_provider_config` downstream; there is nothing to reply to.
  return false;
}

/**
 * Why the answer is what it is. Returned for the operator-facing log only -
 * never branched on, so this cannot become a second, drifting copy of the rule
 * above.
 */
export function replyCapabilityReason(env: EnvSource = process.env): string {
  const from = env.TWILIO_SMS_FROM?.trim();
  if (from) {
    return E164.test(from)
      ? "TWILIO_SMS_FROM is an E.164 number"
      : `TWILIO_SMS_FROM is set but is not an E.164 number (an alphanumeric sender id is one-way); ${REPLY_CAPABLE_FLAG} cannot override a sender the code can see`;
  }
  if (env.TWILIO_MESSAGING_SERVICE_SID?.trim()) {
    return env[REPLY_CAPABLE_FLAG] === "true"
      ? `${REPLY_CAPABLE_FLAG} is exactly "true", declaring the messaging service routes a replyable sender`
      : `a messaging service is configured but ${REPLY_CAPABLE_FLAG} is not exactly "true"; the sender pool cannot be inspected from here`;
  }
  return "no outbound SMS sender is configured";
}
