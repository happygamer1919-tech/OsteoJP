// Stripe integration — wire ⇄ domain mapping.
//
// The ONLY place that converts between Stripe's JSON wire shapes and our domain
// types. Pure + side-effect-free → fully unit-testable without a network.
//
// Money: Stripe amounts are ALREADY integer minor units (cents for EUR), which
// is exactly our domain representation — so this is a 1:1 passthrough, never
// float math (CLAUDE.md money rule). The work here is STATUS NORMALIZATION
// (Stripe's status vocabulary → ours) and resolving the internal PaymentReference
// from PaymentIntent.metadata.

import type {
  CreatePaymentIntentInput,
  PaymentIntentResult,
  PaymentReference,
  PaymentStatus,
  RefundResult,
  RefundStatus,
  SxPaymentIntent,
  SxRefund,
} from "./types";
import type { FormParams } from "./client";

/* ================================================================== */
/* Metadata keys (the wire contract for the internal reference)        */
/* ================================================================== */

export const META_TENANT_ID = "tenant_id";
export const META_INVOICE_ID = "invoice_id";

/* ================================================================== */
/* Domain → wire                                                       */
/* ================================================================== */

/**
 * Build the form body for creating a PaymentIntent. EUR-only (V1). The tenant +
 * invoice reference is written into metadata so every later webhook can resolve
 * the internal invoice WITHOUT trusting the event's amount. We restrict
 * `payment_method_types` to "card" — this module is card payments only.
 */
export function toCreatePaymentIntentForm(input: CreatePaymentIntentInput): FormParams {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("stripe/mapper: amountCents must be a positive integer");
  }
  const form: FormParams = {
    amount: input.amountCents,
    currency: "eur",
    "payment_method_types[0]": "card",
    metadata: {
      [META_TENANT_ID]: input.reference.tenantId,
      [META_INVOICE_ID]: input.reference.invoiceId,
    },
  };
  if (input.paymentMethodId) form.payment_method = input.paymentMethodId;
  if (input.confirm) form.confirm = true;
  return form;
}

/* ================================================================== */
/* Status normalization                                                */
/* ================================================================== */

/** Normalize a Stripe PaymentIntent status string to our PaymentStatus. */
export function normalizePaymentStatus(raw: string | undefined): PaymentStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "requires_payment_method":
      return "requires_payment_method";
    case "requires_confirmation":
      return "requires_confirmation";
    case "requires_action":
    case "requires_capture": // manual-capture authorized; treat as action-needed
      return "requires_action";
    case "processing":
      return "processing";
    case "succeeded":
      return "settled";
    case "canceled":
    case "cancelled":
      return "canceled";
    default:
      // Stripe has no explicit "failed" PI status — a failed charge leaves the
      // intent at requires_payment_method. An unknown/empty status is treated
      // as failed so the ledger never optimistically marks an invoice paid.
      return "failed";
  }
}

/** Normalize a Stripe Refund status string to our RefundStatus. */
export function normalizeRefundStatus(raw: string | undefined): RefundStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "succeeded":
      return "succeeded";
    case "pending":
      return "pending";
    case "canceled":
    case "cancelled":
      return "canceled";
    default:
      return "failed";
  }
}

/* ================================================================== */
/* Wire → domain                                                       */
/* ================================================================== */

/** Resolve the internal reference from a PaymentIntent's metadata, if complete. */
export function referenceFromMetadata(
  metadata: Record<string, string> | undefined,
): PaymentReference | null {
  const tenantId = metadata?.[META_TENANT_ID]?.trim();
  const invoiceId = metadata?.[META_INVOICE_ID]?.trim();
  if (!tenantId || !invoiceId) return null;
  return { tenantId, invoiceId };
}

/** Map a Stripe PaymentIntent object to our PaymentIntentResult. */
export function fromPaymentIntent(pi: SxPaymentIntent): PaymentIntentResult {
  return {
    id: pi.id,
    status: normalizePaymentStatus(pi.status),
    amountCents: typeof pi.amount === "number" ? pi.amount : 0,
    currency: (pi.currency ?? "eur").toUpperCase(),
    reference: referenceFromMetadata(pi.metadata),
    clientSecret: pi.client_secret ?? null,
  };
}

/** Map a Stripe Refund object to our RefundResult. */
export function fromRefund(re: SxRefund): RefundResult {
  return {
    id: re.id,
    paymentIntentId: re.payment_intent ?? "",
    status: normalizeRefundStatus(re.status),
    amountCents: typeof re.amount === "number" ? re.amount : 0,
    currency: (re.currency ?? "eur").toUpperCase(),
  };
}
