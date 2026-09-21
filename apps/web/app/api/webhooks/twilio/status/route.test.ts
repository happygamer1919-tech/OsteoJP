import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const recorded: Record<string, unknown>[] = [];
let resolvedTenant: string | null = "t1";
let signatureValid = true;
/** The tenant lookup itself faults, as opposed to finding no row. */
let resolverThrows = false;
/** The UPDATE this callback exists for faults. */
let ledgerThrows = false;
/** Every argument console.error was called with, for the rule-7 assertion. */
let errors: unknown[][] = [];

vi.mock("@/lib/reminders/dispatch-ledger", () => ({
  recordProviderStatus: async (a: Record<string, unknown>) => {
    if (ledgerThrows) throw new Error("db down");
    recorded.push(a);
  },
}));
vi.mock("@/lib/reminders/context", () => ({
  withReminderResolverContext: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      execute: async () => {
        if (resolverThrows) throw new Error("db down");
        return [{ tenant_id: resolvedTenant }];
      },
    }),
}));
vi.mock("@/lib/reminders/inbound-signature", () => ({
  signedRequestUrl: () => "https://example.test/api/webhooks/twilio/status",
  verifyTwilioSignature: () => signatureValid,
}));

/**
 * Closed over by the factory rather than named inside it: `./route` is imported
 * with a top-level await below, and a factory that referenced this const
 * directly would read it in the temporal dead zone. Same shape as
 * app/api/followup/contact/route.test.ts:24-29.
 */
const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...a: unknown[]) => captureMessage(...a),
  captureException: vi.fn(),
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
  resolverThrows = false;
  ledgerThrows = false;
  captureMessage.mockClear();
  errors = [];
  // This file had no console spy. The refusal paths below log, so without it
  // the run prints them, and nothing could assert what the line carries.
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
  process.env.TWILIO_AUTH_TOKEN = "token";
});

afterEach(() => {
  vi.restoreAllMocks();
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

  /**
   * THE TWO NULLS ARE NOT THE SAME NULL, and this arm is what keeps them apart.
   * A sid with no row is a settled fact and is answered 200 (the test above). A
   * lookup that FAILED settled nothing, and answering 200 for it would report a
   * success that did not happen and spend the one signal there is.
   */
  it("a tenant lookup that FAILS is a 500, not the 200 an unknown sid gets", async () => {
    resolverThrows = true;
    const r = await post({ MessageSid: "SM1", MessageStatus: "failed", ErrorCode: "30006" });
    expect(r.status).toBe(500);
    expect(recorded).toHaveLength(0);
    expect(captureMessage).toHaveBeenCalled();
  });

  it("a delivery status that could not be written is a 500", async () => {
    // The write is the whole reason this route exists. A row whose
    // provider_status stays NULL renders as the neutral "handed over" for ever
    // and never reaches the failures filter, so the answer is the one that
    // reports the failure rather than the one that reports a success. It claims
    // no redelivery; the route's header says what it does and does not buy.
    ledgerThrows = true;
    // A route that does not catch REJECTS here rather than refusing, which is
    // the same defect wearing a different coat - so the assertion is on the
    // settled value and not on a `.status` read after an unguarded await.
    const r = await post({ MessageSid: "SM1", MessageStatus: "undelivered" }).catch(
      (e: unknown) => e,
    );
    expect(r, "the route rejected instead of refusing").toBeInstanceOf(Response);
    expect((r as Response).status).toBe(500);
    expect(captureMessage).toHaveBeenCalled();
  });

  it("the refusal carries ids only — never the recipient the payload names", async () => {
    // A status payload carries the recipient's NUMBER. Neither the log line nor
    // the Sentry tags may repeat it (rule 7).
    ledgerThrows = true;
    await post({ MessageSid: "SM1", MessageStatus: "failed", To: "+351912345678" }).catch(
      () => undefined,
    );
    const logged = errors.map((a) => a.join(" ")).join("\n");
    expect(logged).toContain("SM1");
    expect(logged).not.toContain("912345678");
    const tags =
      (captureMessage.mock.calls[0]?.[1] as { tags?: Record<string, string> } | undefined)?.tags ??
      {};
    expect(Object.values(tags).join(" ")).not.toContain("912345678");
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
