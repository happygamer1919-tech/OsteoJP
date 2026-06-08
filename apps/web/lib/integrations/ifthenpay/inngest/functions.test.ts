import { describe, expect, it } from "vitest";
import { NonRetriableError } from "inngest";
import {
  reconcilePaymentWithRetryClassification,
  reconcilePaymentFn,
  RECONCILE_PAYMENT_RETRIES,
  RECONCILE_PAYMENT_IDEMPOTENCY_KEY,
} from "./functions";
import {
  IfThenPayApiError,
  IfThenPayCallbackAuthError,
  IfThenPayNetworkError,
} from "../errors";
import type { ReconcileResult } from "../reconciliation";
import type { PaymentCallbackReceivedData } from "./client";

const DATA: PaymentCallbackReceivedData = {
  orderId: "00000000-0000-0000-0000-0000000000f1",
  amountCents: 6000,
  method: "multibanco",
  requestId: "req-1",
  paidAt: "2026-06-02 10:30:00",
};

const ok = (outcome: ReconcileResult["outcome"]): ReconcileResult => ({
  outcome,
  orderId: DATA.orderId,
});

describe("retry classification — successes", () => {
  it("returns a 'paid' result unchanged", async () => {
    const res = await reconcilePaymentWithRetryClassification(DATA, async () => ok("paid"));
    expect(res.outcome).toBe("paid");
  });

  it("treats an idempotent replay ('already_paid') as success", async () => {
    const res = await reconcilePaymentWithRetryClassification(DATA, async () =>
      ok("already_paid"),
    );
    expect(res.outcome).toBe("already_paid");
  });
});

describe("retry classification — business dead-ends become NonRetriable", () => {
  it("stops on an unmatched order", async () => {
    const err = await reconcilePaymentWithRetryClassification(DATA, async () =>
      ok("not_found"),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(NonRetriableError);
  });

  it("stops on an amount mismatch", async () => {
    const err = await reconcilePaymentWithRetryClassification(DATA, async () =>
      ok("amount_mismatch"),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(NonRetriableError);
  });
});

describe("retry classification — error handling", () => {
  it("converts a non-retryable IfThenPayError to NonRetriableError", async () => {
    const err = await reconcilePaymentWithRetryClassification(DATA, async () => {
      throw new IfThenPayCallbackAuthError("spoofed");
    }).catch((e) => e);
    expect(err).toBeInstanceOf(NonRetriableError);
  });

  it("also converts a non-retryable 4xx", async () => {
    const err = await reconcilePaymentWithRetryClassification(DATA, async () => {
      throw new IfThenPayApiError(400, "bad");
    }).catch((e) => e);
    expect(err).toBeInstanceOf(NonRetriableError);
  });

  it("rethrows a retryable error so Inngest retries (e.g. transient DB/transport)", async () => {
    const original = new IfThenPayNetworkError("conn reset");
    const err = await reconcilePaymentWithRetryClassification(DATA, async () => {
      throw original;
    }).catch((e) => e);
    expect(err).toBe(original);
    expect(err).not.toBeInstanceOf(NonRetriableError);
  });

  it("rethrows an arbitrary (DB) error as retryable", async () => {
    const err = await reconcilePaymentWithRetryClassification(DATA, async () => {
      throw new Error("db unavailable");
    }).catch((e) => e);
    expect(err).not.toBeInstanceOf(NonRetriableError);
    expect((err as Error).message).toBe("db unavailable");
  });
});

describe("reconcilePaymentFn config", () => {
  it("is configured with retries + a per-order idempotency key", () => {
    // Guards exactly-once settlement: a re-delivered callback never pays twice.
    expect(RECONCILE_PAYMENT_RETRIES).toBe(4);
    expect(RECONCILE_PAYMENT_IDEMPOTENCY_KEY).toContain("event.data.orderId");
    expect(reconcilePaymentFn.id).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PENDING the owner-provisioned IfThenPay sandbox keys (clinic PT entity). This
// is the only test that would touch the live sandbox — it stays skipped until
// the keys are set in env. Do NOT un-skip it without them; the rule is "do not
// hit the live sandbox".
// ---------------------------------------------------------------------------
describe.skip("sandbox happy-path (pending owner sandbox keys)", () => {
  it("generates a Multibanco reference + an MB Way request against the sandbox", async () => {
    // Wiring outline once the keys are provisioned:
    //   1. Set IFTHENPAY_BASE_URL to the sandbox host + IFTHENPAY_MB_KEY /
    //      IFTHENPAY_MBWAY_KEY to the sandbox keys.
    //   2. const client = new IfThenPayClient();
    //   3. const ref = await generateMultibancoReference(client, SAMPLE_MULTIBANCO_INPUT);
    //   4. expect(ref.entity).toMatch(/^\d{5}$/);
    //   5. const mbw = await requestMbWayPayment(client, SAMPLE_MBWAY_INPUT);
    //   6. expect(mbw.statusCode).toBe("000");
    expect(true).toBe(true);
  });
});
