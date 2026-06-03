import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IfThenPayClient, type FetchLike } from "./client";
import { IfThenPayApiError, IfThenPayConfigError } from "./errors";
import { generateMultibancoReference } from "./multibanco";
import { SAMPLE_MULTIBANCO_INPUT } from "./fixtures";

function mockFetch(status: number, body: unknown) {
  return vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }));
}

let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env.IFTHENPAY_MB_KEY;
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.IFTHENPAY_MB_KEY;
  else process.env.IFTHENPAY_MB_KEY = savedKey;
});

describe("owner gate", () => {
  it("throws a config error BEFORE any fetch when the MB key is unset", async () => {
    delete process.env.IFTHENPAY_MB_KEY;
    const fetchImpl = mockFetch(200, {});
    const client = new IfThenPayClient({ baseUrl: "https://x.test", fetchImpl });
    await expect(
      generateMultibancoReference(client, SAMPLE_MULTIBANCO_INPUT),
    ).rejects.toBeInstanceOf(IfThenPayConfigError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("generateMultibancoReference (key set)", () => {
  beforeEach(() => {
    process.env.IFTHENPAY_MB_KEY = "mb-test";
  });

  it("sends the key + amount in the body and maps the reference back", async () => {
    const fetchImpl = mockFetch(200, {
      Entity: "12345",
      Reference: "123456789",
      Amount: "60.00",
      OrderId: SAMPLE_MULTIBANCO_INPUT.orderId,
      RequestId: "req-9",
      ExpiryDate: "2026-06-05",
      Status: "0",
    });
    const client = new IfThenPayClient({ baseUrl: "https://x.test", fetchImpl });

    const ref = await generateMultibancoReference(client, SAMPLE_MULTIBANCO_INPUT);

    const body = JSON.parse(fetchImpl.mock.calls[0][1]!.body!);
    expect(body.mbKey).toBe("mb-test");
    expect(body.amount).toBe("60.00"); // integer cents → wire decimal
    expect(body.orderId).toBe(SAMPLE_MULTIBANCO_INPUT.orderId);

    expect(ref).toMatchObject({
      entity: "12345",
      reference: "123456789",
      amountCents: 6000,
      requestId: "req-9",
      expiresAt: "2026-06-05",
    });
  });

  it("rejects a non-positive amount without hitting the network", async () => {
    const fetchImpl = mockFetch(200, {});
    const client = new IfThenPayClient({ baseUrl: "https://x.test", fetchImpl });
    await expect(
      generateMultibancoReference(client, { ...SAMPLE_MULTIBANCO_INPUT, amountCents: 0 }),
    ).rejects.toBeInstanceOf(IfThenPayApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats a 2xx without entity/reference as a gateway error (no Message leak)", async () => {
    const fetchImpl = mockFetch(200, { Status: "9", Message: "Consulta 351#912345678" });
    const client = new IfThenPayClient({ baseUrl: "https://x.test", fetchImpl });
    const err = await generateMultibancoReference(client, SAMPLE_MULTIBANCO_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(IfThenPayApiError);
    expect(err.message).not.toContain("912345678");
  });
});
