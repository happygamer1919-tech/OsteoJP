// IfThenPay integration — error taxonomy.
//
// One base class with a `retryable` flag so the Inngest layer can decide,
// generically, whether to retry or to give up (NonRetriableError). Mapping HTTP
// status → retryability lives here so the client and the job agree.
//
// PII / payment-secrecy rule (CLAUDE.md #7 + the IfThenPay brief): error
// messages carry only non-identifying data — HTTP status, a short reason, the
// tenant id, our orderId. NEVER an IfThenPay key (MB / MB Way / anti-phishing),
// the request body, the callback query string, a payer phone number, an email,
// or the raw amount.

/** Base for every error this module raises. */
export class IfThenPayError extends Error {
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
 * raises before any outbound call: the IfThenPay sandbox keys are provisioned
 * separately (clinic PT entity) and are never committed.
 */
export class IfThenPayConfigError extends IfThenPayError {
  constructor(message: string) {
    super(message, false);
  }
}

/** A non-2xx HTTP response from IfThenPay. Retryability is status-derived. */
export class IfThenPayApiError extends IfThenPayError {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message, isRetryableStatus(status));
    this.status = status;
  }
}

/** Transport-level failure (DNS, connection reset, timeout). Always retryable. */
export class IfThenPayNetworkError extends IfThenPayError {
  constructor(message: string) {
    super(message, true);
  }
}

/**
 * A callback whose anti-phishing key does not match the configured secret, or is
 * absent. NEVER retryable — a spoofed or malformed callback will never become
 * valid on retry, and retrying would re-process a forged event. The handler
 * rejects it before any ledger write.
 */
export class IfThenPayCallbackAuthError extends IfThenPayError {
  constructor(message: string) {
    super(message, false);
  }
}

/**
 * Retryable HTTP statuses: 408 (timeout), 429 (rate limit), and any 5xx. A 4xx
 * other than 408/429 is a request the server will reject identically on retry
 * (bad key, malformed request) → not retryable.
 */
export function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  return status >= 500 && status <= 599;
}
