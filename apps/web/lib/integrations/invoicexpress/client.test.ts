import { describe, expect, it, vi } from "vitest";
import {
  InvoiceXpressClient,
  _redactKeyForTest,
  type FetchLike,
} from "./client";
import {
  InvoiceXpressApiError,
  InvoiceXpressNetworkError,
} from "./errors";

const CREDS = { accountName: "osteojp", apiKey: "secret-key-123" };

/** Build a mock fetch returning a fixed status/body, capturing the call. */
function mockFetch(status: number, body: string) {
  const fn = vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }));
  return fn;
}

describe("URL + auth", () => {
  it("puts api_key in the query and keeps fiscal data in the body only", async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({ ok: true }));
    const client = new InvoiceXpressClient({ credentials: CREDS, fetchImpl });

    await client.request({
      method: "POST",
      path: "/invoice_receipts.json",
      body: { invoice_receipt: { client: { fiscal_id: "123456789" } } },
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://osteojp.app.invoicexpress.com/invoice_receipts.json?api_key=secret-key-123",
    );
    // Fiscal data is in the body, never the URL.
    expect(url).not.toContain("123456789");
    expect(init?.body).toContain("123456789");
    expect(init?.method).toBe("POST");
  });

  it("appends non-fiscal query params alongside the key", async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({}));
    const client = new InvoiceXpressClient({ credentials: CREDS, fetchImpl });
    await client.request({
      method: "GET",
      path: "/invoice_receipts.json",
      query: { page: 2, status: "final", text: undefined },
    });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toContain("page=2");
    expect(url).toContain("status=final");
    expect(url).not.toContain("text="); // undefined is dropped
  });
});

describe("response handling + error taxonomy", () => {
  it("parses a JSON 2xx body", async () => {
    const client = new InvoiceXpressClient({
      credentials: CREDS,
      fetchImpl: mockFetch(200, JSON.stringify({ invoice_receipt: { id: 7 } })),
    });
    const res = await client.request<{ invoice_receipt: { id: number } }>({
      method: "GET",
      path: "/invoice_receipts/7.json",
    });
    expect(res.invoice_receipt.id).toBe(7);
  });

  it("returns undefined on an empty 2xx (e.g. 204 change-state)", async () => {
    const client = new InvoiceXpressClient({
      credentials: CREDS,
      fetchImpl: mockFetch(200, ""),
    });
    const res = await client.request({ method: "PUT", path: "/x.json" });
    expect(res).toBeUndefined();
  });

  it("maps a 4xx to a NON-retryable InvoiceXpressApiError", async () => {
    const client = new InvoiceXpressClient({
      credentials: CREDS,
      // body echoes fiscal data — must NOT surface in the error.
      fetchImpl: mockFetch(422, JSON.stringify({ errors: { fiscal_id: "123456789 invalid" } })),
    });
    await expect(
      client.request({ method: "POST", path: "/invoice_receipts.json" }),
    ).rejects.toMatchObject({ status: 422, retryable: false });
  });

  it("maps 429 and 5xx to RETRYABLE errors", async () => {
    for (const status of [429, 500, 503]) {
      const client = new InvoiceXpressClient({
        credentials: CREDS,
        fetchImpl: mockFetch(status, "rate/again"),
      });
      await expect(
        client.request({ method: "GET", path: "/invoice_receipts.json" }),
      ).rejects.toMatchObject({ status, retryable: true });
    }
  });

  it("maps a transport failure to a retryable network error", async () => {
    const client = new InvoiceXpressClient({
      credentials: CREDS,
      fetchImpl: vi.fn<FetchLike>(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    const err = (await client
      .request({ method: "GET", path: "/x.json" })
      .catch((e) => e)) as InvoiceXpressNetworkError;
    expect(err).toBeInstanceOf(InvoiceXpressNetworkError);
    expect(err.retryable).toBe(true);
  });

  it("never leaks the api_key or fiscal data in the API error message", async () => {
    const client = new InvoiceXpressClient({
      credentials: CREDS,
      fetchImpl: mockFetch(400, JSON.stringify({ nif: "123456789", name: "Maria Silva" })),
    });
    const err = (await client
      .request({ method: "POST", path: "/invoice_receipts.json" })
      .catch((e) => e)) as InvoiceXpressApiError;
    expect(err.message).not.toContain("secret-key-123");
    expect(err.message).not.toContain("123456789");
    expect(err.message).not.toContain("Maria Silva");
    expect(err.message).toContain("400");
  });

  it("raises a parse error on malformed 2xx JSON", async () => {
    const client = new InvoiceXpressClient({
      credentials: CREDS,
      fetchImpl: mockFetch(200, "{not json"),
    });
    await expect(
      client.request({ method: "GET", path: "/x.json" }),
    ).rejects.toBeInstanceOf(InvoiceXpressApiError);
  });
});

describe("redactKey", () => {
  it("redacts the api_key in any string", () => {
    expect(_redactKeyForTest("https://x/y?api_key=abc&page=1")).toBe(
      "https://x/y?api_key=[redacted]&page=1",
    );
  });
});
