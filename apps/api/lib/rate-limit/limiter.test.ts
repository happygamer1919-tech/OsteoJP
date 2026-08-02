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

  it("falls back to a constant when no IP is present, and still limits", () => {
    expect(clientKey(req(), "auth")).toBe("auth:ip:unknown");
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
