// Stripe integration — internal invoices-ledger projection.
//
// Pure mapping from an authoritative Stripe payment/refund state to an UPDATE
// INTENT against the internal `invoices` ledger (packages/db schema). This is
// the "records payment status to the invoices internal ledger" piece — but as a
// pure projection, so it is fully unit-testable and so the actual DB write stays
// an explicit, owner-gated SEAM in inngest/functions.ts (mirrors InvoiceXpress's
// runIssueInvoiceJob).
//
// Maps onto invoices columns:
//   - status         (invoice_status: draft | issued | paid | void)
//   - paid_at        (timestamptz)
//   - payment_provider ('stripe')
//   - payment_ref    (the Stripe PaymentIntent id, pi_…)
//
// We NEVER self-issue a fiscal document and we store amounts only as the ledger
// already does (integer cents). No PAN, no card data — only the pi_ token id.

import type { PaymentIntentResult, PaymentReference, RefundResult } from "./types";

/**
 * An intent to update one invoices row. `status: null` means "no lifecycle
 * transition" (e.g. a failed/processing payment must not flip an invoice to
 * paid). The caller applies this tenant-scoped (tenant_id set explicitly, per
 * CLAUDE.md service-role rule).
 */
export type LedgerUpdate = {
  tenantId: string;
  invoiceId: string;
  /** New invoice_status, or null to leave the lifecycle unchanged. */
  status: "paid" | "void" | null;
  /** Settlement timestamp when transitioning to paid; null otherwise. */
  paidAt: Date | null;
  paymentProvider: "stripe";
  /** The Stripe PaymentIntent id (pi_…). Recorded for reconciliation. Non-PII. */
  paymentRef: string;
};

/**
 * Project an authoritative PaymentIntent (re-fetched from Stripe, not trusted
 * from the webhook body) into a ledger update. Returns null when the intent
 * carries no internal reference — without a tenant + invoice id we cannot
 * safely attribute the payment, and guessing would risk cross-tenant writes.
 *
 *   settled    → status 'paid', paidAt set
 *   any other  → status null (record the provider/ref, never flip to paid)
 */
export function paymentIntentToLedgerUpdate(
  pi: PaymentIntentResult,
  now: Date = new Date(),
): LedgerUpdate | null {
  if (!pi.reference) return null;
  const settled = pi.status === "settled";
  return {
    tenantId: pi.reference.tenantId,
    invoiceId: pi.reference.invoiceId,
    status: settled ? "paid" : null,
    paidAt: settled ? now : null,
    paymentProvider: "stripe",
    paymentRef: pi.id,
  };
}

/**
 * Project a refund into a ledger update. A FULL refund voids the invoice; a
 * partial refund leaves it `paid` (the internal ledger has no partial-refund
 * state — partials are reconciled out of band). The reference comes from the
 * original PaymentIntent (the refund object alone has no metadata), so the
 * caller supplies it after re-fetching the intent.
 */
export function refundToLedgerUpdate(
  refund: RefundResult,
  reference: PaymentReference,
  opts: { fullyRefunded: boolean },
): LedgerUpdate {
  const voided = refund.status === "succeeded" && opts.fullyRefunded;
  return {
    tenantId: reference.tenantId,
    invoiceId: reference.invoiceId,
    status: voided ? "void" : null,
    paidAt: null,
    paymentProvider: "stripe",
    paymentRef: refund.paymentIntentId,
  };
}
