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
  behaviour: "ok" as "ok" | "delivery-failure" | "misconfigured" | "write-failure",
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
      if (H.behaviour === "write-failure") {
        // SEC-otp-request-tenant-500-oracle. What a fabricated tenantId actually
        // produces: `patient_otp_codes.tenant_id` carries REFERENCES tenants(id)
        // (0056:95), so `store.create` raises a foreign-key violation from the
        // driver. THE REAL `OtpCodeNotStored` IS USED, not a stand-in, so
        // `instanceof` in the route compares against the same class object the
        // route imports - a local stub would make the branch test pass by
        // proving the stub works rather than by proving the route does.
        throw new real.OtpCodeNotStored(
          Object.assign(
            new Error(
              'insert or update on table "patient_otp_codes" violates foreign key ' +
                'constraint "patient_otp_codes_tenant_id_fkey"',
            ),
            { name: "PostgresError" },
          ),
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

/* ==========================================================================
 * SEC-otp-request-tenant-500-oracle — THE WRITE HALF, WHICH THE CATCH ABOVE
 * ABSORBS BY ACCIDENT AND USED TO DESCRIBE INCORRECTLY.
 * ==========================================================================
 * THE CARD'S PREMISE IS HALF FALSE ON main, AND THAT IS WHY THESE TESTS ARE
 * SHAPED THE WAY THEY ARE. The card, written 2026-08-11, says this route answers
 * 500 for an unknown `tenantId`. It does not: `store.create` runs inside
 * `requestCode` inside the try/catch that `SEC-otp-unassigned-prefix-500` added
 * on 2026-08-13 for a completely unrelated reason, so the foreign-key violation
 * is caught and the route answers 204 like everything else.
 *
 * NOTHING HELD IT THERE. The behaviour was correct by coincidence - one card's
 * fix covering another card's defect, with no test naming the second case. The
 * first test below is that guard, and it is the substantive half of this card:
 * it turns a coincidence into a property.
 *
 * WHAT WAS ACTUALLY STILL WRONG is the log. The catch said "the code row was
 * already written and is now live-but-undelivered" unconditionally, which is the
 * opposite of the truth when the WRITE is what failed. A log line on a failure
 * path is a verdict path - it is read only when something has already gone
 * wrong, by somebody who cannot see the code - and it was sending that person to
 * look for a row that does not exist.
 */
describe("a failed WRITE is absorbed too, and is not described as a failed send", () => {
  it("answers 204 when the code row cannot be written, not 500", async () => {
    // THE REGRESSION GUARD FOR THE CARD'S ORIGINAL FINDING. A fabricated
    // tenantId must not be distinguishable from a real one. Nothing asserted
    // this before: the behaviour was right by accident.
    H.behaviour = "write-failure";
    const res = await request(post({ tenantId: T, phone: PHONE }));
    expect(
      res.status,
      "a tenantId that is not a real tenant must not be distinguishable from one that is",
    ).toBe(204);
  });

  it("is byte-identical to a successful request", async () => {
    // Status alone is not the property, for the same reason as the send arm: a
    // body or a header the success path lacks is still an oracle.
    H.behaviour = "ok";
    const good = await request(post({ tenantId: T, phone: PHONE }));
    H.behaviour = "write-failure";
    const bad = await request(post({ tenantId: T, phone: PHONE }));

    expect(bad.status).toBe(good.status);
    expect(await bad.text()).toBe(await good.text());
    expect([...bad.headers].sort()).toEqual([...good.headers].sort());
  });

  it("says NO row exists, and does NOT claim a live-but-undelivered code", async () => {
    // THE ASSERTION THIS CARD EXISTS FOR. The negative half is the load-bearing
    // one: reverting the branch makes the route print the send-failure sentence
    // here, and this goes red.
    H.behaviour = "write-failure";
    await request(post({ tenantId: T, phone: PHONE }));

    expect(errors, "a swallowed write failure must not be silent either").toHaveLength(1);
    const line = errors[0]!;
    expect(line).toContain("CODE ROW NOT WRITTEN");
    expect(line).toContain("NOTHING WAS SENT");
    expect(
      line,
      "the send-failure sentence is FALSE here: writing the row is what failed",
    ).not.toMatch(/live-but-undelivered until its TTL/);
    expect(line).not.toContain("SEND FAILED");
  });

  it("carries the driver's own error through, so nothing diagnostic is lost", async () => {
    // The wrapper adds a FACT (which half failed); it must not replace the
    // diagnostic. A wrapper that swallowed its cause would satisfy every
    // assertion above and leave an operator with nothing to act on.
    H.behaviour = "write-failure";
    await request(post({ tenantId: T, phone: PHONE }));
    expect(errors[0]!).toContain("PostgresError");
    expect(errors[0]!).toContain("patient_otp_codes_tenant_id_fkey");
  });

  it("logs no phone, no hash and no tenant, exactly like the send arm", async () => {
    // PII rule 7, and on this branch the tenant is very likely attacker-supplied
    // text besides.
    H.behaviour = "write-failure";
    await request(post({ tenantId: T, phone: PHONE }));
    const line = errors[0]!;
    expect(line, "the E.164 number must never be logged").not.toContain(PHONE);
    expect(line, "nor the national part of it").not.toContain("912345678");
    expect(line, "nor the tenant, which identifies the clinic").not.toContain(T);
  });

  it("still tells the two halves apart by CLASS, so rewording cannot fail it open", async () => {
    // The same rule `OtpTransportMisconfigured` is held to. An ordinary Error
    // whose message happens to mention the constraint must take the SEND branch,
    // because only the class carries the meaning.
    H.behaviour = "ok";
    const { OtpCodeNotStored } = await import("@/lib/auth/otp");
    expect(new OtpCodeNotStored(new Error("x"))).toBeInstanceOf(Error);
    expect(new OtpCodeNotStored(new Error("x")).name).toBe("OtpCodeNotStored");
    expect(
      new Error("patient_otp_codes_tenant_id_fkey"),
      "a message match would fail OPEN the day somebody reworded the prose",
    ).not.toBeInstanceOf(OtpCodeNotStored);
  });
});
