import { describe, expect, it } from "vitest";
import { NonRetriableError } from "inngest";
import {
  recordPaymentWithRetryClassification,
  runRecordPaymentJob,
  recordPaymentFn,
  RECORD_PAYMENT_RETRIES,
  RECORD_PAYMENT_IDEMPOTENCY_KEY,
} from "./functions";
import { StripeApiError, StripeNetworkError } from "../errors";
import type { LedgerUpdate } from "../ledger";

const DATA = {
  eventId: "evt_1",
  eventType: "payment_intent.succeeded",
  paymentIntentId: "pi_1",
  tenantId: "t-1",
  invoiceId: "inv-1",
};

const FAKE_UPDATE: LedgerUpdate = {
  tenantId: "t-1",
  invoiceId: "inv-1",
  status: "paid",
  paidAt: new Date("2026-06-03T12:00:00Z"),
  paymentProvider: "stripe",
  paymentRef: "pi_1",
};

describe("retry classification", () => {
  it("returns the result on success", async () => {
    const out = await recordPaymentWithRetryClassification(DATA, async () => FAKE_UPDATE);
    expect(out).toBe(FAKE_UPDATE);
  });

  it("converts a NON-retryable StripeError to NonRetriableError (stop)", async () => {
    const runner = async () => {
      throw new StripeApiError(402, "card_declined"); // retryable=false
    };
    const err = await recordPaymentWithRetryClassification(DATA, runner).catch((e) => e);
    expect(err).toBeInstanceOf(NonRetriableError);
  });

  it("rethrows a RETRYABLE network error unchanged (Inngest will retry)", async () => {
    const original = new StripeNetworkError("conn reset"); // retryable=true
    const err = await recordPaymentWithRetryClassification(DATA, async () => {
      throw original;
    }).catch((e) => e);
    expect(err).toBe(original);
    expect(err).not.toBeInstanceOf(NonRetriableError);
  });

  it("rethrows a retryable 5xx so Inngest retries", async () => {
    const err = await recordPaymentWithRetryClassification(DATA, async () => {
      throw new StripeApiError(503, "upstream");
    }).catch((e) => e);
    expect(err).toBeInstanceOf(StripeApiError);
    expect(err).not.toBeInstanceOf(NonRetriableError);
  });
});

describe("runRecordPaymentJob (unwired by default)", () => {
  it("fails non-retryably until the invoices data layer is wired (owner-gated follow-up)", async () => {
    await expect(runRecordPaymentJob(DATA)).rejects.toBeInstanceOf(NonRetriableError);
  });
});

describe("recordPaymentFn config", () => {
  it("is configured with retries + a per-event idempotency key", () => {
    // Guards exactly-once recording: a redelivered webhook never records twice.
    expect(RECORD_PAYMENT_RETRIES).toBe(4);
    expect(RECORD_PAYMENT_IDEMPOTENCY_KEY).toContain("event.data.eventId");
    expect(recordPaymentFn.id).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PENDING the owner-provisioned Stripe secret key (gate 1) AND the VAT-23%
// sign-off (gate 2, #107). This is the only test that would touch live/test
// Stripe — it stays skipped until both gates clear. Do NOT un-skip it without
// the key in env; the rule is "do not hit live or test Stripe".
// ---------------------------------------------------------------------------
describe.skip("live happy-path (pending owner Stripe key + VAT sign-off)", () => {
  it("creates, confirms, and refunds a PaymentIntent against Stripe", async () => {
    // Wiring outline once gates clear:
    //   1. Set STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET in env.
    //   2. const client = new StripeClient();
    //   3. const pi = await createPaymentIntent(client, { reference, amountCents: 6000 });
    //   4. expect(pi.id).toMatch(/^pi_/);
    //   5. await retrievePaymentIntent(client, pi.id);
    //   6. await refundPayment(client, { paymentIntentId: pi.id, reason: "requested_by_customer" });
    expect(true).toBe(true);
  });
});
