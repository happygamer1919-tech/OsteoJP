import { describe, expect, it, vi } from "vitest";
import { StripeClient, encodeForm, type FetchLike } from "./client";
import { StripeApiError, StripeNetworkError } from "./errors";

const CREDS = { secretKey: "sk_test_secret_123" };

/** Build a mock fetch returning a fixed status/body, capturing the call. */
function mockFetch(status: number, body: string) {
  const fn = vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }));
  return fn;
}

describe("encodeForm", () => {
  it("encodes flat + nested params with Stripe bracket nesting", () => {
    const out = encodeForm({
      amount: 6000,
      currency: "eur",
      confirm: true,
      metadata: { invoice_id: "inv-1", tenant_id: "t-1" },
      skip: undefined,
    });
    expect(out).toContain("amount=6000");
    expect(out).toContain("currency=eur");
    expect(out).toContain("confirm=true");
    expect(out).toContain("metadata%5Binvoice_id%5D=inv-1");
    expect(out).not.toContain("skip"); // undefined dropped
  });
});

describe("auth + transport", () => {
  it("sends the secret key in the Authorization header, never the URL", async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({ id: "pi_1" }));
    const client = new StripeClient({ credentials: CREDS, fetchImpl });

    await client.request({
      method: "POST",
      path: "/payment_intents",
      form: { amount: 6000, currency: "eur" },
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    expect(url).not.toContain("sk_test"); // key is NOT in the URL
    expect(init?.headers?.Authorization).toBe("Bearer sk_test_secret_123");
    expect(init?.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init?.body).toContain("amount=6000");
  });

  it("passes the Idempotency-Key header when provided", async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({}));
    const client = new StripeClient({ credentials: CREDS, fetchImpl });
    await client.request({
      method: "POST",
      path: "/refunds",
      form: { payment_intent: "pi_1" },
      idempotencyKey: "refund:pi_1",
    });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init?.headers?.["Idempotency-Key"]).toBe("refund:pi_1");
  });
});

describe("response handling + error taxonomy", () => {
  it("parses a JSON 2xx body", async () => {
    const client = new StripeClient({
      credentials: CREDS,
      fetchImpl: mockFetch(200, JSON.stringify({ id: "pi_7", status: "succeeded" })),
    });
    const res = await client.request<{ id: string; status: string }>({
      method: "GET",
      path: "/payment_intents/pi_7",
    });
    expect(res.id).toBe("pi_7");
  });

  it("maps a 4xx (card_declined) to a NON-retryable StripeApiError carrying the code", async () => {
    const client = new StripeClient({
      credentials: CREDS,
      fetchImpl: mockFetch(
        402,
        JSON.stringify({ error: { code: "card_declined", message: "Your card was declined." } }),
      ),
    });
    const err = (await client
      .request({ method: "POST", path: "/payment_intents" })
      .catch((e) => e)) as StripeApiError;
    expect(err).toBeInstanceOf(StripeApiError);
    expect(err.status).toBe(402);
    expect(err.retryable).toBe(false);
    expect(err.code).toBe("card_declined");
  });

  it("maps 409, 429 and 5xx to RETRYABLE errors", async () => {
    for (const status of [409, 429, 500, 503]) {
      const client = new StripeClient({
        credentials: CREDS,
        fetchImpl: mockFetch(status, JSON.stringify({ error: { code: "lock_timeout" } })),
      });
      await expect(
        client.request({ method: "GET", path: "/payment_intents/pi_1" }),
      ).rejects.toMatchObject({ status, retryable: true });
    }
  });

  it("maps a transport failure to a retryable network error", async () => {
    const client = new StripeClient({
      credentials: CREDS,
      fetchImpl: vi.fn<FetchLike>(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    const err = (await client
      .request({ method: "GET", path: "/x" })
      .catch((e) => e)) as StripeNetworkError;
    expect(err).toBeInstanceOf(StripeNetworkError);
    expect(err.retryable).toBe(true);
  });

  it("never leaks the secret key, the Stripe human message, or payment data in the error", async () => {
    const client = new StripeClient({
      credentials: CREDS,
      fetchImpl: mockFetch(
        400,
        JSON.stringify({
          error: {
            code: "amount_too_large",
            message: "Amount 99999 for maria.silva@example.pt is too large",
          },
        }),
      ),
    });
    const err = (await client
      .request({ method: "POST", path: "/payment_intents" })
      .catch((e) => e)) as StripeApiError;
    expect(err.message).not.toContain("sk_test_secret_123");
    expect(err.message).not.toContain("maria.silva@example.pt");
    expect(err.message).not.toContain("99999");
    expect(err.message).toContain("400");
    expect(err.message).toContain("amount_too_large"); // machine code is OK
  });

  it("returns undefined on an empty 2xx", async () => {
    const client = new StripeClient({ credentials: CREDS, fetchImpl: mockFetch(200, "") });
    expect(await client.request({ method: "GET", path: "/x" })).toBeUndefined();
  });

  it("raises a parse error on malformed 2xx JSON", async () => {
    const client = new StripeClient({ credentials: CREDS, fetchImpl: mockFetch(200, "{nope") });
    await expect(client.request({ method: "GET", path: "/x" })).rejects.toBeInstanceOf(
      StripeApiError,
    );
  });
});
