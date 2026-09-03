// WHO THE OUTBOUND SMS IS FROM. ONE RESOLVER, AND EVERY CALLER ASKS IT.
//
// ==========================================================================
// WHY THIS EXISTS: TWO FILES ASKED THE SAME QUESTION AND DISAGREED
// ==========================================================================
// `clients.ts` resolved the sender with `??` and `reply-capability.ts` with
// `?.trim()`, so they parted company on exactly one input - a `TWILIO_SMS_FROM`
// set to the EMPTY STRING:
//
//   clients.ts          `"" ?? service` is `""` (nullish, not falsy), so the
//                       sender resolved to "" and the send was suppressed as
//                       missing_provider_config.
//   reply-capability.ts `"".trim()` is falsy, so it fell THROUGH to the
//                       messaging-service branch and could arm the reply line
//                       on a sender clients.ts would never have used.
//
// reply-capability.ts's own header said it "MIRRORS `twilioSender()` in
// clients.ts ... so the precedence is restated here rather than assumed". A
// restated rule is a second rule, and this is the input where the two differed.
// There is now one rule, and both files read its answer.
//
// ==========================================================================
// IT RETURNS A KIND, NOT A STRING, AND THAT IS THE POINT
// ==========================================================================
// Every caller wants a different thing from this value - Twilio wants the right
// PARAMETER, the reply gate wants to know if a human can answer, the operator
// page wants a label safe to print. A bare string would make each of them
// re-derive "is this a number, a name, or a service id" from the characters,
// which is three copies of the classification and three chances to drift.
//
// CONFIRM-08, SR-43. The incident that produced it: TWILIO_SMS_FROM held an
// E.164 number that Twilio does not own, so every message failed at the
// provider AND the reply line armed, because an E.164 sender is exactly the
// condition the reply gate says can receive a reply. One variable, two
// symptoms, and nothing on any screen said which sender was in play.

import type { EnvSource } from "@osteojp/notify";

/** The env names this module reads. Exported so callers never spell them. */
export const SMS_FROM_VAR = "TWILIO_SMS_FROM" as const;
export const MESSAGING_SERVICE_VAR = "TWILIO_MESSAGING_SERVICE_SID" as const;

/**
 * E.164: a leading `+`, a non-zero country digit, then 7 to 14 more digits.
 *
 * DELIBERATELY NARROWER THAN "CAN RECEIVE SMS". A numeric SHORT CODE (12345)
 * can receive replies and is not E.164, so this classifies one as alphanumeric.
 * The clinic has no short code and will not buy one; a false "no" costs a line
 * of copy, and being permissive here would cost a patient a reply nobody hears.
 */
const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * A Messaging Service SID is `MG` + 32 hex. Twilio's own id scheme, and the
 * only thing that distinguishes it from the other two forms `TWILIO_SMS_FROM`
 * can hold.
 */
const MESSAGING_SERVICE_SID = /^MG[0-9a-f]{32}$/i;

export type OutboundSender =
  /** An E.164 number. Twilio takes it as `From`, and a human can reply to it. */
  | { kind: "number"; value: string; source: typeof SMS_FROM_VAR | typeof MESSAGING_SERVICE_VAR }
  /** An alphanumeric sender id such as `OsteoJP`. ONE-WAY: no reply can arrive. */
  | { kind: "alphanumeric"; value: string; source: typeof SMS_FROM_VAR | typeof MESSAGING_SERVICE_VAR }
  /**
   * A Messaging Service. Twilio takes it as `MessagingServiceSid`, and whether
   * its POOL routes a replyable sender is not inspectable from here.
   */
  | { kind: "messaging_service"; value: string; source: typeof SMS_FROM_VAR | typeof MESSAGING_SERVICE_VAR }
  /** Nothing usable is configured. Includes a variable that exists but is BLANK. */
  | { kind: "none" };

/**
 * The one place the sender is resolved.
 *
 * BLANK IS NOT A SENDER, and that single decision is the fix. `TWILIO_SMS_FROM`
 * set to "" now falls through to the messaging service in BOTH callers, or to
 * `none` if there is no service - one answer, whichever caller asks. Trimming
 * before the emptiness test also means a value pasted with a trailing newline
 * behaves as the value, not as a different sender.
 */
export function resolveOutboundSender(env: EnvSource = process.env): OutboundSender {
  const from = env[SMS_FROM_VAR]?.trim();
  if (from) return classify(from, SMS_FROM_VAR);

  // THE SOURCE DECIDES, NOT THE SHAPE. A value in TWILIO_MESSAGING_SERVICE_SID
  // IS a messaging service because of the variable it is in, whatever it looks
  // like. Pattern-matching it here would classify a mistyped or shortened SID
  // as an alphanumeric sender id and answer confidently about the wrong thing -
  // and the operator would get "OsteoJP-style one-way sender" for a service.
  const service = env[MESSAGING_SERVICE_VAR]?.trim();
  if (service) return { kind: "messaging_service", value: service, source: MESSAGING_SERVICE_VAR };

  return { kind: "none" };
}

/**
 * Classify a value from `TWILIO_SMS_FROM`, which is the one variable that can
 * hold all three forms - a number, an alphanumeric id, or a Messaging Service
 * SID somebody put in the wrong box. `twilioSenderParam` exists because of that
 * last case, so the shape has to be read HERE and cannot be assumed.
 */
function classify(
  value: string,
  source: typeof SMS_FROM_VAR,
): OutboundSender {
  if (MESSAGING_SERVICE_SID.test(value)) return { kind: "messaging_service", value, source };
  if (E164.test(value)) return { kind: "number", value, source };
  return { kind: "alphanumeric", value, source };
}

/**
 * The raw string Twilio needs, or undefined when nothing is configured.
 *
 * The ONLY place a caller may take the value back out. `clients.ts` needs it to
 * build the request; nothing else does, and nothing may log or render it - use
 * `senderLabel` for that.
 */
export function outboundSenderValue(env: EnvSource = process.env): string | undefined {
  const sender = resolveOutboundSender(env);
  return sender.kind === "none" ? undefined : sender.value;
}

/**
 * A sender safe to PRINT on an operator screen.
 *
 * ==========================================================================
 * AN ALPHANUMERIC ID IS SHOWN IN FULL AND A NUMBER IS NOT.
 * ==========================================================================
 * `OsteoJP` is a brand name that every patient already sees on their handset;
 * masking it would hide the one fact the operator is checking. A PHONE NUMBER
 * is a contact detail and is masked to its last four digits - enough to tell
 * two candidate numbers apart, which is the whole job, and not enough to be a
 * number anybody can act on. A Messaging Service SID is masked the same way.
 *
 * This is what makes the misconfiguration visible on a screen instead of in a
 * Twilio log: the operator can see AT A GLANCE that the sender is a number
 * when it should be a name.
 */
export function senderLabel(env: EnvSource = process.env): string {
  const sender = resolveOutboundSender(env);
  switch (sender.kind) {
    case "alphanumeric":
      return sender.value;
    case "number":
      return `numero terminado em ${last4(sender.value)}`;
    case "messaging_service":
      return `servico de mensagens ${last4(sender.value)}`;
    case "none":
      return "nenhum remetente configurado";
  }
}

/** The last four characters, or as many as exist. Never the whole value. */
function last4(value: string): string {
  return value.slice(-4);
}
