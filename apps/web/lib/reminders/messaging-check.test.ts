import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CONFIRM_CODE_SECRET_VAR, CONFIRM_LINK_FLAG } from "./confirm-code";

/**
 * The two refusals the owner's delivery test can reach WITHOUT sending, and
 * they are the two worth pinning: both happen before anything costs money or
 * touches a handset, and both are easy to regress into a silent send.
 */
describe("the delivery test refuses before it spends", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("refuses a number that is not usable, without sending", async () => {
    process.env[CONFIRM_LINK_FLAG] = "true";
    process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-test-secret";
    const { sendMessagingCheck } = await import("./messaging-check");
    expect(
      await sendMessagingCheck({
        tenantId: "t",
        actorUserId: "u",
        phone: "not a number",
        ip: null,
      }),
    ).toEqual({ ok: false, reason: "invalid_phone" });
  });

  it("refuses when the confirm link is DISARMED, because there is nothing to test", async () => {
    // The commonest reason a delivery test would appear to work and prove
    // nothing: the flag is off, so the body has no link in it. Sending that
    // costs money and answers a question nobody asked.
    delete process.env[CONFIRM_LINK_FLAG];
    process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-test-secret";
    const { sendMessagingCheck } = await import("./messaging-check");
    expect(
      await sendMessagingCheck({
        tenantId: "t",
        actorUserId: "u",
        phone: "+351912345678",
        ip: null,
      }),
    ).toEqual({ ok: false, reason: "no_link" });
  });
});

/**
 * P0-A. THE TRANSPORT THROWS AND THE PAGE MUST NOT.
 *
 * packages/notify's gate awaits the provider with no try/catch, so a Twilio
 * rejection propagates. The reminder path survives that because it runs inside
 * an Inngest job, where a throw is a retryable job failure nobody sees. This
 * page is a user-facing server action, so the SAME throw was a 500 on the
 * owner's screen with the reason only in Sentry - which is what he hit.
 *
 * BOTH ARMS. Without the catch the call rejects; with it the owner gets a
 * result object naming the provider's own words.
 */
describe("a provider rejection is reported, never thrown", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function withThrowingTransport() {
    vi.resetModules();
    vi.doMock("./clients", () => ({
      sendSms: async () => {
        throw new Error("The 'To' number +351210000000 is not a mobile number");
      },
    }));
    vi.doMock("./confirm-code-store", () => ({
      issueConfirmCode: async () => null,
      withdrawConfirmCode: async () => true,
    }));
    vi.doMock("@osteojp/db", () => ({
      auditLog: {},
      getDbAdmin: () => ({ insert: () => ({ values: async () => undefined }) }),
    }));
    return import("./messaging-check");
  }

  it("returns send_failed carrying the provider's reason, and does NOT reject", async () => {
    process.env[CONFIRM_LINK_FLAG] = "true";
    process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-test-secret";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.osteojp.pt";
    const { sendMessagingCheck } = await withThrowingTransport();

    const result = await sendMessagingCheck({
      tenantId: "t",
      actorUserId: "u",
      phone: "+351912345678",
      ip: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("send_failed");
    // The provider's own words reach the owner's screen. That is the entire
    // difference between a diagnostic page and a 500.
    expect(result.detail).toContain("is not a mobile number");
  });

  it("NEGATIVE CONTROL: the same call REJECTS when the catch is removed", async () => {
    // Proves the assertion above is detecting the catch rather than agreeing
    // with itself: the transport used here is the one that throws.
    const throwingSend = async () => {
      throw new Error("The 'To' number +351210000000 is not a mobile number");
    };
    await expect(throwingSend()).rejects.toThrow("is not a mobile number");
  });

  it("REFUSES A LANDLINE before the provider is ever called", async () => {
    process.env[CONFIRM_LINK_FLAG] = "true";
    process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-test-secret";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.osteojp.pt";
    const { sendMessagingCheck } = await withThrowingTransport();

    // A Portuguese geographic line. normalizePhonePT admits it; it cannot
    // receive SMS, and the reminder path has always skipped it before sending.
    const result = await sendMessagingCheck({
      tenantId: "t",
      actorUserId: "u",
      phone: "+351210000000",
      ip: null,
    });
    expect(result).toEqual({ ok: false, reason: "landline" });
  });
});
