import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const recorded: Record<string, unknown>[] = [];
let resolvedTenant: string | null = "t1";
let signatureValid = true;

vi.mock("@/lib/reminders/dispatch-ledger", () => ({
  recordProviderStatus: async (a: Record<string, unknown>) => void recorded.push(a),
}));
vi.mock("@/lib/reminders/context", () => ({
  withReminderResolverContext: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: async () => [{ tenant_id: resolvedTenant }] }),
}));
vi.mock("@/lib/reminders/inbound-signature", () => ({
  signedRequestUrl: () => "https://example.test/api/webhooks/twilio/status",
  verifyTwilioSignature: () => signatureValid,
}));

const { POST } = await import("./route");

const post = (body: Record<string, string>) =>
  POST(
    new Request("https://example.test/api/webhooks/twilio/status", {
      method: "POST",
      headers: { "x-twilio-signature": "sig", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    }) as never,
  );

beforeEach(() => {
  recorded.length = 0;
  resolvedTenant = "t1";
  signatureValid = true;
  process.env.TWILIO_AUTH_TOKEN = "token";
});

describe("POST /api/webhooks/twilio/status", () => {
  it("records the delivery status against the sid Twilio names", async () => {
    const r = await post({ MessageSid: "SM1", MessageStatus: "delivered" });
    expect(r.status).toBe(200);
    expect(recorded[0]).toMatchObject({
      tenantId: "t1",
      providerMessageId: "SM1",
      providerStatus: "delivered",
    });
  });

  it("carries the provider error code through on a failure", async () => {
    await post({ MessageSid: "SM1", MessageStatus: "failed", ErrorCode: "30006" });
    expect(recorded[0]).toMatchObject({ providerErrorCode: "30006" });
  });

  it("REFUSES an unsigned or wrongly-signed callback, and records nothing", async () => {
    signatureValid = false;
    const r = await post({ MessageSid: "SM1", MessageStatus: "delivered" });
    expect(r.status).toBe(403);
    expect(recorded).toHaveLength(0);
  });

  /**
   * THE TENANT COMES FROM A VALUE WE WROTE. A forged sid resolves to nothing,
   * so it updates nothing — rather than naming a tenant of its own choosing,
   * which is what taking it from the payload would allow.
   */
  it("a sid we have no row for is a 200 that records nothing, not a retry loop", async () => {
    resolvedTenant = null;
    const r = await post({ MessageSid: "SM-unknown", MessageStatus: "delivered" });
    expect(r.status).toBe(200);
    expect(recorded).toHaveLength(0);
  });

  it("fails CLOSED and records nothing when the auth token is absent", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const r = await post({ MessageSid: "SM1", MessageStatus: "delivered" });
    expect(r.status).toBe(503);
    expect(recorded).toHaveLength(0);
  });

  it("refuses a SIGNED callback missing the two fields it is defined to carry", async () => {
    const r = await post({ MessageSid: "SM1" });
    expect(r.status).toBe(400);
    expect(recorded).toHaveLength(0);
  });

  it("accepts the legacy SmsSid / SmsStatus spelling", async () => {
    await post({ SmsSid: "SM9", SmsStatus: "sent" });
    expect(recorded[0]).toMatchObject({ providerMessageId: "SM9", providerStatus: "sent" });
  });
});
