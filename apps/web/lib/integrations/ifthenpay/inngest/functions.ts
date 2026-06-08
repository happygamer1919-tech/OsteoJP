import { NonRetriableError } from "inngest";
import {
  inngest,
  EVENT_PAYMENT_CALLBACK_RECEIVED,
  type PaymentCallbackReceivedData,
} from "./client";
import { IfThenPayError } from "../errors";
import { reconcilePayment, type ReconcileResult } from "../reconciliation";
import type { PaymentCallback } from "../types";

// Inngest retry wiring for recording an IfThenPay payment to the ledger (SDK v4).
//
// Why this layer exists: the webhook authenticates the callback at the edge
// (anti-spoof) and acks fast, then hands the durable work — resolve the invoice,
// match the amount, mark it paid + audited — to this function so a transient DB
// blip is retried instead of dropping a real settlement.
//
// IDEMPOTENCY: keyed on the orderId (== invoices.id), so a callback IfThenPay
// re-delivers never settles the same invoice twice. The reconciliation itself is
// also idempotent at the DB level (it only flips a not-yet-paid row), giving
// defense in depth.
//
// Retry classification:
//   - IfThenPayError with retryable=false → NonRetriableError (stop).
//   - reconciliation dead-ends (unknown order / amount mismatch) →
//     NonRetriableError: retrying won't change the answer; these warrant an alert.
//   - a retryable error (transient DB/transport) → rethrow as-is (Inngest retries).

export const RECONCILE_PAYMENT_RETRIES = 4;
export const RECONCILE_PAYMENT_IDEMPOTENCY_KEY = "event.data.orderId";

/** Rebuild the authenticated callback shape from the (already-verified) event. */
function callbackFromEvent(data: PaymentCallbackReceivedData): PaymentCallback {
  return {
    orderId: data.orderId,
    amountCents: data.amountCents,
    method: data.method,
    requestId: data.requestId,
    paidAt: data.paidAt,
  };
}

/**
 * The work of recording one payment: load the production ledger adapter LAZILY
 * (it is `server-only` + DB-bound — kept out of the test graph) and reconcile.
 * Tests inject their own runner via reconcilePaymentWithRetryClassification, so
 * this default is never reached under vitest.
 */
export async function runReconcilePaymentJob(
  data: PaymentCallbackReceivedData,
): Promise<ReconcileResult> {
  const { drizzleLedgerPort } = await import("../ledger-drizzle");
  return reconcilePayment(drizzleLedgerPort, callbackFromEvent(data));
}

/**
 * Run the reconcile job and translate the outcome for Inngest. `runner` is
 * injectable so this classification is unit-testable without Inngest or a DB.
 */
export async function reconcilePaymentWithRetryClassification(
  data: PaymentCallbackReceivedData,
  runner: (
    d: PaymentCallbackReceivedData,
  ) => Promise<ReconcileResult> = runReconcilePaymentJob,
): Promise<ReconcileResult> {
  let result: ReconcileResult;
  try {
    result = await runner(data);
  } catch (err) {
    if (err instanceof IfThenPayError && !err.retryable) {
      throw new NonRetriableError(err.message, { cause: err });
    }
    throw err; // retryable (DB/transport) → Inngest retries
  }

  // Business dead-ends: stop and surface for an operator. orderId is an id, not
  // PII, so it is safe in the message.
  if (result.outcome === "not_found") {
    throw new NonRetriableError(
      `ifthenpay: no invoice for order ${result.orderId} — callback unmatched.`,
    );
  }
  if (result.outcome === "amount_mismatch") {
    throw new NonRetriableError(
      `ifthenpay: amount mismatch for order ${result.orderId} — not recorded.`,
    );
  }

  return result; // "paid" | "already_paid"
}

export const reconcilePaymentFn = inngest.createFunction(
  {
    id: "reconcile-ifthenpay-payment",
    triggers: [{ event: EVENT_PAYMENT_CALLBACK_RECEIVED }],
    retries: RECONCILE_PAYMENT_RETRIES,
    // Exactly-once per order: a re-delivered callback never settles twice.
    idempotency: RECONCILE_PAYMENT_IDEMPOTENCY_KEY,
  },
  async ({ event, step }) => {
    const data = event.data as PaymentCallbackReceivedData;
    const result = await step.run("reconcile-payment", () =>
      reconcilePaymentWithRetryClassification(data),
    );
    return { orderId: data.orderId, outcome: result.outcome };
  },
);

export const functions = [reconcilePaymentFn];
