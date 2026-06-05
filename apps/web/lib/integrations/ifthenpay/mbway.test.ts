import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IfThenPayClient, type FetchLike } from "./client";
import { IfThenPayApiError, IfThenPayConfigError } from "./errors";
import { requestMbWayPayment } from "./mbway";
import { SAMPLE_MBWAY_INPUT } from "./fixtures";

function mockFetch(status: number, body: unknown) {
  return vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }));
}

let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env.IFTHENPAY_MBWAY_KEY;
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.IFTHENPAY_MBWAY_KEY;
  else process.env.IFTHENPAY_MBWAY_KEY = savedKey;
});

describe("owner gate", () => {
  it("throws a config error BEFORE any fetch when the MB Way key is unset", async () => {
    delete process.env.IFTHENPAY_MBWAY_KEY;
    const fetchImpl = mockFetch(200, {});
    const client = new IfThenPayClient({ baseUrl: "https://x.test", fetchImpl });
    await expect(requestMbWayPayment(client, SAMPLE_MBWAY_INPUT)).rejects.toBeInstanceOf(
      IfThenPayConfigError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("requestMbWayPayment (key set)", () => {
  beforeEach(() => {
    process.env.IFTHENPAY_MBWAY_KEY = "mbway-test";
  });

  it("puts the key + payer phone in the body only and maps an accepted request", async () => {
    const fetchImpl = mockFetch(200, {
      OrderId: SAMPLE_MBWAY_INPUT.orderId,
      RequestId: "req-mbw-1",
      Amount: "60.00",
      Status: "000",
      Message: "Pending",
    });
    const client = new IfThenPayClient({ baseUrl: "https://x.test", fetchImpl });

    const out = await requestMbWayPayment(client, SAMPLE_MBWAY_INPUT);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).not.toContain("912345678"); // phone never in the URL
    const body = JSON.parse(init!.body!);
    expect(body.mbWayKey).toBe("mbway-test");
    expect(body.mobileNumber).toBe(SAMPLE_MBWAY_INPUT.mobileNumber);
    expect(body.amount).toBe("60.00");

    expect(out).toMatchObject({
      orderId: SAMPLE_MBWAY_INPUT.orderId,
      requestId: "req-mbw-1",
      statusCode: "000",
      status: "pending",
    });
  });

  it("rejects a missing mobile number without hitting the network", async () => {
    const fetchImpl = mockFetch(200, {});
    const client = new IfThenPayClient({ baseUrl: "https://x.test", fetchImpl });
    await expect(
      requestMbWayPayment(client, { ...SAMPLE_MBWAY_INPUT, mobileNumber: "" }),
    ).rejects.toBeInstanceOf(IfThenPayApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats a non-000 status as a gateway error (no Message leak)", async () => {
    const fetchImpl = mockFetch(200, { Status: "122", Message: "351#912345678 invalid" });
    const client = new IfThenPayClient({ baseUrl: "https://x.test", fetchImpl });
    const err = await requestMbWayPayment(client, SAMPLE_MBWAY_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(IfThenPayApiError);
    expect(err.message).not.toContain("912345678");
  });
});
