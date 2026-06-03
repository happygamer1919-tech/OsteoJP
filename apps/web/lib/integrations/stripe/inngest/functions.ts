import { NonRetriableError } from "inngest";
import {
  inngest,
  EVENT_STRIPE_WEBHOOK_RECEIVED,
  type StripeWebhookReceivedData,
} from "./client";
import { StripeError } from "../errors";
import type { LedgerUpdate } from "../ledger";

// Inngest retry wiring for processing a verified Stripe payment webhook (SDK v4).
//
// Why this layer exists: recording a payment to the internal ledger involves a
// network re-fetch (the authoritative PaymentIntent) + a DB write, either of
// which can fail transiently (rate limit, 5xx, connection reset) or permanently
// (unknown id, missing credentials). Inngest gives us durable retries; this
// function decides WHICH failures are worth retrying using the `retryable` flag
// on StripeError, converting permanent failures to NonRetriableError so attempts
// aren't burned on a request that will fail identically every time.
//
// IDEMPOTENCY: keyed on the Stripe EVENT id, so a redelivered webhook (Stripe
// retries deliveries) NEVER applies the same ledger transition twice — the core
// guard for a payment-processing job.
//
// The actual re-fetch + ledger write live behind runRecordPaymentJob (the seam),
// which is owner-gated and unwired by default (see below).

export const RECORD_PAYMENT_RETRIES = 4;
export const RECORD_PAYMENT_IDEMPOTENCY_KEY = "event.data.eventId";

/**
 * The work of recording one payment webhook: with a configured StripeClient,
 * re-fetch the authoritative PaymentIntent (operations.retrievePaymentIntent),
 * project it onto the ledger (ledger.paymentIntentToLedgerUpdate / for refund
 * events, refundToLedgerUpdate), and apply the tenant-scoped UPDATE to invoices.
 *
 * UNWIRED BY DEFAULT (owner-gated). Two owner dependencies gate a real run: the
 * Stripe secret key (config.ts, unset) and the VAT-23% sign-off (#107 — a
 * payment settles an invoice whose VAT is not authorized for real billing).
 * Until the invoices data layer is wired here, this throws a non-retryable error
 * so a stray event fails fast instead of looping. Tests inject their own runner
 * via recordPaymentWithRetryClassification(data, runner).
 */
export async function runRecordPaymentJob(
  data: StripeWebhookReceivedData,
): Promise<LedgerUpdate> {
  // eventId/paymentIntentId/tenantId/invoiceId are ids, not PII/payment data —
  // safe to name in the message.
  throw new NonRetriableError(
    `stripe: record-payment job for event ${data.eventId} (invoice ${data.invoiceId}) ` +
      "is not wired to the invoices data layer yet (owner-gated follow-up). " +
      "No credentials, no re-fetch, no ledger write — nothing was recorded.",
  );
}

/**
 * Run the record job and translate failures for Inngest:
 *   - StripeError with retryable=false → NonRetriableError (stop).
 *   - retryable error (409/429/5xx/network) → rethrow as-is (Inngest retries).
 * `runner` is injectable so this classification is unit-testable without Inngest.
 */
export async function recordPaymentWithRetryClassification(
  data: StripeWebhookReceivedData,
  runner: (d: StripeWebhookReceivedData) => Promise<LedgerUpdate> = runRecordPaymentJob,
): Promise<LedgerUpdate> {
  try {
    return await runner(data);
  } catch (err) {
    if (err instanceof StripeError && !err.retryable) {
      throw new NonRetriableError(err.message, { cause: err });
    }
    throw err;
  }
}

export const recordPaymentFn = inngest.createFunction(
  {
    id: "record-stripe-payment",
    triggers: [{ event: EVENT_STRIPE_WEBHOOK_RECEIVED }],
    retries: RECORD_PAYMENT_RETRIES,
    // Exactly-once per Stripe event: a redelivered webhook never applies the
    // same ledger transition twice.
    idempotency: RECORD_PAYMENT_IDEMPOTENCY_KEY,
  },
  async ({ event, step }) => {
    const data = event.data as StripeWebhookReceivedData;
    const update = await step.run("record-payment", () =>
      recordPaymentWithRetryClassification(data),
    );
    return {
      eventId: data.eventId,
      invoiceId: update.invoiceId,
      status: update.status,
    };
  },
);

export const functions = [recordPaymentFn];
