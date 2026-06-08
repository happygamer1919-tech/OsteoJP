// IfThenPay integration — request/response + callback models.
//
// Two layers, deliberately separated (same split as the InvoiceXpress module):
//   1. DOMAIN types (our side) — money in integer CENTS, our naming,
//      tenant-scoped. This is what app code passes to the operations.
//   2. WIRE types (`Ift*`) — the exact JSON shapes the IfThenPay gateway
//      accepts/returns. Money is euro DECIMAL STRINGS ("60.00"), keys are the
//      vendor's PascalCase. money.ts + the operations are the only places that
//      convert between the two.
//
// IfThenPay is a PAYMENT provider, not a fiscal one: this module records payment
// status to the INTERNAL invoices ledger only. It NEVER issues a fiscal document
// — that is the InvoiceXpress relay's job (CLAUDE.md: invoicing legal compliance
// is owner-confirmable; PT fiscal docs come from the AT-certified provider).

/* ================================================================== */
/* Domain — payment method + status                                    */
/* ================================================================== */

/** The IfThenPay payment methods OsteoJP uses. Maps to the payment_provider
 * enum values "multibanco" / "mbway" on the invoices ledger. */
export type PaymentMethod = "multibanco" | "mbway";

/**
 * Lifecycle of a payment request as we model it. `pending` = reference/request
 * created, awaiting the payer; `paid` = a validated callback confirmed it;
 * `expired` = the Multibanco reference window lapsed unpaid. We never invent a
 * `paid` without a validated callback.
 */
export type PaymentRequestStatus = "pending" | "paid" | "expired";

/* ================================================================== */
/* Domain — Multibanco                                                  */
/* ================================================================== */

/** Input to generate a Multibanco reference for an unpaid invoice. */
export type MultibancoReferenceInput = {
  /**
   * Our internal correlation id passed to IfThenPay as the order id. This is the
   * invoices.id (uuid). It is what the callback echoes back, so reconciliation
   * matches on it. It carries NO PII.
   */
  orderId: string;
  /** Amount to collect, integer cents (EUR). */
  amountCents: number;
  /** Non-PII description printed on the reference (e.g. "Consulta"). Optional. */
  description?: string;
  /** Days until the reference expires. Omitted → IfThenPay account default. */
  expiryDays?: number;
};

/** A generated Multibanco reference the patient pays at an ATM / homebanking. */
export type MultibancoReference = {
  /** Multibanco entity (5 digits). */
  entity: string;
  /** Multibanco reference (9 digits). */
  reference: string;
  /** Amount, integer cents (echoed back, converted from the wire decimal). */
  amountCents: number;
  /** Our order id, echoed by IfThenPay. */
  orderId: string;
  /** IfThenPay request id, stored for support/traceability. */
  requestId: string | null;
  /** Expiry instant (ISO-8601), when IfThenPay returns one. */
  expiresAt: string | null;
};

/* ================================================================== */
/* Domain — MB Way                                                      */
/* ================================================================== */

/** Input to request an MB Way payment (a push to the payer's phone). */
export type MbWayRequestInput = {
  /** Our internal correlation id (invoices.id). Echoed in the callback. */
  orderId: string;
  /** Amount to collect, integer cents (EUR). */
  amountCents: number;
  /**
   * Payer mobile in IfThenPay's "351#9XXXXXXXX" form. This IS payer PII — it is
   * placed in the request BODY only, never a URL, never a log (CLAUDE.md #7).
   */
  mobileNumber: string;
  /** Optional payer email. PII — body only, never logged. */
  email?: string;
  /** Non-PII description shown in the MB Way prompt. Optional. */
  description?: string;
};

/** The accepted MB Way request — the payer must now confirm in the app. */
export type MbWayRequest = {
  /** Our order id, echoed by IfThenPay. */
  orderId: string;
  /** IfThenPay request id, used to poll status / correlate the callback. */
  requestId: string | null;
  /** Vendor status code ("000" = request accepted). Non-PII. */
  statusCode: string;
  /** Our normalized view. A confirmed payment arrives later via callback. */
  status: PaymentRequestStatus;
};

/* ================================================================== */
/* Domain — callback                                                   */
/* ================================================================== */

/**
 * A normalized, ALREADY-AUTHENTICATED payment callback. Produced by callback.ts
 * only after the anti-phishing key is verified, so the anti-phishing key itself
 * is intentionally absent from this shape — it never travels past the gate, and
 * never lands in an Inngest event. Payer PII is never part of a callback.
 */
export type PaymentCallback = {
  /** Our order id (invoices.id) the payment settles. */
  orderId: string;
  /** Integer cents actually paid (converted from the wire decimal). */
  amountCents: number;
  /** Which method settled it. */
  method: PaymentMethod;
  /** IfThenPay request id, for correlation. */
  requestId: string | null;
  /** When the payment was made (ISO-8601), when IfThenPay supplies it. */
  paidAt: string | null;
};

/* ================================================================== */
/* Wire — IfThenPay JSON shapes                                         */
/* ================================================================== */

export type IftMultibancoRequestBody = {
  mbKey: string;
  orderId: string;
  /** Euro decimal string. */
  amount: string;
  description?: string;
  expiryDays?: number;
};

export type IftMultibancoResponse = {
  Entity?: string;
  Reference?: string;
  Amount?: string;
  OrderId?: string;
  RequestId?: string;
  ExpiryDate?: string;
  /** "0" on success. */
  Status?: string;
  Message?: string;
};

export type IftMbWayRequestBody = {
  mbWayKey: string;
  orderId: string;
  /** Euro decimal string. */
  amount: string;
  mobileNumber: string;
  email?: string;
  description?: string;
};

export type IftMbWayResponse = {
  Amount?: string;
  OrderId?: string;
  RequestId?: string;
  /** "000" on a successfully created request. */
  Status?: string;
  Message?: string;
};

/**
 * Raw IfThenPay callback parameters (query string, GET). Keys mirror what the
 * gateway sends. The anti-phishing key arrives as `key`; the order id as
 * `orderId`. All values are strings (query params). PARSED + AUTHENTICATED by
 * callback.ts — never consumed raw downstream.
 */
export type IftCallbackParams = {
  /** Anti-phishing key — the shared secret. Verified, then discarded. */
  key?: string;
  orderId?: string;
  amount?: string;
  requestId?: string;
  entity?: string;
  reference?: string;
  /** Payment instant in IfThenPay's format. */
  payment_datetime?: string;
  /** Some products send "mbway" / "multibanco"; we also infer from fields. */
  payment_type?: string;
};
