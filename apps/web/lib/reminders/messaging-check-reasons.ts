// WHY THE OWNER'S DELIVERY TEST DID NOT SEND, AS A CLOSED LIST.
//
// PURE ON PURPOSE: no `server-only`, no database. `messaging-check.ts` returns
// these, `/admin/messaging-check` turns each one into a sentence, and a test
// walks the list so a reason with no sentence fails instead of reaching the
// owner as a bare code.

import type { SuppressionReason } from "@osteojp/notify";

/**
 * Every reason `sendMessagingCheck` can refuse with.
 *
 * A CONST LIST, AND THE TYPE IS DERIVED FROM IT, so the page's sentence table
 * can be checked against the list at run time as well as by the compiler.
 */
export const MESSAGING_CHECK_REFUSALS = [
  /** The number typed is not a Portuguese phone number. Nothing was sent. */
  "invalid_phone",
  /** A Portuguese landline: a real number that cannot receive SMS. */
  "landline",
  /** Kept for the action's own limit; the action redirects with `limited`. */
  "rate_limited",
  /** The confirm link is disarmed, so there is nothing to test. */
  "no_link",
  /** The renderer refused the body: it would not fit one GSM-7 segment. */
  "body_refused",
  /** The appointment id typed is not an id at all. Nothing was read or sent. */
  "invalid_appointment",
  /**
   * The appointment named is an online request reception has not accepted.
   * A live code for it would let the link in the test message confirm it.
   */
  "pending_request",
  /** The notification gate held the message: live sending is switched off. */
  "live_send_disabled",
  /** The gate held it: no SMS sender or provider credentials are configured. */
  "missing_provider_config",
  /** The gate held it: the reminder template is not approved for sending. */
  "template_unapproved",
  /** The provider was called and rejected the message. `detail` says why. */
  "send_failed",
] as const;

export type MessagingCheckRefusal = (typeof MESSAGING_CHECK_REFUSALS)[number];

export function isMessagingCheckRefusal(value: string): value is MessagingCheckRefusal {
  return (MESSAGING_CHECK_REFUSALS as readonly string[]).includes(value);
}

/**
 * The refusal a held-back send is reported as.
 *
 * A `Record` OVER THE GATE'S OWN UNION, so a fifth suppression reason added to
 * packages/notify does not compile until it is given an answer here.
 */
const SUPPRESSION_REFUSAL: Record<SuppressionReason, MessagingCheckRefusal> = {
  template_unapproved: "template_unapproved",
  live_send_disabled: "live_send_disabled",
  missing_provider_config: "missing_provider_config",
  invalid_recipient: "invalid_phone",
};

export function refusalFromSuppression(reason: SuppressionReason): MessagingCheckRefusal {
  return SUPPRESSION_REFUSAL[reason];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Is this the SHAPE of an appointment id?
 *
 * Anything else reaches Postgres as `'...'::uuid` and raises 22P02, which on a
 * server action is a 500. Shape only: whether the appointment exists is the
 * database's answer.
 */
export function isAppointmentIdShape(value: string): boolean {
  return UUID.test(value);
}

/**
 * Is this appointment an online request reception has not accepted yet?
 *
 * THE SAME RULE THE REMINDER JOB APPLIES before it sends anything
 * (`isUnacceptedPedido` in dispatch.ts, R10): still `scheduled`, and booked by
 * the patient through the portal. The job never mints a confirm code for such
 * a row, so the delivery test must not either. `messaging-check.test.ts` reads
 * dispatch.ts and fails if that rule moves without this one.
 */
export const ONLINE_REQUEST_ORIGINS: ReadonlySet<string> = new Set(["patient_portal"]);

export function isUnacceptedOnlineRequest(row: { status: string; origin: string }): boolean {
  return row.status === "scheduled" && ONLINE_REQUEST_ORIGINS.has(row.origin);
}
