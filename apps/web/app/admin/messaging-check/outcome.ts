// WHAT THE LAST SEND DID, READ BACK FROM THE URL THE ACTION REDIRECTED TO.
//
// PURE: no request, no environment. The page hands it the search params and
// renders what comes back, and the tests walk every reason through it.
//
// EVERY REFUSAL IS A SENTENCE. The action redirects with the reason as a short
// code (`?m=landline`), and a code is not something an owner can act on. The
// table below gives each one a string key, and it is a `Record` over the
// closed list in `messaging-check-reasons.ts`: a reason added there does not
// compile until it has a sentence here, and `messaging-check-view.test.tsx`
// checks the same thing at run time, in both languages.

import type { StringKey } from "@osteojp/i18n";

import { smsSegments } from "@/lib/reminders/messaging-check-body";
import {
  isMessagingCheckRefusal,
  type MessagingCheckRefusal,
} from "@/lib/reminders/messaging-check-reasons";

/** The sentence for each reason `sendMessagingCheck` can refuse with. */
export const REFUSAL_SENTENCE: Record<MessagingCheckRefusal, StringKey> = {
  invalid_phone: "admin.messagingCheck.invalidPhone",
  landline: "admin.messagingCheck.landline",
  rate_limited: "admin.messagingCheck.limited",
  no_link: "admin.messagingCheck.noLink",
  body_refused: "admin.messagingCheck.bodyRefused",
  invalid_appointment: "admin.messagingCheck.invalidAppointment",
  pending_request: "admin.messagingCheck.pendingRequest",
  live_send_disabled: "admin.messagingCheck.liveSendDisabled",
  missing_provider_config: "admin.messagingCheck.missingProviderConfig",
  template_unapproved: "admin.messagingCheck.templateUnapproved",
  send_failed: "admin.messagingCheck.sendFailed",
};

/**
 * The refusals whose technical detail is worth printing under the sentence:
 * the provider's own words, and the rule that refused the body. Every other
 * refusal is fully said by its sentence, and a `d` on the URL is ignored.
 */
const CARRIES_DETAIL: ReadonlySet<MessagingCheckRefusal> = new Set(["send_failed", "body_refused"]);

/** The action's own marker for its rate limit, which it checks before the send. */
const ACTION_LIMITED = "limited";

export type MessagingCheckOutcome =
  /** Nothing has been sent from this page load. */
  | { kind: "idle" }
  | {
      kind: "sent";
      /** The body's length, or null when the URL did not carry a usable one. */
      length: number | null;
      segments: number | null;
      /** Whether the confirm code in the message names a real appointment. */
      live: boolean;
    }
  | {
      kind: "refused";
      sentence: StringKey;
      /** Provider or rule text, shown UNDER the sentence, never instead of it. */
      detail: string | null;
    };

export type MessagingCheckSearchParams = {
  m?: string;
  len?: string;
  live?: string;
  d?: string;
};

/** A length from the URL: digits only, and no longer than any SMS could be. */
function readLength(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

export function messagingCheckOutcome(params: MessagingCheckSearchParams): MessagingCheckOutcome {
  const { m, len, live, d } = params;
  if (!m) return { kind: "idle" };

  if (m === "sent") {
    const length = readLength(len);
    return {
      kind: "sent",
      length,
      segments: length === null ? null : smsSegments(length),
      live: live === "1",
    };
  }

  if (m === ACTION_LIMITED) {
    return { kind: "refused", sentence: REFUSAL_SENTENCE.rate_limited, detail: null };
  }

  if (isMessagingCheckRefusal(m)) {
    return {
      kind: "refused",
      sentence: REFUSAL_SENTENCE[m],
      detail: CARRIES_DETAIL.has(m) && d ? d : null,
    };
  }

  // A marker this page does not know. It is NOT printed: a raw code on the
  // screen is the thing this module exists to prevent. The owner reads that
  // nothing was sent, which is the only safe reading of an unknown outcome.
  return { kind: "refused", sentence: "admin.messagingCheck.failed", detail: null };
}
