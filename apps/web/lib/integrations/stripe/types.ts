// Stripe integration — request/response models.
//
// Two layers, deliberately separated (mirrors the InvoiceXpress module):
//   1. DOMAIN types (our side) — money in integer CENTS (CLAUDE.md rule), our
//      naming, tenant-scoped. This is what app code passes to the operations.
//   2. WIRE types (`Sx*`) — the Stripe JSON shapes we read back. Stripe amounts
//      are ALREADY integer minor units (cents for EUR), so unlike InvoiceXpress
//      there is no decimal conversion — only a 1:1 cents passthrough plus status
//      normalization. The mapper (mapper.ts) is the only place that converts.
//
// CARD DATA: we never receive, handle, or store a PAN. The card is tokenized by
// Stripe.js / a PaymentMethod id on the client; the server only ever references
// a `payment_method` token id. This module has no field that could carry a PAN
// (CLAUDE.md: never store card PAN).

/* ================================================================== */
/* Domain — payment intent inputs/outputs                              */
/* ================================================================== */

/**
 * The reference that ties a Stripe payment back to the internal invoices ledger.
 * Carried in PaymentIntent.metadata so every webhook can resolve the tenant +
 * invoice WITHOUT trusting the payload's amount. IDS ONLY — no PII, no PAN.
 */
export type PaymentReference = {
  /** Tenant the payment belongs to. Drives tenant-scoped ledger writes. */
  tenantId: string;
  /** Internal invoices.id (uuid) the payment settles. */
  invoiceId: string;
};

/** Everything needed to create a card PaymentIntent for an invoice. */
export type CreatePaymentIntentInput = {
  reference: PaymentReference;
  /** Amount in integer cents (EUR). Stripe's minor unit == our cents. */
  amountCents: number;
  /**
   * Optional PaymentMethod token id (pm_…) collected client-side via Stripe.js.
   * When present with `confirm`, the intent is confirmed in the same call. Never
   * a PAN — always a Stripe token.
   */
  paymentMethodId?: string;
  /** Confirm immediately (off-session/server-confirm). Defaults to false. */
  confirm?: boolean;
  /**
   * Idempotency key for the create call (Stripe `Idempotency-Key` header). A
   * retried create with the same key never charges twice. Defaults to a key
   * derived from the invoice id by the operation.
   */
  idempotencyKey?: string;
};

/** Input for confirming a previously-created PaymentIntent server-side. */
export type ConfirmPaymentIntentInput = {
  paymentIntentId: string;
  /** PaymentMethod token id (pm_…) to confirm with, if not set at create. */
  paymentMethodId?: string;
};

/** Input for refunding a settled payment. */
export type RefundPaymentInput = {
  paymentIntentId: string;
  /**
   * Amount in integer cents to refund. Omitted → full refund of the captured
   * amount. Must not exceed the captured amount (Stripe enforces this too).
   */
  amountCents?: number;
  /** Refund reason. Stripe accepts a fixed enum; non-PII. */
  reason?: RefundReason;
  /** Idempotency key for the refund call. Defaults to one derived from the PI id. */
  idempotencyKey?: string;
};

export type RefundReason = "duplicate" | "fraudulent" | "requested_by_customer";

/**
 * Normalized PaymentIntent status we surface. Maps from Stripe's intent status
 * set; `settled` collapses Stripe's `succeeded`. These drive the internal
 * ledger projection (ledger.ts).
 */
export type PaymentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_action"
  | "processing"
  | "settled"
  | "canceled"
  | "failed";

/** The result of creating / confirming / retrieving a PaymentIntent. */
export type PaymentIntentResult = {
  /** Stripe PaymentIntent id (pi_…) — stored on invoices.payment_ref. */
  id: string;
  status: PaymentStatus;
  /** Amount in integer cents. */
  amountCents: number;
  currency: string;
  /** Resolved internal reference from metadata, when present. */
  reference: PaymentReference | null;
  /**
   * Client secret for completing the payment client-side (Stripe.js). Present
   * only on create/confirm responses. NEVER logged — it authorizes the charge.
   */
  clientSecret: string | null;
};

/** Normalized refund status we surface. */
export type RefundStatus = "pending" | "succeeded" | "failed" | "canceled";

/** The result of issuing a refund. */
export type RefundResult = {
  /** Stripe refund id (re_…). */
  id: string;
  /** The PaymentIntent the refund applies to. */
  paymentIntentId: string;
  status: RefundStatus;
  /** Amount refunded, in integer cents. */
  amountCents: number;
  currency: string;
};

/* ================================================================== */
/* Wire — Stripe JSON shapes (the subset we read)                      */
/* ================================================================== */

/** Stripe PaymentIntent object (subset). Amount is integer minor units. */
export type SxPaymentIntent = {
  id: string;
  object?: "payment_intent";
  status?: string;
  amount?: number;
  currency?: string;
  client_secret?: string | null;
  metadata?: Record<string, string>;
};

/** Stripe Refund object (subset). */
export type SxRefund = {
  id: string;
  object?: "refund";
  status?: string;
  amount?: number;
  currency?: string;
  payment_intent?: string;
};

/** Stripe error envelope: `{ error: { type, code, message } }`. */
export type SxErrorEnvelope = {
  error?: {
    type?: string;
    code?: string;
    message?: string;
  };
};

/** Stripe Event envelope (webhook). `data.object` is the resource that changed. */
export type SxEvent = {
  id: string;
  object?: "event";
  type: string;
  data: {
    object: SxPaymentIntent | SxRefund | Record<string, unknown>;
  };
};
