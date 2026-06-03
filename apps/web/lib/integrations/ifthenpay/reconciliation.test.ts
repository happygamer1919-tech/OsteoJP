import { describe, expect, it, vi } from "vitest";
import { reconcilePayment } from "./reconciliation";
import type { LedgerInvoice, MarkPaidInput, PaymentLedgerPort } from "./ledger";
import type { PaymentCallback } from "./types";

const ORDER = "00000000-0000-0000-0000-0000000000f1";

function callback(overrides: Partial<PaymentCallback> = {}): PaymentCallback {
  return {
    orderId: ORDER,
    amountCents: 6000,
    method: "multibanco",
    requestId: "req-1",
    paidAt: "2026-06-02 10:30:00",
    ...overrides,
  };
}

/** A mock port seeded with one invoice (or none). */
function makePort(invoice: LedgerInvoice | null) {
  const markInvoicePaid = vi.fn<(i: MarkPaidInput) => Promise<void>>(async () => {});
  const port: PaymentLedgerPort = {
    findInvoiceByOrderId: vi.fn(async (id: string) =>
      invoice && invoice.invoiceId === id ? invoice : null,
    ),
    markInvoicePaid,
  };
  return { port, markInvoicePaid };
}

const UNPAID: LedgerInvoice = {
  invoiceId: ORDER,
  tenantId: "tenant-a",
  amountCents: 6000,
  currency: "EUR",
  status: "issued",
};

describe("reconcilePayment", () => {
  it("marks an unpaid, amount-matching invoice paid (tenant-scoped)", async () => {
    const { port, markInvoicePaid } = makePort(UNPAID);
    const res = await reconcilePayment(port, callback());
    expect(res.outcome).toBe("paid");
    expect(markInvoicePaid).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      invoiceId: ORDER,
      method: "multibanco",
      requestRef: "req-1",
      paidAt: "2026-06-02 10:30:00",
    });
  });

  it("is idempotent: an already-paid invoice is a no-op success", async () => {
    const { port, markInvoicePaid } = makePort({ ...UNPAID, status: "paid" });
    const res = await reconcilePayment(port, callback());
    expect(res.outcome).toBe("already_paid");
    expect(markInvoicePaid).not.toHaveBeenCalled();
  });

  it("returns not_found for an unknown orderId (never writes)", async () => {
    const { port, markInvoicePaid } = makePort(null);
    const res = await reconcilePayment(port, callback());
    expect(res.outcome).toBe("not_found");
    expect(markInvoicePaid).not.toHaveBeenCalled();
  });

  it("refuses to record when the callback amount differs from the invoice", async () => {
    const { port, markInvoicePaid } = makePort(UNPAID);
    const res = await reconcilePayment(port, callback({ amountCents: 5000 }));
    expect(res.outcome).toBe("amount_mismatch");
    expect(markInvoicePaid).not.toHaveBeenCalled();
  });

  it("checks idempotency before the amount guard (a paid replay never alerts)", async () => {
    // Paid invoice + a mismatched amount → still 'already_paid', not a mismatch.
    const { port } = makePort({ ...UNPAID, status: "paid" });
    const res = await reconcilePayment(port, callback({ amountCents: 1 }));
    expect(res.outcome).toBe("already_paid");
  });
});
