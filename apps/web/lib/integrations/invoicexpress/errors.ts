// InvoiceXpress integration — error taxonomy.
//
// One base class with a `retryable` flag so the Inngest layer can decide,
// generically, whether to retry or to give up (NonRetriableError). Mapping HTTP
// status → retryability lives here so the client and the job agree.
//
// PII / secrets rule (CLAUDE.md #7): error messages carry only non-identifying
// data — HTTP status, a short reason, the tenant id. NEVER the API key, the
// request URL (which carries the key in its query string), patient names, NIFs,
// addresses, or invoice amounts.

/** Base for every error this module raises. */
export class InvoiceXpressError extends Error {
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
 * raises before any network call.
 */
export class InvoiceXpressConfigError extends InvoiceXpressError {
  constructor(message: string) {
    super(message, false);
  }
}

/** A non-2xx HTTP response from InvoiceXpress. */
export class InvoiceXpressApiError extends InvoiceXpressError {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message, isRetryableStatus(status));
    this.status = status;
  }
}

/** Transport-level failure (DNS, connection reset, timeout). Always retryable. */
export class InvoiceXpressNetworkError extends InvoiceXpressError {
  constructor(message: string) {
    super(message, true);
  }
}

/**
 * Retryable HTTP statuses: 408 (timeout), 429 (rate limit), and any 5xx. A 4xx
 * other than 408/429 is a request the server will reject identically on retry
 * (bad fiscal data, unknown id, auth) → not retryable.
 */
export function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  return status >= 500 && status <= 599;
}
