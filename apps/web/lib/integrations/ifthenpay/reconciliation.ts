// IfThenPay integration — reconciliation: match a validated callback to its
// request and record the payment to the internal ledger.
//
// Runs ONLY on an already-authenticated PaymentCallback (callback.ts is the
// anti-spoof gate). Its job is the business match:
//   1. resolve the invoice the orderId refers to (tenant-scoped, via the port);
//   2. guard the amount — a callback must settle the exact recorded amount, or
//      we refuse to mark it paid (mismatched/forged-amount protection);
//   3. be idempotent — a re-delivered callback for an already-paid invoice is a
//      no-op success, never a double settlement;
//   4. mark the invoice paid through the port (which writes tenant-scoped + audited).
//
// Returns a discriminated result so the Inngest layer can classify outcomes:
// business dead-ends (unknown order, amount mismatch) are NON-retryable; the
// port surfaces transient DB failures as thrown errors (retryable).

import { decimalStringToCents } from "./money";
import type { PaymentLedgerPort } from "./ledger";
import type { PaymentCallback } from "./types";

export type ReconcileOutcome =
  | "paid" // newly settled
  | "already_paid" // idempotent replay — no-op
  | "not_found" // no invoice for this orderId
  | "amount_mismatch"; // callback amount ≠ recorded amount

export type ReconcileResult = {
  outcome: ReconcileOutcome;
  orderId: string;
};

/**
 * Reconcile one validated callback against the ledger. Pure w.r.t. I/O — all DB
 * access goes through the injected port, so this is fully unit-testable.
 */
export async function reconcilePayment(
  port: PaymentLedgerPort,
  callback: PaymentCallback,
): Promise<ReconcileResult> {
  const invoice = await port.findInvoiceByOrderId(callback.orderId);
  if (!invoice) {
    return { outcome: "not_found", orderId: callback.orderId };
  }

  // Idempotency: a re-delivered callback for a settled invoice is a no-op. This
  // is checked before the amount guard so a benign replay never trips an alert.
  if (invoice.status === "paid") {
    return { outcome: "already_paid", orderId: callback.orderId };
  }

  if (invoice.amountCents !== callback.amountCents) {
    return { outcome: "amount_mismatch", orderId: callback.orderId };
  }

  await port.markInvoicePaid({
    tenantId: invoice.tenantId,
    invoiceId: invoice.invoiceId,
    method: callback.method,
    requestRef: callback.requestId,
    paidAt: callback.paidAt,
  });

  return { outcome: "paid", orderId: callback.orderId };
}

// Re-exported so the Inngest event payload (cents) and reconciliation agree on
// the conversion when a callback is rebuilt from event data.
export { decimalStringToCents };
