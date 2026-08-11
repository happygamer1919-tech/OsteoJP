/**
 * SEC-otp-unauthenticated-sms-pump - the request route stops being a free SMS
 * pump.
 *
 * TWO PROPERTIES, and they fail in different ways so they are tested apart:
 *   (a) THE GLOBAL CEILING bounds total sends absolutely. Neither existing limit
 *       does: an attacker rotating numbers never approaches the per-phone cap,
 *       and a proxy pool defeats the per-client one, so "3 per key" times
 *       unbounded keys is unbounded spend.
 *   (b) A LANDLINE IS REFUSED before anything is sent. normalizePhonePT admits
 *       the `2` prefix, which cannot receive SMS, so the route used to pay to
 *       text it.
 *
 * WHY A SEPARATE FILE FROM routes.test.ts. That suite's rate-limit mock answers
 * ONE verdict for EVERY key (`H.limitOk`), which is right for what it proves and
 * useless here: with one global verdict you cannot show that the CEILING refused
 * while the per-phone limit still allowed, which is the whole of property (a).
 * This harness records the keys and answers per key.
 *
 * THE SEND IS THE ASSERTION, not the status code. Every test that matters ends
 * by counting `sent` - the number of times the transport was actually asked to
 * deliver. A 429 with a message already on the wire would be a passing test and
 * a live defect.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  /** Every key the route checked, in order. */
  keys: [] as string[],
  /** key -> ok. Anything unlisted is allowed. */
  verdicts: new Map<string, boolean>(),
  /** One entry per ACTUAL send attempt. */
  sent: [] as Array<{ tenantId: string; phone: string }>,
}));

vi.mock("@osteojp/db", () => ({ getDbAdmin: () => ({}) }));

vi.mock("@/lib/rate-limit/durable-store", () => ({
  createDurableRateLimitStore: () => ({}),
  checkDurableRateLimit: async (key: string, rule: { limit: number }) => {
    H.keys.push(key);
    const ok = H.verdicts.get(key) ?? true;
    return { ok, limit: rule.limit, remaining: ok ? 1 : 0, retryAfterSeconds: 60 };
  },
}));

vi.mock("@/lib/auth/otp-store", () => ({ createDrizzleOtpStore: () => ({}) }));
vi.mock("@/lib/auth/otp-transport", () => ({
  resolveOtpTransport: () => ({ send: async () => ({ delivered: false, id: "sink" }) }),
}));
vi.mock("@/lib/auth/otp", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/otp")>();
  return {
    ...real,
    requestCode: async (tenantId: string, phone: string) => {
      H.sent.push({ tenantId, phone });
    },
  };
});

import { POST as request } from "./route";
import { OTP_GLOBAL_DAY_KEY, OTP_GLOBAL_HOUR_KEY, RULES } from "@/lib/rate-limit/limiter";

const T = "11111111-1111-1111-1111-111111111111";
const MOBILE = "+351912345678";
const LANDLINE = "+351210000000";

const post = (body: unknown) =>
  new Request("https://api.test/x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  H.keys = [];
  H.sent = [];
  H.verdicts = new Map();
});

describe("guards on the guards: the harness is not vacuously passing", () => {
  it("a permitted request really does reach the send", async () => {
    // If this ever fails, every "no send happened" assertion below is passing
    // because nothing ever sends, not because the control works.
    const res = await request(post({ tenantId: T, phone: MOBILE }));
    expect(res.status).toBe(204);
    expect(H.sent).toHaveLength(1);
    expect(H.sent[0]!.phone).toBe(MOBILE);
  });

  it("the route checks the two constant ceiling keys", async () => {
    await request(post({ tenantId: T, phone: MOBILE }));
    expect(H.keys).toContain(OTP_GLOBAL_HOUR_KEY);
    expect(H.keys).toContain(OTP_GLOBAL_DAY_KEY);
  });
});

describe("(a) the global send ceiling bounds spend absolutely", () => {
  it("REFUSES the send when the hourly ceiling is reached", async () => {
    H.verdicts.set(OTP_GLOBAL_HOUR_KEY, false);
    const res = await request(post({ tenantId: T, phone: MOBILE }));
    expect(res.status).toBe(429);
    expect(H.sent).toHaveLength(0);
  });

  it("REFUSES the send when the daily ceiling is reached", async () => {
    H.verdicts.set(OTP_GLOBAL_DAY_KEY, false);
    const res = await request(post({ tenantId: T, phone: MOBILE }));
    expect(res.status).toBe(429);
    expect(H.sent).toHaveLength(0);
  });

  /**
   * THE PROPERTY NEITHER EXISTING LIMIT HAS. Both per-key limits allow, and the
   * request is still refused - which is what "absolute" means. Without the
   * ceiling this request sends.
   */
  it("binds even when the per-client and per-phone limits both allow", async () => {
    H.verdicts.set(OTP_GLOBAL_DAY_KEY, false);
    // Nothing else is set to refuse, so both per-key limits answer ok.
    const res = await request(post({ tenantId: T, phone: MOBILE }));
    expect(res.status).toBe(429);
    expect(H.sent).toHaveLength(0);
  });

  /**
   * THE BYPASS THE CONSTANT KEY EXISTS TO CLOSE. An attacker rotating the
   * body-supplied tenantId must not get a fresh ceiling bucket.
   */
  it("cannot be reset by rotating the caller-supplied tenantId", async () => {
    H.verdicts.set(OTP_GLOBAL_HOUR_KEY, false);
    for (const tenantId of [T, "22222222-2222-2222-2222-222222222222", "anything"]) {
      const res = await request(post({ tenantId, phone: MOBILE }));
      expect(res.status).toBe(429);
    }
    expect(H.sent).toHaveLength(0);
  });

  it("cannot be reset by rotating the phone number either", async () => {
    H.verdicts.set(OTP_GLOBAL_HOUR_KEY, false);
    for (const phone of ["+351912345678", "+351933333333", "+351966666666"]) {
      expect((await request(post({ tenantId: T, phone }))).status).toBe(429);
    }
    expect(H.sent).toHaveLength(0);
  });

  it("keys on a CONSTANT: nothing the caller supplies appears in either key", async () => {
    // The security property stated as a string check, because it is one. If a
    // future edit interpolates a tenant or a phone hash into the key, the
    // ceiling silently becomes per-caller and stops being a ceiling.
    for (const key of [OTP_GLOBAL_HOUR_KEY, OTP_GLOBAL_DAY_KEY]) {
      expect(key).not.toMatch(/\$\{|\+/);
      expect(key).not.toContain(T);
    }
    await request(post({ tenantId: T, phone: MOBILE }));
    const globals = H.keys.filter((k) => k.includes("global"));
    expect(globals).toEqual([OTP_GLOBAL_HOUR_KEY, OTP_GLOBAL_DAY_KEY]);
  });

  it("is checked LAST, so refused garbage cannot spend the clinic's budget", async () => {
    // Ordering is the control here, not an implementation detail. If the
    // ceiling were checked first, an attacker could exhaust the daily allowance
    // with malformed input that never sends, denying login to every real
    // patient for free.
    await request(post({ tenantId: T, phone: "not-a-phone" }));
    expect(H.keys).not.toContain(OTP_GLOBAL_HOUR_KEY);
    expect(H.keys).not.toContain(OTP_GLOBAL_DAY_KEY);

    H.keys = [];
    await request(post({ tenantId: T, phone: LANDLINE }));
    expect(H.keys).not.toContain(OTP_GLOBAL_HOUR_KEY);
    expect(H.keys).not.toContain(OTP_GLOBAL_DAY_KEY);
  });

  it("trips the shorter window first, so a burst does not spend the day", async () => {
    H.verdicts.set(OTP_GLOBAL_HOUR_KEY, false);
    await request(post({ tenantId: T, phone: MOBILE }));
    expect(H.keys).toContain(OTP_GLOBAL_HOUR_KEY);
    expect(H.keys).not.toContain(OTP_GLOBAL_DAY_KEY);
  });

  it("adds no enumeration signal: the 429 is identical whatever the number", async () => {
    H.verdicts.set(OTP_GLOBAL_DAY_KEY, false);
    const a = await request(post({ tenantId: T, phone: "+351912345678" }));
    const b = await request(post({ tenantId: T, phone: "+351999888777" }));
    expect(a.status).toBe(b.status);
    expect(await a.text()).toBe(await b.text());
    expect(a.headers.get("retry-after")).toBe(b.headers.get("retry-after"));
  });

  it("the two rules are real fixed windows of an hour and a day", async () => {
    expect(RULES.otpGlobalHour.windowMs).toBe(60 * 60_000);
    expect(RULES.otpGlobalDay.windowMs).toBe(24 * 60 * 60_000);
    // The day cap must bind before the hour cap could be spent 24 times, or it
    // is decorative.
    expect(RULES.otpGlobalDay.limit).toBeLessThan(RULES.otpGlobalHour.limit * 24);
  });
});

describe("(b) a landline is refused BEFORE anything is sent", () => {
  it("refuses a PT geographic number with 400 and sends nothing", async () => {
    const res = await request(post({ tenantId: T, phone: LANDLINE }));
    expect(res.status).toBe(400);
    expect(H.sent).toHaveLength(0);
  });

  it("refuses it in every input form the normaliser accepts", async () => {
    for (const raw of ["210000000", "+351 210 000 000", "00351210000000", "351210000000"]) {
      const res = await request(post({ tenantId: T, phone: raw }));
      expect(res.status, raw).toBe(400);
    }
    expect(H.sent).toHaveLength(0);
  });

  it("still sends to a mobile, so the refusal is not just 'everything fails'", async () => {
    const res = await request(post({ tenantId: T, phone: MOBILE }));
    expect(res.status).toBe(204);
    expect(H.sent).toHaveLength(1);
  });

  it("is INDISTINGUISHABLE from a malformed number, adding no new outcome", async () => {
    // The numbering plan is public, so naming the landline case would leak
    // nothing - but it would still be a new distinguishable outcome on the
    // endpoint whose design is to have as few as possible, and the portal is
    // ruled not to branch on it. Same status, same body.
    const landline = await request(post({ tenantId: T, phone: LANDLINE }));
    const malformed = await request(post({ tenantId: T, phone: "not-a-phone" }));
    expect(landline.status).toBe(malformed.status);
    expect(await landline.text()).toBe(await malformed.text());
  });

  it("does not reach the per-phone limiter, so a landline cannot spend a budget", async () => {
    await request(post({ tenantId: T, phone: LANDLINE }));
    expect(H.keys.filter((k) => k.startsWith("otp-request:phone:"))).toEqual([]);
  });
});
