import { describe, expect, it } from "vitest";
import {
  fromPaymentIntent,
  fromRefund,
  normalizePaymentStatus,
  normalizeRefundStatus,
  referenceFromMetadata,
  toCreatePaymentIntentForm,
  META_INVOICE_ID,
  META_TENANT_ID,
} from "./mapper";
import { encodeForm } from "./client";

const REF = { tenantId: "t-1", invoiceId: "inv-1" };

describe("toCreatePaymentIntentForm", () => {
  it("builds a card-only EUR intent with the reference in metadata", () => {
    const form = toCreatePaymentIntentForm({
      reference: REF,
      amountCents: 6000,
      paymentMethodId: "pm_card_visa",
      confirm: true,
    });
    const encoded = encodeForm(form);
    expect(encoded).toContain("amount=6000");
    expect(encoded).toContain("currency=eur");
    expect(encoded).toContain("payment_method_types%5B0%5D=card");
    expect(encoded).toContain("payment_method=pm_card_visa");
    expect(encoded).toContain("confirm=true");
    expect(encoded).toContain(`metadata%5B${META_TENANT_ID}%5D=t-1`);
    expect(encoded).toContain(`metadata%5B${META_INVOICE_ID}%5D=inv-1`);
  });

  it("rejects a non-positive or non-integer amount", () => {
    expect(() => toCreatePaymentIntentForm({ reference: REF, amountCents: 0 })).toThrow();
    expect(() => toCreatePaymentIntentForm({ reference: REF, amountCents: 60.5 })).toThrow();
  });
});

describe("status normalization", () => {
  it("maps Stripe PI statuses to our PaymentStatus", () => {
    expect(normalizePaymentStatus("succeeded")).toBe("settled");
    expect(normalizePaymentStatus("processing")).toBe("processing");
    expect(normalizePaymentStatus("requires_action")).toBe("requires_action");
    expect(normalizePaymentStatus("requires_capture")).toBe("requires_action");
    expect(normalizePaymentStatus("requires_payment_method")).toBe("requires_payment_method");
    expect(normalizePaymentStatus("canceled")).toBe("canceled");
  });

  it("treats unknown/empty PI status as failed (never optimistically paid)", () => {
    expect(normalizePaymentStatus(undefined)).toBe("failed");
    expect(normalizePaymentStatus("weird_new_status")).toBe("failed");
  });

  it("maps refund statuses", () => {
    expect(normalizeRefundStatus("succeeded")).toBe("succeeded");
    expect(normalizeRefundStatus("pending")).toBe("pending");
    expect(normalizeRefundStatus("canceled")).toBe("canceled");
    expect(normalizeRefundStatus(undefined)).toBe("failed");
  });
});

describe("referenceFromMetadata", () => {
  it("resolves a complete reference", () => {
    expect(referenceFromMetadata({ tenant_id: "t-1", invoice_id: "inv-1" })).toEqual(REF);
  });
  it("returns null when either id is missing/blank", () => {
    expect(referenceFromMetadata({ tenant_id: "t-1" })).toBeNull();
    expect(referenceFromMetadata({ tenant_id: "t-1", invoice_id: "  " })).toBeNull();
    expect(referenceFromMetadata(undefined)).toBeNull();
  });
});

describe("wire → domain", () => {
  it("maps a PaymentIntent (cents passthrough, uppercased currency)", () => {
    const out = fromPaymentIntent({
      id: "pi_1",
      status: "succeeded",
      amount: 6000,
      currency: "eur",
      client_secret: "pi_1_secret",
      metadata: { tenant_id: "t-1", invoice_id: "inv-1" },
    });
    expect(out).toEqual({
      id: "pi_1",
      status: "settled",
      amountCents: 6000,
      currency: "EUR",
      reference: REF,
      clientSecret: "pi_1_secret",
    });
  });

  it("maps a Refund", () => {
    const out = fromRefund({ id: "re_1", status: "succeeded", amount: 6000, currency: "eur", payment_intent: "pi_1" });
    expect(out).toEqual({
      id: "re_1",
      paymentIntentId: "pi_1",
      status: "succeeded",
      amountCents: 6000,
      currency: "EUR",
    });
  });
});
