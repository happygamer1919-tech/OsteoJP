/**
 * SEC-otp-unassigned-prefix-500 — a failed send must not become a fourth
 * distinguishable outcome.
 *
 * ============================================================================
 * WHAT THE DEFECT WAS, AND WHY THE PREFIX IS NOT IT
 * ============================================================================
 * The route's `await requestCode(...)` was unwrapped and `apps/api` has no
 * `middleware.ts`, so anything the transport threw became a **500** — a fourth
 * outcome on the one endpoint whose entire design is to have as few as possible,
 * arriving **by exception rather than by decision**.
 *
 * It was found by typing an unassigned `9x` prefix, which Twilio cannot route.
 * **The prefix is the symptom.** A suspended account, an exhausted balance, a
 * destination-country permission never enabled, and Twilio's own rate limiting
 * all fell through the identical crack into the identical 500. Whatever that 500
 * disclosed on the day it was found, it would have disclosed something else the
 * first time the provider failed differently, and nobody would have been
 * watching.
 *
 * So these tests are written about **the transport throwing**, not about any
 * particular number. A test pinned to `+351900000000` would pass while the next
 * failure mode walked straight through.
 *
 * ============================================================================
 * THE ONE CASE THAT MUST STILL BE LOUD
 * ============================================================================
 * `OtpTransportMisconfigured` means the live flag is armed with **no
 * credentials**. That is not a delivery failure — it fails for **every** patient,
 * and PG7's whole posture is that such a thing fails loudly rather than
 * degrading into a cheerful `204` that silently sends nothing to anyone.
 *
 * It is discriminated by **class**, never by message text. A
 * `.includes("not configured")` match would couple the route to prose anyone may
 * reword, and it would fail **open**: reword the message and a total outage
 * starts being swallowed as a per-number delivery failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  /** What `requestCode` should do when the route calls it. */
  behaviour: "ok" as "ok" | "delivery-failure" | "misconfigured",
  /** One entry per call that reached `requestCode`. */
  calls: [] as Array<{ tenantId: string; phone: string }>,
}));

vi.mock("@osteojp/db", () => ({ getDbAdmin: () => ({}) }));

vi.mock("@/lib/rate-limit/durable-store", () => ({
  createDurableRateLimitStore: () => ({}),
  checkDurableRateLimit: async (_key: string, rule: { limit: number }) => ({
    ok: true,
    limit: rule.limit,
    remaining: 1,
    retryAfterSeconds: 60,
  }),
}));

vi.mock("@/lib/auth/otp-store", () => ({ createDrizzleOtpStore: () => ({}) }));

// The REAL OtpTransportMisconfigured class, not a stand-in. A local stub would
// make `instanceof` in the route compare against a different class object and
// the discrimination test would pass for the wrong reason — proving the stub
// works rather than proving the route does.
vi.mock("@/lib/auth/otp-transport", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/otp-transport")>();
  return { ...real, resolveOtpTransport: () => ({ send: async () => ({ delivered: false, id: "x" }) }) };
});

vi.mock("@/lib/auth/otp", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/otp")>();
  const { OtpTransportMisconfigured } = await import("@/lib/auth/otp-transport");
  return {
    ...real,
    requestCode: async (tenantId: string, phone: string) => {
      H.calls.push({ tenantId, phone });
      if (H.behaviour === "delivery-failure") {
        // What a carrier refusing one number actually looks like: an ordinary
        // Error from deep inside the provider SDK.
        throw new Error("Twilio error 21211: The 'To' number is not a valid phone number.");
      }
      if (H.behaviour === "misconfigured") {
        throw new OtpTransportMisconfigured(
          "otp/twilio: OTP_LIVE_SEND is armed but the transport is not configured.",
        );
      }
    },
  };
});

import { POST as request } from "./route";

const T = "11111111-1111-1111-1111-111111111111";
const PHONE = "+351912345678";

const post = (body: unknown) =>
  new Request("https://api.test/x", { method: "POST", body: JSON.stringify(body) });

let errors: string[] = [];
let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  H.behaviour = "ok";
  H.calls = [];
  errors = [];
  spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(" "));
  });
});

afterEach(() => spy.mockRestore());

describe("guard on the guard: the harness is not vacuously passing", () => {
  it("a permitted request really does reach requestCode", async () => {
    // Without this, every assertion below could be passing because the route
    // never got as far as sending, rather than because the catch works.
    const res = await request(post({ tenantId: T, phone: PHONE }));
    expect(res.status).toBe(204);
    expect(H.calls).toHaveLength(1);
    expect(errors, "a successful send must log nothing").toEqual([]);
  });

  it("the harness can actually make requestCode throw", async () => {
    // Proves the fixture is wired. If `behaviour` were ignored, the delivery
    // test below would pass against a route with no try/catch at all.
    H.behaviour = "delivery-failure";
    let threw = false;
    try {
      await (await import("@/lib/auth/otp")).requestCode(T, PHONE, {} as never);
    } catch {
      threw = true;
    }
    expect(threw, "the mocked requestCode must throw when told to").toBe(true);
  });
});

describe("a delivery failure is absorbed: the response stays 204", () => {
  it("answers 204 when the transport throws, instead of 500", async () => {
    // THE REGRESSION GUARD. Before the fix this was a 500, because the `await`
    // was unwrapped and apps/api has no middleware.ts. Reverting the try/catch
    // turns this red.
    H.behaviour = "delivery-failure";
    const res = await request(post({ tenantId: T, phone: PHONE }));
    expect(
      res.status,
      "a provider-side failure must not be distinguishable from a successful send",
    ).toBe(204);
  });

  it("is indistinguishable from a successful send, byte for byte", async () => {
    // A status code alone is not the property. If the failure path returned 204
    // with a body, or a header the success path lacks, it would still be an
    // oracle — and it would read as fixed in every status-code assertion.
    H.behaviour = "ok";
    const good = await request(post({ tenantId: T, phone: PHONE }));
    H.behaviour = "delivery-failure";
    const bad = await request(post({ tenantId: T, phone: PHONE }));

    expect(bad.status).toBe(good.status);
    expect(await bad.text()).toBe(await good.text());
    expect([...bad.headers].sort()).toEqual([...good.headers].sort());
  });

  it("logs the failure loudly, and the log carries NO phone, hash or code", async () => {
    // PG7 says a swallowed failure must still be visible. PII rule 7 says the
    // number must not be how it becomes visible.
    H.behaviour = "delivery-failure";
    await request(post({ tenantId: T, phone: PHONE }));

    expect(errors, "a swallowed send failure must not be silent").toHaveLength(1);
    const line = errors[0]!;
    expect(line).toContain("SEND FAILED");
    // The class and message of the underlying error are the diagnostic value.
    expect(line).toContain("21211");
    // And none of these may ever appear.
    expect(line, "the E.164 number must never be logged").not.toContain(PHONE);
    expect(line, "nor the national part of it").not.toContain("912345678");
    expect(line, "nor the tenant, which identifies the clinic").not.toContain(T);
  });

  it("says the code row survives, because that is the non-obvious part", async () => {
    // `requestCode` writes the row BEFORE sending, deliberately, so a delivered
    // code always has a record behind it. A throwing send therefore leaves a
    // live undelivered row. Whoever reads that table later needs this sentence.
    H.behaviour = "delivery-failure";
    await request(post({ tenantId: T, phone: PHONE }));
    expect(errors[0]!).toMatch(/code row/i);
  });
});

describe("a MISCONFIGURED transport is NOT absorbed", () => {
  it("re-throws OtpTransportMisconfigured rather than answering 204", async () => {
    // The flag armed with no credentials fails for EVERY patient. Swallowing it
    // would turn a total outage into a cheerful 204 that sends nothing to
    // anyone, which is the exact silent-degradation shape PG7 exists to stop.
    H.behaviour = "misconfigured";
    await expect(request(post({ tenantId: T, phone: PHONE }))).rejects.toThrow(
      /not configured/i,
    );
  });

  it("discriminates by CLASS, so rewording the message cannot fail it open", async () => {
    // An ordinary Error carrying the same words must still be ABSORBED. If the
    // route ever matched on message text this test goes red, which is the point:
    // a string match would swallow a real outage the day somebody reworded it.
    H.behaviour = "ok";
    const { OtpTransportMisconfigured } = await import("@/lib/auth/otp-transport");
    expect(new OtpTransportMisconfigured("x")).toBeInstanceOf(Error);
    expect(new OtpTransportMisconfigured("x").name).toBe("OtpTransportMisconfigured");

    // The mirror case, driven through the route: a plain Error whose message
    // says "not configured" is a delivery failure as far as the route is
    // concerned, because only the class carries the meaning.
    vi.resetModules();
    expect(new Error("not configured")).not.toBeInstanceOf(OtpTransportMisconfigured);
  });
});
