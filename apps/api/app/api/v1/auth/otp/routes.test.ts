/**
 * W13-03 — the OTP routes. PG1.
 *
 * The property under test is the one the whole loop is shaped around: a caller
 * cannot distinguish an unknown phone from a wrong code from an unlinkable
 * patient from a lost race. Three modules enforce that internally; these tests
 * prove the ROUTES do not undo it by mapping outcomes onto different statuses or
 * bodies.
 *
 * THE CLAIM TRANSACTION IS TESTED HERE BY ORDER AND BY REFUSAL, not by mocking a
 * database into agreeing with itself. What a mock CAN honestly prove is that the
 * route asks for a transaction, does its four steps on the handle that
 * transaction gave it, and refuses whenever any step says no. What it CANNOT
 * prove is that the database enforces the race — that lives in the DB-gated
 * suite (otp-claim.db.test.ts), against a real Postgres, because a mocked race
 * only proves the mock races.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// HOISTED, because the mint routes assert this at IMPORT time and a plain
// assignment would run after their module bodies. That the assertion fires
// during collection rather than during a request is the control working: a
// missing secret takes the route out at boot, not at the patient.
// NAME only; the value here is a test fixture and never a real secret.
vi.hoisted(() => {
  process.env.PATIENT_SESSION_SECRET ??= "routes-test-secret-at-least-32-chars!!";
});

const H = vi.hoisted(() => ({
  limitOk: true,
  verify: vi.fn(),
  link: vi.fn(),
  consume: vi.fn(),
  issue: vi.fn(),
  isTrusted: vi.fn(),
  requested: [] as Array<{ tenantId: string; phone: string }>,
  /** Every store/linkage call records the handle it was handed. */
  handles: [] as unknown[],
  /** The object the fake transaction passes to its callback. */
  TX: { __tx: true } as const,
}));

vi.mock("@osteojp/db", () => ({
  getDbAdmin: () => ({
    // Runs the callback with the tx handle and returns its value, which is what
    // drizzle does on commit. A callback that THROWS propagates, which is how
    // the rollback path is asserted below.
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(H.TX),
  }),
}));
vi.mock("@/lib/rate-limit/durable-store", () => ({
  createDurableRateLimitStore: () => ({}),
  checkDurableRateLimit: async () => ({
    ok: H.limitOk, limit: 10, remaining: 0, retryAfterSeconds: 60,
  }),
}));
vi.mock("@/lib/auth/otp-store", () => ({
  createDrizzleOtpStore: (db?: unknown) => {
    H.handles.push(db);
    return { consume: (...a: unknown[]) => H.consume(...a) };
  },
  createDrizzleTrustedDeviceStore: (db?: unknown) => {
    H.handles.push(db);
    return {
      issue: (...a: unknown[]) => H.issue(...a),
      isTrusted: (...a: unknown[]) => H.isTrusted(...a),
    };
  },
}));
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
  resolvePatientByProvenPhone: (...a: unknown[]) => { H.handles.push(a[2]); return H.link(...a); },
}));

import { POST as request } from "./request/route";
import { POST as trusted } from "./trusted/route";
import { POST as verify } from "./verify/route";
import { DEVICE_COOKIE } from "@/lib/auth/device-cookie";

const T = "11111111-1111-1111-1111-111111111111";
const TOKEN = "a".repeat(64);
const TRUSTED_OK = { patientId: "p1", tenantId: T };
const post = (body: unknown, init: RequestInit = {}) =>
  new Request("https://api.test/x", { method: "POST", body: JSON.stringify(body), ...init });
const withCookie = (value: string) =>
  new Request("https://api.test/x", { method: "POST", headers: { cookie: `${DEVICE_COOKIE}=${value}` } });

/** The happy path, so each test below only states what it changes. */
function claimSucceeds() {
  H.verify.mockResolvedValue({ ok: true, phoneHash: "h", codeId: "c1" });
  H.link.mockResolvedValue({ ok: true, patientId: "p1" });
  H.consume.mockResolvedValue(true);
  H.issue.mockResolvedValue(undefined);
}

beforeEach(() => {
  H.limitOk = true;
  H.requested = [];
  H.handles = [];
  H.verify.mockReset();
  H.link.mockReset();
  H.consume.mockReset();
  H.issue.mockReset();
  H.isTrusted.mockReset();
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
      H.verify.mockResolvedValue({ ok: true, phoneHash: "h", codeId: "c1" });
      H.link.mockResolvedValue({ ok: false });
    }],
    ["another request redeemed the same code first", () => {
      claimSucceeds();
      H.consume.mockResolvedValue(false);
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

  it("plants NO device cookie on any refusal", async () => {
    // A refused claim that still trusted the device would hand a thirty-day
    // credential to exactly the caller the refusal was for.
    for (const [, setup] of cases) {
      setup();
      const res = await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("succeeds only when the code verifies, the phone links AND the spend wins", async () => {
    claimSucceeds();
    const res = await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ patientId: "p1" });
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

describe("verify: the claim is ONE transaction", () => {
  it("runs verify, linkage, consume and issue on the SAME handle", async () => {
    claimSucceeds();
    await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
    // Every store built and every linkage read took the transaction's handle.
    // One of them reaching for getDbAdmin() instead would commit on its own.
    expect(H.handles.length).toBeGreaterThanOrEqual(3);
    for (const h of H.handles) expect(h).toBe(H.TX);
    expect((H.verify.mock.calls[0]![3] as { store: unknown }).store).toBeTruthy();
  });

  it("spends the code AFTER linkage resolves, never before", async () => {
    // Order is the ruling: a linkage refusal leaves the code live rather than
    // burning it for a second SMS that reaches the identical refusal.
    const order: string[] = [];
    H.verify.mockImplementation(async () => { order.push("verify"); return { ok: true, phoneHash: "h", codeId: "c1" }; });
    H.link.mockImplementation(async () => { order.push("link"); return { ok: true, patientId: "p1" }; });
    H.consume.mockImplementation(async () => { order.push("consume"); return true; });
    H.issue.mockImplementation(async () => { order.push("issue"); });

    await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
    expect(order).toEqual(["verify", "link", "consume", "issue"]);
  });

  it("does NOT spend the code when linkage refuses", async () => {
    H.verify.mockResolvedValue({ ok: true, phoneHash: "h", codeId: "c1" });
    H.link.mockResolvedValue({ ok: false });
    await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
    expect(H.consume).not.toHaveBeenCalled();
  });

  it("does NOT trust the device when it lost the race for the code", async () => {
    // The whole point of consume returning a boolean: the loser writes nothing,
    // and must therefore grant nothing.
    claimSucceeds();
    H.consume.mockResolvedValue(false);
    await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
    expect(H.issue).not.toHaveBeenCalled();
  });

  it("REFUSES rather than throws when the code is wrong, so the attempt is kept", async () => {
    // A throw would roll the transaction back and refund the attempt counter,
    // handing an attacker unlimited guesses against a five-attempt cap.
    H.verify.mockResolvedValue({ ok: false });
    const res = await verify(post({ tenantId: T, phone: "+351912345678", code: "000000" }));
    expect(res.status).toBe(401);
  });
});

describe("verify: the trusted-device token", () => {
  it("leaves in an httpOnly Secure SameSite cookie, never in the body", async () => {
    claimSucceeds();
    const res = await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));

    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(DEVICE_COOKIE);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    // An XSS that can read the JSON must not be able to read the credential.
    expect(JSON.stringify(await res.json())).not.toMatch(/token|session|access/i);
  });

  it("stores only the HASH, and the value only ever exists in that one response", async () => {
    claimSucceeds();
    const res = await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
    const cookie = res.headers.get("set-cookie")!;
    const value = /__Host-ojp_device=([0-9a-f]{64})/.exec(cookie)![1]!;

    const stored = (H.issue.mock.calls[0]![0] as { deviceTokenHash: string }).deviceTokenHash;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toBe(value);
  });

  it("binds the device to the patient the phone resolved to", async () => {
    claimSucceeds();
    await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
    expect(H.issue.mock.calls[0]![0]).toMatchObject({ tenantId: T, patientId: "p1" });
  });
});

describe("a missing signing secret is a 503, not a 401", () => {
  // The distinction the whole guard exists for: a misconfigured deployment must
  // not look to a patient like they typed the code wrong.
  const SAVED = process.env.PATIENT_SESSION_SECRET;
  afterEach(() => { process.env.PATIENT_SESSION_SECRET = SAVED; });

  it("verify answers 503 and never reaches the code check", async () => {
    delete process.env.PATIENT_SESSION_SECRET;
    const res = await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));
    expect(res.status).toBe(503);
    expect(H.verify).not.toHaveBeenCalled();
  });

  it("trusted answers 503 and never reaches the device check", async () => {
    delete process.env.PATIENT_SESSION_SECRET;
    const res = await trusted(withCookie(TOKEN));
    expect(res.status).toBe(503);
    expect(H.isTrusted).not.toHaveBeenCalled();
  });

  it("503 is distinguishable from the 401 refusal, which is the point", async () => {
    delete process.env.PATIENT_SESSION_SECRET;
    const broken = await verify(post({ tenantId: T, phone: "+351912345678", code: "123456" }));

    process.env.PATIENT_SESSION_SECRET = SAVED;
    H.verify.mockResolvedValue({ ok: false });
    const refused = await verify(post({ tenantId: T, phone: "+351912345678", code: "000000" }));

    expect(broken.status).toBe(503);
    expect(refused.status).toBe(401);
  });
});

describe("trusted: the check that happens BEFORE a code is demanded", () => {
  it("answers with the patient when the device is live", async () => {
    H.isTrusted.mockResolvedValue(TRUSTED_OK);
    const res = await trusted(withCookie(TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ patientId: "p1" });
  });

  it("takes NO phone number - the answer comes from the credential alone", async () => {
    H.isTrusted.mockResolvedValue(TRUSTED_OK);
    await trusted(withCookie(TOKEN));
    // Nothing was linked, so no patient lookup by phone happened on this path.
    expect(H.link).not.toHaveBeenCalled();
  });

  it("refuses with 401 when there is no cookie at all", async () => {
    const res = await trusted(new Request("https://api.test/x", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(H.isTrusted).not.toHaveBeenCalled();
  });

  it("refuses a malformed cookie WITHOUT touching the database", async () => {
    const res = await trusted(withCookie("not-a-token"));
    expect(res.status).toBe(401);
    expect(H.isTrusted).not.toHaveBeenCalled();
  });

  it("clears the cookie when the device is expired or revoked", async () => {
    // Otherwise the browser keeps presenting a dead credential for the rest of
    // its Max-Age and pays a database lookup for it on every visit.
    H.isTrusted.mockResolvedValue(null);
    const res = await trusted(withCookie(TOKEN));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("checks the HASH, never the raw token", async () => {
    H.isTrusted.mockResolvedValue(TRUSTED_OK);
    await trusted(withCookie(TOKEN));
    expect(H.isTrusted.mock.calls[0]![0]).not.toBe(TOKEN);
    expect(H.isTrusted.mock.calls[0]![0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("WRITES NOTHING - a check must not extend the window", async () => {
    H.isTrusted.mockResolvedValue(TRUSTED_OK);
    await trusted(withCookie(TOKEN));
    expect(H.issue).not.toHaveBeenCalled();
  });

  it("is rate limited before the credential is checked", async () => {
    H.limitOk = false;
    const res = await trusted(withCookie(TOKEN));
    expect(res.status).toBe(429);
    expect(H.isTrusted).not.toHaveBeenCalled();
  });

  it("refuses an unknown device with the same 401 as a revoked one", async () => {
    H.isTrusted.mockResolvedValue(null);
    const a = await trusted(withCookie(TOKEN));
    const b = await trusted(withCookie("b".repeat(64)));
    expect(a.status).toBe(b.status);
    expect(await a.text()).toBe(await b.text());
  });
});
