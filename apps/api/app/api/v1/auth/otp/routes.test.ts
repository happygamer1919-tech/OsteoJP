/**
 * W13-03 — the OTP routes. PG1.
 *
 * The property under test is the one the whole loop is shaped around: a caller
 * cannot distinguish an unknown phone from a wrong code from an unlinkable
 * patient. Two modules enforce that internally; these tests prove the ROUTES do
 * not undo it by mapping outcomes onto different statuses or bodies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  limitOk: true,
  verify: vi.fn(),
  link: vi.fn(),
  requested: [] as Array<{ tenantId: string; phone: string }>,
}));

vi.mock("@/lib/rate-limit/durable-store", () => ({
  createDurableRateLimitStore: () => ({}),
  checkDurableRateLimit: async () => ({
    ok: H.limitOk, limit: 10, remaining: 0, retryAfterSeconds: 60,
  }),
}));
vi.mock("@/lib/auth/otp-store", () => ({ createDrizzleOtpStore: () => ({}) }));
vi.mock("@/lib/auth/otp-transport", () => ({ resolveOtpTransport: () => ({ send: async () => ({ delivered: false, id: "sink" }) }) }));
vi.mock("@/lib/auth/otp", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/otp")>();
  return {
    ...real,
    requestCode: async (tenantId: string, phone: string) => { H.requested.push({ tenantId, phone }); },
    verifyCode: (...a: unknown[]) => H.verify(...a),
  };
});
vi.mock("@/lib/auth/patient-linkage", () => ({
  resolvePatientByProvenPhone: (...a: unknown[]) => H.link(...a),
}));

import { POST as request } from "./request/route";
import { POST as verify } from "./verify/route";

const T = "11111111-1111-1111-1111-111111111111";
const post = (body: unknown) =>
  new Request("https://api.test/x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  H.limitOk = true;
  H.requested = [];
  H.verify.mockReset();
  H.link.mockReset();
});

describe("request: the enumeration surface", () => {
  it("answers 204 for any well-formed number, known or not", async () => {
    const a = await request(post({ tenantId: T, phone: "+351912345678" }));
    const b = await request(post({ tenantId: T, phone: "+351999888777" }));
    expect(a.status).toBe(204);
    expect(b.status).toBe(204);
    expect(await a.text()).toBe(await b.text());
  });

  it("normalizes before issuing, so one handset is one budget", async () => {
    await request(post({ tenantId: T, phone: "912 345 678" }));
    expect(H.requested[0]!.phone).toBe("+351912345678");
  });

  it("rejects a malformed number with 400 - about the input, not our records", async () => {
    const res = await request(post({ tenantId: T, phone: "not-a-phone" }));
    expect(res.status).toBe(400);
  });

  it("refuses when rate limited, with 429 and a Retry-After", async () => {
    H.limitOk = false;
    const res = await request(post({ tenantId: T, phone: "+351912345678" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("does not issue a code when rate limited", async () => {
    H.limitOk = false;
    await request(post({ tenantId: T, phone: "+351912345678" }));
    expect(H.requested).toEqual([]);
  });
});

describe("verify: every failure is byte-identical", () => {
  const cases: Array<[string, () => void]> = [
    ["the code is wrong or unknown", () => { H.verify.mockResolvedValue({ ok: false }); }],
    ["the phone links to nobody", () => {
      H.verify.mockResolvedValue({ ok: true, phoneHash: "h" });
      H.link.mockResolvedValue({ ok: false });
    }],
  ];

  it("returns the same status AND the same body for every failure mode", async () => {
    const seen: Array<{ status: number; body: string }> = [];
    for (const [, setup] of cases) {
      setup();
      const res = await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
      seen.push({ status: res.status, body: await res.text() });
    }
    for (const s of seen) expect(s.status).toBe(401);
    expect(new Set(seen.map((s) => JSON.stringify(s))).size).toBe(1);
  });

  it("succeeds only when BOTH the code verifies and the phone links", async () => {
    H.verify.mockResolvedValue({ ok: true, phoneHash: "h" });
    H.link.mockResolvedValue({ ok: true, patientId: "p1" });
    const res = await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ patientId: "p1" });
  });

  it("does NOT mint a session yet - no cookie, no token", async () => {
    // Deliberate: the session mint must land in the same transaction as
    // consuming the code. Shipping half of that is what Decision D forbids.
    H.verify.mockResolvedValue({ ok: true, phoneHash: "h" });
    H.link.mockResolvedValue({ ok: true, patientId: "p1" });
    const res = await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(JSON.stringify(await res.json())).not.toMatch(/token|session|access/i);
  });

  it("never reaches the patient table when the code fails", async () => {
    // Linkage is claim-time only. Querying it earlier would leak membership
    // through timing even with an identical response.
    H.verify.mockResolvedValue({ ok: false });
    await verify(post({ tenantId: T, phone: "+351912345678", code: "000000" }));
    expect(H.link).not.toHaveBeenCalled();
  });

  it("is rate limited before the code is ever checked", async () => {
    H.limitOk = false;
    const res = await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
    expect(res.status).toBe(429);
    expect(H.verify).not.toHaveBeenCalled();
  });
});
