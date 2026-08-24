import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-web-surface-limiter-adoption, route 2: the IfThenPay payment callback.
 *
 * ==========================================================================
 * THE SUBJECT IS THE WIRING, NOT "IT COUNTS"
 * ==========================================================================
 * That the limiter counts is `@osteojp/rate-limit`'s own suite. What can go
 * wrong HERE is specific to this route and each case below names one:
 *
 *   - limiting AFTER `authenticateCallback` — the budget being spent is the
 *     GUESS budget, so a limit taken afterwards counts only guesses that have
 *     already happened;
 *   - putting the ANTI-PHISHING KEY in the bucket key — it arrives in the query
 *     string, and a bucket key lives in a durable Postgres table. That would
 *     write the shared secret to disk in a table nothing treats as secret;
 *   - one shared bucket for every caller — a constant key throttles IfThenPay
 *     itself on an attacker's traffic, and is the outage switch the rule's own
 *     note refuses;
 *   - refusing with a 200 — IfThenPay reads any non-200 as "redeliver", so the
 *     status is what makes a throttled settlement DELAYED rather than LOST.
 */

/**
 * ONE SHARED SEQUENCE, because "both were called" is not "one was called
 * FIRST". The order assertion below was originally written as two call counts
 * and it stayed GREEN under the negative control that moved the limiter after
 * the key comparison - which is the entire defect it is meant to catch. Every
 * participant appends to this, so order is observed rather than assumed.
 */
const seq: string[] = [];

/**
 * TYPED BY ITS SIGNATURE, not inferred from the stub body. An implementation
 * taking no arguments infers `calls` as an empty tuple, and every
 * `calls[0][0]` below then fails to typecheck - which is how this was caught.
 */
const hit = vi.fn<(key: string, windowMs: number) => Promise<{ count: number; resetAt: Date }>>(
  async () => {
    seq.push("limiter");
    return { count: 1, resetAt: new Date(Date.now() + 60_000) };
  },
);
const authenticateCallback = vi.fn(() => {
  seq.push("auth");
});
const send = vi.fn(() => {
  seq.push("enqueue");
});

vi.mock("@osteojp/rate-limit", async (orig) => {
  const real = await orig<typeof import("@osteojp/rate-limit")>();
  return { ...real, createDurableRateLimitStore: () => ({ hit }) };
});
vi.mock("@/lib/integrations/ifthenpay/callback", () => ({ authenticateCallback }));
vi.mock("@/lib/integrations/ifthenpay/inngest/client", () => ({
  inngest: { send },
  EVENT_PAYMENT_CALLBACK_RECEIVED: "ifthenpay/callback.received",
}));

const SECRET = "the-anti-phishing-key-value";

/** A callback shaped like a real one: the shared secret is in the query string. */
const request = (ip = "203.0.113.7") =>
  new Request(
    `https://app.osteojp.pt/api/webhooks/ifthenpay?key=${SECRET}&orderId=INV-1&amount=42.50`,
    { headers: { "x-forwarded-for": ip } },
  );

/** count -> the store's answer, so a case can drive the verdict directly. */
const counting = (n: number) =>
  hit.mockImplementation(async () => {
    seq.push("limiter");
    return { count: n, resetAt: new Date(Date.now() + 60_000) };
  });

describe("the IfThenPay callback is rate limited", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seq.length = 0;
    authenticateCallback.mockImplementation(() => {
      seq.push("auth");
      return {
        orderId: "INV-1",
        amountCents: 4250,
        method: "multibanco",
        requestId: null,
        paidAt: null,
      };
    });
    send.mockImplementation(async () => {
      seq.push("enqueue");
    });
  });

  it("checks BOTH windows BEFORE the anti-phishing key is compared", async () => {
    // The limit is on the GUESS budget. Taken after the comparison it would
    // count only the guesses that already landed.
    const { GET } = await import("./route");
    counting(1);
    await GET(request());
    // ORDER, not counts. Two counts pass just as happily with the limiter
    // moved below the comparison, which is the defect this case exists for.
    expect(seq).toEqual(["limiter", "limiter", "auth", "enqueue"]);
    const [minuteKey, hourKey] = hit.mock.calls.map((c) => String(c[0]));
    expect(minuteKey).toContain("ifthenpay_callback:ip:");
    expect(hourKey).toContain("ifthenpay_callback_hour:ip:");
  });

  it("refuses over the limit WITHOUT comparing the key at all", async () => {
    const { GET } = await import("./route");
    counting(99);
    const res = await GET(request());
    expect(res.status).toBe(429);
    expect(authenticateCallback).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("stops at the MINUTE window without spending the hour window", async () => {
    // Ordering matters for what an operator reads out of the store afterwards:
    // the tighter window should be the one that names the refusal.
    const { GET } = await import("./route");
    counting(99);
    await GET(request());
    expect(hit).toHaveBeenCalledTimes(1);
    expect(String(hit.mock.calls[0][0])).toContain("ifthenpay_callback:ip:");
  });

  it("NEVER puts the anti-phishing key in a bucket key", async () => {
    // It arrives in the query string and bucket keys live in a durable table.
    // Keying on it would write the shared secret to disk, and would also hand
    // an attacker a fresh budget for every wrong guess.
    const { GET } = await import("./route");
    counting(1);
    await GET(request());
    const keys = hit.mock.calls.map((c) => String(c[0])).join(" ");
    expect(keys).not.toContain(SECRET);
    expect(keys).not.toContain("anti-phishing");
  });

  it("gives two different sources two different buckets", async () => {
    // A constant key would be a global ceiling by accident: an attacker's
    // traffic would throttle IfThenPay's real settlements. The rule refuses a
    // global ceiling on this route on purpose.
    const { GET } = await import("./route");
    counting(1);
    await GET(request("203.0.113.7"));
    const first = String(hit.mock.calls[0][0]);
    vi.clearAllMocks();
    counting(1);
    await GET(request("198.51.100.4"));
    expect(String(hit.mock.calls[0][0])).not.toBe(first);
  });

  it("refuses with a status IfThenPay redelivers on, and says when", async () => {
    // Non-200 is the redelivery signal. This is what makes a throttled real
    // settlement DELAYED rather than LOST.
    const { GET } = await import("./route");
    counting(99);
    const res = await GET(request());
    expect(res.status).not.toBe(200);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("lets a legitimate callback through untouched", async () => {
    // The positive control. Every assertion above is of the form "this did NOT
    // happen", and a suite of only those passes perfectly over a handler that
    // refuses everything.
    const { GET } = await import("./route");
    counting(1);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
