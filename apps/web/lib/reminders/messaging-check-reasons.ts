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
  /**
   * Live sending is armed but a required variable is missing, so the gate
   * raised before any provider was called (`NotificationEnvError`).
   */
  "config_incomplete",
  /**
   * The send threw: the provider rejected the message, or the call to it
   * failed. `providerCode` carries the provider's own error code when it gave
   * one. NEVER its words: see `providerFailureOf`.
   */
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

/* ================================================================== */
/* A THROWN SEND, REDUCED TO A CLOSED VALUE                            */
/* ================================================================== */

/**
 * What a thrown send is allowed to leave behind: a reason from the closed
 * list, and the provider's error code when it has the shape of one.
 *
 * ==========================================================================
 * THE PROVIDER'S MESSAGE IS NEVER READ. THAT IS THE WHOLE OF THIS FUNCTION.
 * ==========================================================================
 * Twilio puts the recipient in its error text ("The 'To' number +351... is
 * not a mobile number"), and clients.ts says so above `ProviderSendError`.
 * This screen used to carry that text, trimmed to 300 characters, into three
 * places: `audit_log.metadata.failure`, the redirect URL (`?d=...`, so browser
 * history and request logs) and the page. The number the owner typed is a
 * contact detail, and rule 7 has no exception for an owner's own screen.
 *
 * So nothing here touches `err.message`. A Twilio SDK error carries a numeric
 * `code` (21211, 21614) and an HTTP `status` beside its message; those are a
 * reason class, and they are what travels. dispatch.ts makes the same choice
 * for the reminder ledger (`providerErrorCode`).
 */
export type ProviderFailure = {
  reason: Extract<MessagingCheckRefusal, "send_failed" | "config_incomplete">;
  /** The provider's error code, or null when the error carried none. */
  code: string | null;
  /** The provider's HTTP status, or null. A number, so it cannot be prose. */
  status: number | null;
};

/**
 * Is this the shape of an error code, and nothing else?
 *
 * TWO SHAPES, BOTH CLOSED, and the bounds are the point. Digits, at most six:
 * a Twilio code is five, and nine digits would be room for a subscriber
 * number. Or capital letters and underscores with NO DIGIT AT ALL, which is
 * what Node's own network errors look like (ECONNRESET, ETIMEDOUT). A value
 * that fits neither is dropped, not trimmed: a trimmed secret is still part of
 * one.
 */
export function isProviderCode(value: string): boolean {
  return /^\d{1,6}$/.test(value) || /^[A-Z_]{2,32}$/.test(value);
}

/** `NotificationEnvError.name`, as packages/notify/src/env.ts sets it. */
const NOTIFICATION_ENV_ERROR = "NotificationEnvError";

export function providerFailureOf(err: unknown): ProviderFailure {
  // The gate's own refusal to run with an incomplete environment. Its message
  // names variables, not people, and it is still not carried: the sentence on
  // the page says what it means.
  //
  // BY NAME, not `instanceof`: this module stays free of the notify runtime so
  // the page's pure code can import it, and the class sets its own name.
  if (err instanceof Error && err.name === NOTIFICATION_ENV_ERROR) {
    return { reason: "config_incomplete", code: null, status: null };
  }
  let code: string | null = null;
  let status: number | null = null;
  if (typeof err === "object" && err !== null) {
    const raw = (err as { code?: unknown }).code;
    const candidate =
      typeof raw === "number" && Number.isInteger(raw) ? String(raw) : typeof raw === "string" ? raw : null;
    if (candidate !== null && isProviderCode(candidate)) code = candidate;

    const s = (err as { status?: unknown }).status;
    if (typeof s === "number" && Number.isInteger(s) && s >= 100 && s <= 599) status = s;
  }
  return { reason: "send_failed", code, status };
}
