import { describe, expect, it, beforeEach } from "vitest";
import {
  RULES,
  checkRateLimit,
  clientKey,
  createMemoryStore,
  tooManyRequests,
  type RateLimitStore,
} from "./limiter";

// Rate limiter unit tests (SEC-04). Pure and deterministic: `now` is injected
// rather than read from the clock, so nothing here sleeps or flakes.

let store: RateLimitStore;

beforeEach(() => {
  store = createMemoryStore();
});

const req = (ip?: string) =>
  new Request("https://api.example.test/x", {
    headers: ip ? { "x-forwarded-for": ip } : {},
  });

describe("checkRateLimit", () => {
  it("permits exactly `limit` requests then refuses the next one", () => {
    const rule = { limit: 3, windowMs: 60_000 };
    const now = 1_000_000;

    expect(checkRateLimit("k", rule, store, now).ok).toBe(true);
    expect(checkRateLimit("k", rule, store, now).ok).toBe(true);
    const last = checkRateLimit("k", rule, store, now);
    expect(last.ok).toBe(true);
    expect(last.remaining).toBe(0);

    const refused = checkRateLimit("k", rule, store, now);
    expect(refused.ok).toBe(false);
    expect(refused.remaining).toBe(0);
  });

  it("reports a Retry-After that shrinks as the window elapses", () => {
    const rule = { limit: 1, windowMs: 60_000 };
    checkRateLimit("k", rule, store, 0);
    expect(checkRateLimit("k", rule, store, 0).retryAfterSeconds).toBe(60);
    expect(checkRateLimit("k", rule, store, 30_000).retryAfterSeconds).toBe(30);
  });

  it("lets the caller through again once the window rolls over", () => {
    const rule = { limit: 2, windowMs: 60_000 };
    checkRateLimit("k", rule, store, 0);
    checkRateLimit("k", rule, store, 0);
    expect(checkRateLimit("k", rule, store, 0).ok).toBe(false);

    // One millisecond past the window boundary the counter is fresh.
    expect(checkRateLimit("k", rule, store, 60_001).ok).toBe(true);
  });

  it("counts each key independently", () => {
    const rule = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit("a", rule, store, 0).ok).toBe(true);
    expect(checkRateLimit("b", rule, store, 0).ok).toBe(true);
    expect(checkRateLimit("a", rule, store, 0).ok).toBe(false);
  });
});

describe("the configured thresholds return 429", () => {
  it("refuses the 31st auth-session request in a minute", () => {
    const key = "auth-session:ip:203.0.113.7";
    for (let i = 0; i < RULES.authSession.limit; i++) {
      expect(checkRateLimit(key, RULES.authSession, store, 0).ok).toBe(true);
    }
    const verdict = checkRateLimit(key, RULES.authSession, store, 0);
    expect(verdict.ok).toBe(false);

    const res = tooManyRequests(verdict);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(res.headers.get("x-ratelimit-limit")).toBe("30");
  });

  it("refuses the 11th booking in a minute", () => {
    const key = "booking:sub:patient-1";
    for (let i = 0; i < RULES.booking.limit; i++) {
      expect(checkRateLimit(key, RULES.booking, store, 0).ok).toBe(true);
    }
    expect(tooManyRequests(checkRateLimit(key, RULES.booking, store, 0)).status).toBe(
      429,
    );
  });
});

describe("clientKey", () => {
  it("prefers the subject over the IP, so IP rotation does not reset a counter", () => {
    expect(clientKey(req("203.0.113.7"), "booking", "patient-1")).toBe(
      "booking:sub:patient-1",
    );
    expect(clientKey(req("198.51.100.9"), "booking", "patient-1")).toBe(
      "booking:sub:patient-1",
    );
  });

  it("takes the LEFTMOST x-forwarded-for entry (the real client on Vercel)", () => {
    expect(clientKey(req("203.0.113.7, 198.51.100.1"), "auth")).toBe(
      "auth:ip:203.0.113.7",
    );
  });

  // Regression: clientKey used to return "ip:unknown" for EVERY header-less
  // request, so all anonymous callers shared one counter. A shared counter
  // makes the limit fire earlier than configured, which throttles unrelated
  // callers and can make a 429 test pass for the wrong reason. Production is
  // unaffected (Vercel always sets x-forwarded-for) but dev and CI are not.
  const withAuth = (token: string) =>
    new Request("https://api.example.test/x", {
      headers: { authorization: `Bearer ${token}` },
    });

  it("does NOT collapse header-less callers into one bucket", () => {
    expect(clientKey(withAuth("token-a"), "auth")).not.toBe(
      clientKey(withAuth("token-b"), "auth"),
    );
  });

  it("gives the same header-less caller a stable bucket across requests", () => {
    expect(clientKey(withAuth("token-a"), "auth")).toBe(
      clientKey(withAuth("token-a"), "auth"),
    );
  });

  it("never puts the raw credential in the key", () => {
    const key = clientKey(withAuth("super-secret-token"), "auth");
    expect(key).not.toContain("super-secret-token");
    expect(key).toMatch(/^auth:tok:[0-9a-f]{16}$/);
  });

  it("one header-less caller's flood does not throttle another", () => {
    const rule = { limit: 2, windowMs: 60_000 };
    const a = clientKey(withAuth("token-a"), "auth");
    const b = clientKey(withAuth("token-b"), "auth");
    checkRateLimit(a, rule, store, 0);
    checkRateLimit(a, rule, store, 0);
    expect(checkRateLimit(a, rule, store, 0).ok).toBe(false);
    expect(checkRateLimit(b, rule, store, 0).ok).toBe(true);
  });

  it("shares one bucket only when the caller is genuinely unattributable", () => {
    // No subject, no IP, no credential. Sharing is the strict direction and is
    // the intended behaviour for this case.
    expect(clientKey(req(), "auth")).toBe("auth:unattributed");
  });

  it("namespaces by scope so booking and auth budgets do not share a counter", () => {
    expect(clientKey(req("1.2.3.4"), "auth")).not.toBe(
      clientKey(req("1.2.3.4"), "booking"),
    );
  });
});

describe("429 body is opaque", () => {
  it("does not leak whether the caller was authenticated", async () => {
    const res = tooManyRequests(checkRateLimit("k", { limit: 0, windowMs: 1000 }, store, 0));
    expect(await res.json()).toEqual({ error: "rate_limited" });
  });
});
