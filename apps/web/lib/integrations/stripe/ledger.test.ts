import { describe, expect, it } from "vitest";
import { paymentIntentToLedgerUpdate, refundToLedgerUpdate } from "./ledger";
import type { PaymentIntentResult, PaymentReference, RefundResult } from "./types";

const REF = { tenantId: "t-1", invoiceId: "inv-1" };
const NOW = new Date("2026-06-03T12:00:00Z");

function pi(
  status: PaymentIntentResult["status"],
  reference: PaymentReference | null = REF,
): PaymentIntentResult {
  return { id: "pi_1", status, amountCents: 6000, currency: "EUR", reference, clientSecret: null };
}

describe("paymentIntentToLedgerUpdate", () => {
  it("marks the invoice paid on a settled intent", () => {
    const update = paymentIntentToLedgerUpdate(pi("settled"), NOW);
    expect(update).toEqual({
      tenantId: "t-1",
      invoiceId: "inv-1",
      status: "paid",
      paidAt: NOW,
      paymentProvider: "stripe",
      paymentRef: "pi_1",
    });
  });

  it("never flips the invoice on a non-settled intent (records provider/ref only)", () => {
    for (const s of ["processing", "requires_action", "failed", "canceled"] as const) {
      const update = paymentIntentToLedgerUpdate(pi(s), NOW);
      expect(update?.status).toBeNull();
      expect(update?.paidAt).toBeNull();
      expect(update?.paymentRef).toBe("pi_1");
    }
  });

  it("returns null when the intent carries no internal reference", () => {
    expect(paymentIntentToLedgerUpdate(pi("settled", null), NOW)).toBeNull();
  });
});

describe("refundToLedgerUpdate", () => {
  const fullRefund: RefundResult = {
    id: "re_1",
    paymentIntentId: "pi_1",
    status: "succeeded",
    amountCents: 6000,
    currency: "EUR",
  };

  it("voids the invoice on a fully-refunded succeeded refund", () => {
    const update = refundToLedgerUpdate(fullRefund, REF, { fullyRefunded: true });
    expect(update.status).toBe("void");
    expect(update.paymentRef).toBe("pi_1");
  });

  it("leaves the invoice paid on a partial refund", () => {
    const update = refundToLedgerUpdate({ ...fullRefund, amountCents: 2000 }, REF, {
      fullyRefunded: false,
    });
    expect(update.status).toBeNull();
  });

  it("does not void on a pending/failed refund even if full", () => {
    const update = refundToLedgerUpdate({ ...fullRefund, status: "pending" }, REF, {
      fullyRefunded: true,
    });
    expect(update.status).toBeNull();
  });
});
