import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveSendEnabled, sendSms } from "./clients";

// Twilio wiring proof for the patient-activation notify path (qa/twilio-proof).
// This module mirrors apps/web/lib/reminders/clients.ts and previously had NO
// tests. Same concerns, same mock pattern: the launch gate, the exact payload
// handed to the Twilio SDK (sender resolution), and 4xx/5xx propagation.

const twilioCreate = vi.fn();
const twilioFactory = vi.fn();

vi.mock("twilio", () => ({
  default: (...args: unknown[]) => {
    twilioFactory(...args);
    return { messages: { create: twilioCreate } };
  },
}));

const ENV_KEYS = [
  "REMINDERS_LIVE_SEND",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_SMS_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  twilioCreate.mockReset();
  twilioFactory.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function armLiveCreds(): void {
  process.env.REMINDERS_LIVE_SEND = "true";
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "tok_test";
}

describe("launch gate (shared REMINDERS_LIVE_SEND switch)", () => {
  it("liveSendEnabled requires the exact string 'true'", () => {
    expect(liveSendEnabled()).toBe(false);
    process.env.REMINDERS_LIVE_SEND = "TRUE";
    expect(liveSendEnabled()).toBe(false);
    process.env.REMINDERS_LIVE_SEND = "true";
    expect(liveSendEnabled()).toBe(true);
  });

  it("gate off + full creds: sandbox result, Twilio never constructed", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "tok_test";
    process.env.TWILIO_SMS_FROM = "OsteoJP";

    const res = await sendSms({ to: "+351912345678", body: "b" });

    expect(res).toEqual({ channel: "sms", sandbox: true, id: "sandbox:sms" });
    expect(twilioFactory).not.toHaveBeenCalled();
  });

  it("gate on + missing creds: sandbox result, Twilio never constructed", async () => {
    process.env.REMINDERS_LIVE_SEND = "true";
    const res = await sendSms({ to: "+351912345678", body: "b" });
    expect(res.sandbox).toBe(true);
    expect(twilioFactory).not.toHaveBeenCalled();
  });
});

describe("live payload — sender resolution matches the reminders path", () => {
  it("uses the alphanumeric sender from TWILIO_SMS_FROM as `from`", async () => {
    armLiveCreds();
    process.env.TWILIO_SMS_FROM = "OsteoJP";
    twilioCreate.mockResolvedValue({ sid: "SM_act" });

    const res = await sendSms({ to: "+351912345678", body: "b" });

    expect(twilioFactory).toHaveBeenCalledWith("AC_test", "tok_test");
    expect(twilioCreate).toHaveBeenCalledWith({
      to: "+351912345678",
      from: "OsteoJP",
      body: "b",
    });
    expect(res).toEqual({ channel: "sms", sandbox: false, id: "SM_act" });
  });

  it("falls back to TWILIO_MESSAGING_SERVICE_SID when TWILIO_SMS_FROM is unset", async () => {
    armLiveCreds();
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_test";
    twilioCreate.mockResolvedValue({ sid: "SM_mg" });

    await sendSms({ to: "+351912345678", body: "b" });

    expect(twilioCreate).toHaveBeenCalledWith(
      expect.objectContaining({ from: "MG_test" }),
    );
  });
});

describe("E.164 normalization (phone.ts mirror) runs inside sendSms", () => {
  // Full format coverage lives in apps/web/lib/reminders/phone.test.ts (the
  // canonical copy); this proves the mirrored util is wired at this boundary.
  beforeEach(() => {
    armLiveCreds();
    process.env.TWILIO_SMS_FROM = "OsteoJP";
    twilioCreate.mockResolvedValue({ sid: "SM_norm" });
  });

  it("normalizes stored formats to E.164 before messages.create", async () => {
    await sendSms({ to: "912 345 678", body: "b" });
    await sendSms({ to: "00351912345678", body: "b" });
    expect(twilioCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ to: "+351912345678" }),
    );
    expect(twilioCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: "+351912345678" }),
    );
  });

  it("skips invalid numbers: skip result, Twilio never called, number never logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await sendSms({ to: "not-a-phone", body: "b" });
      expect(res).toEqual({ channel: "sms", sandbox: true, id: "skipped:invalid_phone" });
      expect(twilioFactory).not.toHaveBeenCalled();
      const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toContain("invalid_phone");
      expect(logged).not.toContain("not-a-phone");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("Twilio API errors propagate", () => {
  it("rejects on 4xx and on 5xx instead of returning a fake success", async () => {
    armLiveCreds();
    process.env.TWILIO_SMS_FROM = "OsteoJP";

    twilioCreate.mockRejectedValueOnce(
      Object.assign(new Error("invalid To"), { status: 400, code: 21211 }),
    );
    await expect(sendSms({ to: "912345678", body: "b" })).rejects.toMatchObject({
      status: 400,
      code: 21211,
    });

    twilioCreate.mockRejectedValueOnce(
      Object.assign(new Error("server error"), { status: 500 }),
    );
    await expect(sendSms({ to: "+351912345678", body: "b" })).rejects.toMatchObject({
      status: 500,
    });
  });
});
