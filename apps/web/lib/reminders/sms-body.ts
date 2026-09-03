// THE ONE PLACE A REMINDER SMS BODY IS BUILT.
//
// ==========================================================================
// WHY THIS MODULE EXISTS: TWO PATHS WERE ASSEMBLING THE SAME MESSAGE
// ==========================================================================
// `dispatch.ts` sends the real 24h reminder; `messaging-check.ts` sends the
// owner's delivery test, which exists precisely to show him what the real one
// will look like on a handset. Both composed `SmsAdditions` themselves, from
// the same three answers, in two places. Two copies of an assembly are two
// things that can drift, and a delivery test that has drifted from the thing it
// tests is worse than no delivery test: it reports a body nobody will receive.
//
// Both now call THIS, so "the page and the job render the same bytes" is true
// by construction. `sms-body.test.ts` asserts it as an equality anyway, because
// a property that is currently structural stops being structural the day
// somebody adds a fourth addition to one caller.
//
// ==========================================================================
// AND IT ANSWERS INSTEAD OF THROWING. THAT IS THE P0.
// ==========================================================================
// On 2026-09-02 the messaging-check path rendered 185 characters - the 136 of
// the approved body plus the confirm link, plus 49 for a reply instruction that
// had been armed by the environment - and `assertSmsCompliant` threw. The
// refusal was RIGHT: a two-segment SMS doubles the cost of every reminder and
// does it silently. What was wrong is what a throw does at each call site:
//
//   the page   -> a 500 on the owner's screen, with the reason only in Sentry,
//                 on the one page whose entire job is to report what happened;
//   the job    -> a retryable Inngest failure raised AFTER a confirm code had
//                 already been written, so the code was stranded live and 0072's
//                 partial unique index then blocked the retry from minting a
//                 fresh one.
//
// So the refusal travels as a value. Both callers turn it into a sentence, and
// neither one writes anything before it has a body in hand.

import type { Locale } from "@osteojp/i18n";
import type { EnvSource } from "@osteojp/notify";

import { CONFIRM_LINK_BASE_VAR, confirmLinkLineOrNull } from "./confirm-code";
import { senderCanReceiveReplies } from "./reply-capability";
import {
  assembleSms,
  smsCompliance,
  type ReminderContext,
  type ReminderOffsetId,
} from "./templates";

/**
 * A body, or the reason there is not one.
 *
 * THE REFUSAL KINDS ARE NAMED AND FINITE, which is the point. A single
 * `string | null` would have folded "too long", "left GSM-7" and "no origin
 * configured" into one value the caller reports as one thing - the exact shape
 * PORTAL-REHYDRATE 1.3 catalogues. They need different operator actions: the
 * first two are copy that does not fit, the third is a variable that is unset.
 */
export type SmsBodyResult =
  | { ok: true; body: string; length: number }
  | {
      ok: false;
      kind: "too_long" | "not_gsm7" | "no_link_origin";
      /** One sentence, safe to show an operator. Never a recipient, never a code. */
      refusal: string;
      /** The length that was refused, or null when nothing could be assembled. */
      length: number | null;
    };

export type ReminderSmsBodyArgs = {
  offset: ReminderOffsetId;
  locale: Locale;
  ctx: ReminderContext;
  /**
   * The plaintext code the confirm line will carry, or null for no line.
   *
   * A VALUE, NOT A ROW. The caller generates it with `generateConfirmCode()` -
   * which touches nothing - and only writes it to the database once this has
   * returned a body. That ordering is the other half of the P0 fix: a code
   * minted before the render is a row that survives a refusal.
   */
  confirmCode: string | null;
  feeNotice?: boolean;
  env?: EnvSource;
};

/**
 * Build the body both the reminder job and the delivery test send.
 *
 * THE THREE ADDITIONS ARE ANSWERED HERE, ONCE. `senderCanReceiveReplies` and
 * the confirm line are read from the environment in this function and nowhere
 * else on either path, so the render site still never learns what a flag is
 * called and the two paths cannot answer the same question differently.
 */
export function renderReminderSmsBody(args: ReminderSmsBodyArgs): SmsBodyResult {
  const env = args.env ?? process.env;

  // THE LINK LINE, ASKED RATHER THAN ASSUMED. `confirmLinkLineOrNull` returns
  // null for exactly one reason - the deployed origin is unset - and that is an
  // operating condition an operator resolves, not a bug, so it is reported
  // rather than thrown. Without this the page 500s again on a different line.
  let confirmLink: string | undefined;
  if (args.confirmCode !== null) {
    const line = confirmLinkLineOrNull(args.confirmCode, env);
    if (line === null) {
      return {
        ok: false,
        kind: "no_link_origin",
        refusal:
          `reminders/sms: ${CONFIRM_LINK_BASE_VAR} is not set, so the confirm link has no origin ` +
          "to point at; set it to the deployed app origin that serves /c/<code>",
        length: null,
      };
    }
    confirmLink = line;
  }

  const message = assembleSms(args.offset, args.locale, args.ctx, {
    feeNotice: args.feeNotice ?? false,
    replyInstruction: senderCanReceiveReplies(env),
    confirmLink,
  });

  const verdict = smsCompliance(message);
  if (!verdict.ok) {
    return { ok: false, kind: verdict.kind, refusal: verdict.message, length: verdict.length };
  }
  return { ok: true, body: message, length: message.length };
}
