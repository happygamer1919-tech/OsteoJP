import { describe, expect, it, vi } from "vitest";
import { IfThenPayClient, redactSecrets, type FetchLike } from "./client";
import { IfThenPayApiError, IfThenPayNetworkError } from "./errors";

const BASE = "https://sandbox.ifthenpay.test";

/** Build a mock fetch returning a fixed status/body, capturing the call. */
function mockFetch(status: number, body: string) {
  return vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }));
}

describe("URL + body", () => {
  it("posts to base+path with no secrets in the URL (keys live in the body)", async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({ ok: true }));
    const client = new IfThenPayClient({ baseUrl: BASE, fetchImpl });

    await client.request({
      method: "POST",
      path: "/spg/payment/mbway",
      body: { mbWayKey: "secret-key-9", mobileNumber: "351#912345678" },
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/spg/payment/mbway`);
    // The key + payer phone are in the body, never the URL.
    expect(url).not.toContain("secret-key-9");
    expect(url).not.toContain("912345678");
    expect(init?.body).toContain("secret-key-9");
    expect(init?.method).toBe("POST");
  });

  it("strips a trailing slash from the base url", async () => {
    const fetchImpl = mockFetch(200, "{}");
    const client = new IfThenPayClient({ baseUrl: `${BASE}/`, fetchImpl });
    await client.request({ method: "GET", path: "/x" });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/x`);
  });
});

describe("response handling + error taxonomy", () => {
  it("parses a JSON 2xx body", async () => {
    const client = new IfThenPayClient({
      baseUrl: BASE,
      fetchImpl: mockFetch(200, JSON.stringify({ Entity: "12345" })),
    });
    const res = await client.request<{ Entity: string }>({ method: "POST", path: "/x" });
    expect(res.Entity).toBe("12345");
  });

  it("returns undefined on an empty 2xx", async () => {
    const client = new IfThenPayClient({ baseUrl: BASE, fetchImpl: mockFetch(200, "") });
    expect(await client.request({ method: "GET", path: "/x" })).toBeUndefined();
  });

  it("maps a 4xx to a NON-retryable error and drops the body", async () => {
    const client = new IfThenPayClient({
      baseUrl: BASE,
      // body echoes payer contact — must NOT surface in the error.
      fetchImpl: mockFetch(400, JSON.stringify({ mobileNumber: "351#912345678" })),
    });
    const err = (await client
      .request({ method: "POST", path: "/spg/payment/mbway" })
      .catch((e) => e)) as IfThenPayApiError;
    expect(err).toMatchObject({ status: 400, retryable: false });
    expect(err.message).not.toContain("912345678");
    expect(err.message).toContain("400");
  });

  it("maps 429 and 5xx to RETRYABLE errors", async () => {
    for (const status of [429, 500, 503]) {
      const client = new IfThenPayClient({ baseUrl: BASE, fetchImpl: mockFetch(status, "x") });
      await expect(client.request({ method: "GET", path: "/x" })).rejects.toMatchObject({
        status,
        retryable: true,
      });
    }
  });

  it("maps a transport failure to a retryable network error", async () => {
    const client = new IfThenPayClient({
      baseUrl: BASE,
      fetchImpl: vi.fn<FetchLike>(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    const err = (await client
      .request({ method: "GET", path: "/x" })
      .catch((e) => e)) as IfThenPayNetworkError;
    expect(err).toBeInstanceOf(IfThenPayNetworkError);
    expect(err.retryable).toBe(true);
  });

  it("raises a parse error on malformed 2xx JSON", async () => {
    const client = new IfThenPayClient({ baseUrl: BASE, fetchImpl: mockFetch(200, "{not json") });
    await expect(client.request({ method: "GET", path: "/x" })).rejects.toBeInstanceOf(
      IfThenPayApiError,
    );
  });
});

describe("redactSecrets", () => {
  it("redacts known key fields in any string", () => {
    expect(redactSecrets('{"mbWayKey":"abc","amount":"60.00"}')).toBe(
      '{"mbWayKey":"[redacted]","amount":"60.00"}',
    );
    expect(redactSecrets('{"key":"anti-1"}')).toContain("[redacted]");
  });
});
