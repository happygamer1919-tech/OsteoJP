import { describe, expect, it, vi } from "vitest";
import { StripeClient, type FetchLike } from "./client";
import {
  confirmPaymentIntent,
  createPaymentIntent,
  refundPayment,
  retrievePaymentIntent,
} from "./operations";

const CREDS = { secretKey: "sk_test_x" };
const REF = { tenantId: "t-1", invoiceId: "inv-1" };

/** Mock fetch that records calls and returns a fixed JSON 2xx body. */
function jsonClient(body: unknown) {
  const fetchImpl = vi.fn<FetchLike>(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  }));
  return { client: new StripeClient({ credentials: CREDS, fetchImpl }), fetchImpl };
}

describe("createPaymentIntent", () => {
  it("POSTs an EUR card intent with a default idempotency key and the reference", async () => {
    const { client, fetchImpl } = jsonClient({
      id: "pi_1",
      status: "requires_confirmation",
      amount: 6000,
      currency: "eur",
      client_secret: "pi_1_secret",
      metadata: { tenant_id: "t-1", invoice_id: "inv-1" },
    });

    const res = await createPaymentIntent(client, { reference: REF, amountCents: 6000 });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/payment_intents");
    expect(init?.method).toBe("POST");
    expect(init?.headers?.["Idempotency-Key"]).toBe("pi-create:inv-1");
    expect(init?.body).toContain("currency=eur");
    expect(res.id).toBe("pi_1");
    expect(res.status).toBe("requires_confirmation");
    expect(res.reference).toEqual(REF);
  });

  it("never puts the amount or reference in the URL (only the body)", async () => {
    const { client, fetchImpl } = jsonClient({ id: "pi_1" });
    await createPaymentIntent(client, { reference: REF, amountCents: 6000 });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).not.toContain("6000");
    expect(url).not.toContain("inv-1");
  });
});

describe("confirmPaymentIntent", () => {
  it("POSTs to the confirm sub-path with the payment method token", async () => {
    const { client, fetchImpl } = jsonClient({ id: "pi_1", status: "succeeded" });
    const res = await confirmPaymentIntent(client, {
      paymentIntentId: "pi_1",
      paymentMethodId: "pm_card_visa",
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/payment_intents/pi_1/confirm");
    expect(init?.body).toContain("payment_method=pm_card_visa");
    expect(res.status).toBe("settled");
  });
});

describe("retrievePaymentIntent", () => {
  it("GETs the intent by id (authoritative read)", async () => {
    const { client, fetchImpl } = jsonClient({
      id: "pi_1",
      status: "succeeded",
      amount: 6000,
      metadata: { tenant_id: "t-1", invoice_id: "inv-1" },
    });
    const res = await retrievePaymentIntent(client, "pi_1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(init?.method).toBe("GET");
    expect(url).toContain("/payment_intents/pi_1");
    expect(res.status).toBe("settled");
    expect(res.reference).toEqual(REF);
  });
});

describe("refundPayment", () => {
  it("POSTs a refund with a default idempotency key", async () => {
    const { client, fetchImpl } = jsonClient({
      id: "re_1",
      status: "succeeded",
      amount: 6000,
      payment_intent: "pi_1",
    });
    const res = await refundPayment(client, { paymentIntentId: "pi_1", reason: "requested_by_customer" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/refunds");
    expect(init?.headers?.["Idempotency-Key"]).toBe("refund:pi_1");
    expect(init?.body).toContain("payment_intent=pi_1");
    expect(init?.body).toContain("reason=requested_by_customer");
    expect(res.status).toBe("succeeded");
  });

  it("supports a partial refund amount", async () => {
    const { client, fetchImpl } = jsonClient({ id: "re_1", status: "succeeded", amount: 2000, payment_intent: "pi_1" });
    const res = await refundPayment(client, { paymentIntentId: "pi_1", amountCents: 2000 });
    expect(fetchImpl.mock.calls[0][1]?.body).toContain("amount=2000");
    expect(res.amountCents).toBe(2000);
  });

  it("rejects a non-positive refund amount before any call", async () => {
    const { client, fetchImpl } = jsonClient({});
    await expect(refundPayment(client, { paymentIntentId: "pi_1", amountCents: 0 })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
