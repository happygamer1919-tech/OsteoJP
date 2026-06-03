// Stripe integration — error taxonomy.
//
// One base class with a `retryable` flag so the Inngest layer can decide,
// generically, whether to retry or to give up (NonRetriableError). Mapping HTTP
// status → retryability lives here so the client and the job agree. Mirrors the
// InvoiceXpress module's taxonomy intentionally — same shape, same retry rules.
//
// PII / secrets rule (CLAUDE.md #7): error messages carry only non-identifying
// data — HTTP status, a short reason, the tenant/invoice id. NEVER the secret
// key, the card PAN (we never see it — Stripe tokenizes), the customer email,
// amounts, or the raw Stripe response body.

/** Base for every error this module raises. */
export class StripeError extends Error {
  /** Whether the Inngest job should retry. */
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = new.target.name;
    this.retryable = retryable;
  }
}

/**
 * Credentials missing / malformed. Never retryable — retrying an unconfigured
 * environment just burns attempts. This is the error the owner-gated default
 * raises before any network call (config.ts).
 */
export class StripeConfigError extends StripeError {
  constructor(message: string) {
    super(message, false);
  }
}

/** A non-2xx HTTP response from the Stripe API. */
export class StripeApiError extends StripeError {
  readonly status: number;
  /** Stripe machine-readable error code (e.g. "card_declined"). Non-PII. */
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message, isRetryableStatus(status));
    this.status = status;
    this.code = code;
  }
}

/** Transport-level failure (DNS, connection reset, timeout). Always retryable. */
export class StripeNetworkError extends StripeError {
  constructor(message: string) {
    super(message, true);
  }
}

/**
 * Webhook signature verification failed (bad/missing signature, stale
 * timestamp, secret unset). Never retryable: a signature does not become valid
 * by retrying, and an unverifiable event must be rejected, not reprocessed.
 */
export class StripeSignatureError extends StripeError {
  readonly reason: SignatureRejection;

  constructor(reason: SignatureRejection, message: string) {
    super(message, false);
    this.reason = reason;
  }
}

export type SignatureRejection =
  | "secret_unset"
  | "missing_signature"
  | "malformed_signature"
  | "stale_timestamp"
  | "no_match";

/**
 * Retryable HTTP statuses: 409 (Stripe conflict/lock), 429 (rate limit), and
 * any 5xx. A 4xx other than 409/429 is a request Stripe will reject identically
 * on retry (bad params, declined card, unknown id, auth) → not retryable.
 */
export function isRetryableStatus(status: number): boolean {
  if (status === 409 || status === 429) return true;
  return status >= 500 && status <= 599;
}
