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

import type { MessagingCheckResult } from "@/lib/reminders/messaging-check";
import { smsSegments } from "@/lib/reminders/messaging-check-body";
import {
  isMessagingCheckRefusal,
  isProviderCode,
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
  config_incomplete: "admin.messagingCheck.configIncomplete",
  send_failed: "admin.messagingCheck.sendFailed",
};

/**
 * Provider error codes this screen can explain, and the sentence for each.
 *
 * DELIBERATELY SHORT: the two codes Twilio publishes for a refused recipient.
 * 21211 is the one clients.ts documents (a number that is not E.164), and
 * 21614 is a number that is not a mobile. Every other code gets the general
 * sentence and the code itself, which the owner or whoever configures sending
 * can look up. A longer table of remembered meanings would be a confident
 * sentence about the wrong thing.
 */
export const PROVIDER_CODE_SENTENCE: Readonly<Record<string, StringKey>> = {
  "21211": "admin.messagingCheck.sendFailedRecipient",
  "21614": "admin.messagingCheck.sendFailedRecipient",
};

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
      /**
       * The provider's error code, printed UNDER the sentence as a code.
       * Already checked against `isProviderCode`: never the provider's words.
       */
      providerCode: string | null;
      /** For a refused body: how long it was, when the send knew. */
      length: number | null;
      /** A live code was minted, the message did not go, and it is still live. */
      linkNotWithdrawn: boolean;
    };

/**
 * What the URL may carry. NO FREE TEXT: there is no `d`.
 *
 *   m     a reason from the closed list, `sent`, or the action's `limited`
 *   len   a body length, digits
 *   live  `1` when the code in a sent message names a real appointment
 *   c     a provider error code (`isProviderCode`)
 *   w     `1` when a minted code could not be withdrawn
 */
export type MessagingCheckSearchParams = {
  m?: string;
  len?: string;
  live?: string;
  c?: string;
  w?: string;
};

/** A length from the URL: digits only, and no longer than any SMS could be. */
function readLength(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

/**
 * The address the action redirects to, for one result.
 *
 * EVERY VALUE IS FROM A CLOSED SET, AND THE TYPE IS WHY: a refusal result has
 * no string on it but a reason from the list and a provider code, and the code
 * is checked again here so that a value that is not shaped like a code cannot
 * reach a URL whatever a later edit puts in the field.
 */
export function messagingCheckRedirect(result: MessagingCheckResult): string {
  const base = "/admin/messaging-check";
  if (result.ok) {
    return `${base}?m=sent&len=${result.length}&live=${result.codeWasLive ? "1" : "0"}`;
  }
  const params = [`m=${result.reason}`];
  if (result.providerCode && isProviderCode(result.providerCode)) {
    params.push(`c=${result.providerCode}`);
  }
  if (typeof result.length === "number" && Number.isInteger(result.length) && result.length > 0) {
    params.push(`len=${result.length}`);
  }
  if (result.linkNotWithdrawn) params.push("w=1");
  return `${base}?${params.join("&")}`;
}

export function messagingCheckOutcome(params: MessagingCheckSearchParams): MessagingCheckOutcome {
  const { m, len, live, c, w } = params;
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

  const plain = { providerCode: null, length: null, linkNotWithdrawn: false } as const;

  if (m === ACTION_LIMITED) {
    return { kind: "refused", sentence: REFUSAL_SENTENCE.rate_limited, ...plain };
  }

  if (isMessagingCheckRefusal(m)) {
    // A code is read only where a provider was called, and only when it has
    // the shape of one. Anything else typed onto the URL is ignored, not shown.
    const providerCode = m === "send_failed" && c && isProviderCode(c) ? c : null;
    return {
      kind: "refused",
      sentence:
        providerCode === null
          ? REFUSAL_SENTENCE[m]
          : (PROVIDER_CODE_SENTENCE[providerCode] ?? "admin.messagingCheck.sendFailedCode"),
      providerCode,
      length: m === "body_refused" ? readLength(len) : null,
      linkNotWithdrawn: w === "1",
    };
  }

  // A marker this page does not know. It is NOT printed: a raw code on the
  // screen is the thing this module exists to prevent. The owner reads that
  // nothing was sent, which is the only safe reading of an unknown outcome.
  return { kind: "refused", sentence: "admin.messagingCheck.failed", ...plain };
}
