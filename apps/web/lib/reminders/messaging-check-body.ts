// THE BODY OF THE OWNER'S DELIVERY TEST, BUILT IN ONE PLACE FOR TWO READERS.
//
// `sendMessagingCheck` sends it. `/admin/messaging-check` SHOWS it before the
// owner presses anything. A preview that is assembled separately from the send
// is a second message that can drift from the first, and a preview that has
// drifted is worse than none: it shows a body nobody will receive. So both call
// `renderMessagingCheckBody`, and the only thing that differs between them is
// the eight characters of the code.
//
// PURE ON PURPOSE. No `server-only`, no database, no request: the page, the
// send and the tests all import it, and it reads nothing but the environment
// `renderReminderSmsBody` already reads.
//
// NOTHING HERE CHANGES WHAT REACHES A HANDSET. The sample appointment below is
// the one `messaging-check.ts` has always sent, moved, not edited, and
// `sms-body-parity.test.ts` still asserts the result is byte-identical to the
// real 24h reminder.

import type { EnvSource } from "@osteojp/notify";

import { CONFIRM_CODE_LENGTH } from "./confirm-code";
import { renderReminderSmsBody, type SmsBodyResult } from "./sms-body";
import { SMS_SEGMENT_LIMIT, type ReminderContext } from "./templates";

/** The body a 24h reminder would carry today, for a fixed sample appointment. */
export function messagingCheckSampleContext(): ReminderContext {
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
 * The body the delivery test hands to the transport, for one confirm code.
 *
 * THE SAME FUNCTION THE REMINDER JOB CALLS, with the same offset and locale,
 * which is what makes this page a delivery test rather than a lookalike.
 */
export function renderMessagingCheckBody(code: string, env?: EnvSource): SmsBodyResult {
  return renderReminderSmsBody({
    offset: "24h",
    locale: "pt",
    ctx: messagingCheckSampleContext(),
    confirmCode: code,
    env,
  });
}

/**
 * What stands where the code will be, in the preview.
 *
 * EIGHT CHARACTERS, ALL OF THEM IN THE CODE'S OWN ALPHABET, and that is the
 * whole requirement: a real code is exactly this long and every symbol of it
 * is one GSM-7 character, so the preview's length and its segment count are
 * the send's. The send mints a fresh random code each time, so the preview can
 * never show the real one, and must not.
 */
export const MESSAGING_CHECK_PREVIEW_CODE = "X".repeat(CONFIRM_CODE_LENGTH);

/** How many SMS segments a body of this length is billed as. */
export function smsSegments(length: number): number {
  return Math.ceil(length / SMS_SEGMENT_LIMIT);
}

export type MessagingCheckPreview =
  | {
      ok: true;
      /** The body, with `MESSAGING_CHECK_PREVIEW_CODE` where the code goes. */
      body: string;
      length: number;
      segments: number;
      /** The single-segment ceiling the renderer enforces. */
      limit: number;
    }
  | {
      ok: false;
      /** Why the renderer would refuse. The send answers `body_refused`. */
      kind: "too_long" | "not_gsm7" | "no_link_origin";
      /** The length that was refused, or null when nothing could be assembled. */
      length: number | null;
      limit: number;
      /** The renderer's own sentence. Operator-facing, never a recipient. */
      refusal: string;
    };

/**
 * The message the next send would carry, without sending or writing anything.
 */
export function previewMessagingCheck(env?: EnvSource): MessagingCheckPreview {
  const rendered = renderMessagingCheckBody(MESSAGING_CHECK_PREVIEW_CODE, env);
  if (!rendered.ok) {
    return {
      ok: false,
      kind: rendered.kind,
      length: rendered.length,
      limit: SMS_SEGMENT_LIMIT,
      refusal: rendered.refusal,
    };
  }
  return {
    ok: true,
    body: rendered.body,
    length: rendered.length,
    segments: smsSegments(rendered.length),
    limit: SMS_SEGMENT_LIMIT,
  };
}
