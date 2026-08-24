import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-web-surface-limiter-adoption, route 4: the Stripe webhook receiver.
 *
 * Same shape and same risks as route 3, which is why the two shipped together:
 * an HMAC over the raw body, so nothing is guessable and the limit bounds COST;
 * and `await req.text()` reading an arbitrary-size body before any check, so
 * the limiter must sit ABOVE the read rather than merely above the verify.
 *
 * ONE THING IS DIFFERENT AND IT IS ASSERTED SEPARATELY: the refusal status.
 * Stripe redelivers on any non-2xx, and the handler already acknowledges
 * unhandled event types with a 200 to STOP redelivery. A 429 must not be
 * confused with that path, or a throttled real event would be acknowledged and
 * never resent.
 */

const seq: string[] = [];

const checkRateLimit = vi.fn<(key: string, rule: { limit: number }) => {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}>();
const constructEvent = vi.fn();
const send = vi.fn();

vi.mock("@osteojp/rate-limit", async (orig) => {
  const real = await orig<typeof import("@osteojp/rate-limit")>();
  return { ...real, checkRateLimit };
});
vi.mock("@/lib/integrations/stripe/webhook", () => ({ constructEvent }));
vi.mock("@/lib/integrations/stripe/mapper", () => ({
  referenceFromMetadata: () => ({ tenantId: "t", invoiceId: "i" }),
}));
vi.mock("@/lib/integrations/stripe/inngest/client", () => ({
  inngest: { send },
  EVENT_STRIPE_WEBHOOK_RECEIVED: "stripe/webhook.received",
}));
vi.mock("@/lib/integrations/stripe/errors", () => ({
  StripeError: class StripeError extends Error {},
}));

const request = (ip = "203.0.113.7") => {
  const req = new Request("https://app.osteojp.pt/api/v1/integrations/stripe/webhook", {
    method: "POST",
    body: "{}",
    headers: { "x-forwarded-for": ip },
  });
  Object.defineProperty(req, "text", {
    value: async () => {
      seq.push("read-body");
      return "{}";
    },
  });
  return req;
};

const verdict = (ok: boolean) => {
  checkRateLimit.mockImplementation(() => {
    seq.push("limiter");
    return { ok, limit: 120, remaining: ok ? 119 : 0, retryAfterSeconds: 60 };
  });
};

describe("the Stripe webhook receiver is rate limited", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seq.length = 0;
    constructEvent.mockImplementation(() => {
      seq.push("verify");
      return {
        id: "evt_1",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_1", metadata: {} } },
      };
    });
    send.mockImplementation(async () => {
      seq.push("enqueue");
    });
  });

  it("limits ABOVE the body read, not merely above the signature check", async () => {
    const { POST } = await import("./route");
    verdict(true);
    await POST(request());
    expect(seq).toEqual(["limiter", "read-body", "verify", "enqueue"]);
  });

  it("over the limit, the body is NEVER read", async () => {
    const { POST } = await import("./route");
    verdict(false);
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(seq).toEqual(["limiter"]);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("refuses with a status Stripe REDELIVERS on, not the 200 it stops on", async () => {
    // The handler already answers 200 to unhandled event types precisely to
    // stop redelivery. A throttled REAL event must not take that path.
    const { POST } = await import("./route");
    verdict(false);
    const res = await POST(request());
    expect(res.status).not.toBe(200);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("keys per source", async () => {
    const { POST } = await import("./route");
    verdict(true);
    await POST(request("203.0.113.7"));
    const first = String(checkRateLimit.mock.calls[0][0]);
    vi.clearAllMocks();
    seq.length = 0;
    verdict(true);
    await POST(request("198.51.100.4"));
    expect(String(checkRateLimit.mock.calls[0][0])).not.toBe(first);
    expect(first).toContain("stripe_webhook:ip:");
  });

  it("uses the SYNCHRONOUS memory store, never the durable one", async () => {
    // Source guard, labelled as one: it proves the durable store is not wired
    // in, not that the memory store counts.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("createDurableRateLimitStore");
    expect(code).not.toContain("checkDurableRateLimit");
    expect(code).toContain("checkRateLimit");
  });

  it("lets a legitimate signed event through untouched", async () => {
    const { POST } = await import("./route");
    verdict(true);
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
