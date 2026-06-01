import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveSendEnabled, sendEmail, sendSms } from "./clients";

// Mock the provider SDKs so we can prove the sandbox path never constructs or
// calls them — i.e. zero network. The mocks are also used to verify the live
// path wires the SDK correctly, still without a real network call.

const resendSend = vi.fn();
const twilioCreate = vi.fn();
const ResendCtor = vi.fn();
const twilioFactory = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
    constructor(...args: unknown[]) {
      ResendCtor(...args);
    }
  },
}));

vi.mock("twilio", () => ({
  default: (...args: unknown[]) => {
    twilioFactory(...args);
    return { messages: { create: twilioCreate } };
  },
}));

const ENV_KEYS = [
  "REMINDERS_LIVE_SEND",
  "RESEND_API_KEY",
  "REMINDERS_EMAIL_FROM",
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
  resendSend.mockReset();
  twilioCreate.mockReset();
  ResendCtor.mockReset();
  twilioFactory.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("sandbox mode (default — zero network)", () => {
  it("liveSendEnabled is false unless REMINDERS_LIVE_SEND === 'true'", () => {
    expect(liveSendEnabled()).toBe(false);
    process.env.REMINDERS_LIVE_SEND = "false";
    expect(liveSendEnabled()).toBe(false);
    process.env.REMINDERS_LIVE_SEND = "1";
    expect(liveSendEnabled()).toBe(false);
    process.env.REMINDERS_LIVE_SEND = "true";
    expect(liveSendEnabled()).toBe(true);
  });

  it("sendEmail returns a sandbox result and never touches Resend", async () => {
    const res = await sendEmail({ to: "p@example.com", subject: "s", body: "b" });
    expect(res).toEqual({ channel: "email", sandbox: true, id: "sandbox:email" });
    expect(ResendCtor).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("sendSms returns a sandbox result and never touches Twilio", async () => {
    const res = await sendSms({ to: "+351900000000", body: "b" });
    expect(res).toEqual({ channel: "sms", sandbox: true, id: "sandbox:sms" });
    expect(twilioFactory).not.toHaveBeenCalled();
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  it("stays in sandbox even with keys present when live flag is off", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_SMS_FROM = "+351900000001";
    await sendEmail({ to: "p@example.com", subject: "s", body: "b" });
    await sendSms({ to: "+351900000000", body: "b" });
    expect(ResendCtor).not.toHaveBeenCalled();
    expect(twilioFactory).not.toHaveBeenCalled();
  });

  it("stays in sandbox when live flag is on but keys are missing", async () => {
    process.env.REMINDERS_LIVE_SEND = "true"; // no keys set
    const e = await sendEmail({ to: "p@example.com", subject: "s", body: "b" });
    const s = await sendSms({ to: "+351900000000", body: "b" });
    expect(e.sandbox).toBe(true);
    expect(s.sandbox).toBe(true);
    expect(ResendCtor).not.toHaveBeenCalled();
    expect(twilioFactory).not.toHaveBeenCalled();
  });
});

describe("live mode (mocked SDKs — verifies wiring, no real network)", () => {
  beforeEach(() => {
    process.env.REMINDERS_LIVE_SEND = "true";
    process.env.RESEND_API_KEY = "re_test";
    process.env.REMINDERS_EMAIL_FROM = "reminders@osteojp.pt";
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_SMS_FROM = "+351900000001";
  });

  it("constructs Resend with the key and sends text email", async () => {
    resendSend.mockResolvedValue({ data: { id: "email_123" }, error: null });
    const res = await sendEmail({ to: "p@example.com", subject: "Hi", body: "Body" });
    expect(ResendCtor).toHaveBeenCalledWith("re_test");
    expect(resendSend).toHaveBeenCalledWith({
      from: "reminders@osteojp.pt",
      to: "p@example.com",
      subject: "Hi",
      text: "Body",
    });
    expect(res).toEqual({ channel: "email", sandbox: false, id: "email_123" });
  });

  it("surfaces a Resend error as a thrown error", async () => {
    resendSend.mockResolvedValue({ data: null, error: { name: "validation_error" } });
    await expect(
      sendEmail({ to: "p@example.com", subject: "Hi", body: "Body" }),
    ).rejects.toThrow(/Resend send failed/);
  });

  it("constructs Twilio with creds and creates the message", async () => {
    twilioCreate.mockResolvedValue({ sid: "SM_123" });
    const res = await sendSms({ to: "+351900000000", body: "Body" });
    expect(twilioFactory).toHaveBeenCalledWith("AC_test", "tok");
    expect(twilioCreate).toHaveBeenCalledWith({
      to: "+351900000000",
      from: "+351900000001",
      body: "Body",
    });
    expect(res).toEqual({ channel: "sms", sandbox: false, id: "SM_123" });
  });
});
