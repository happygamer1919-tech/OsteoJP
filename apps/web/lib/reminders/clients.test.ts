import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveSendEnabled, sendEmail, sendSms, createSender } from "./clients";

// Transport-behaviour tests need an APPROVED template to reach a provider at all
// — the real bodies are approved:false by ruling and stay that way. This fixture
// approves the same entries so payload/normalization/error assertions still
// exercise the real adapter. Refusal of the REAL registry is asserted in
// notification-registry.test.ts.
import { buildRegistry } from "@osteojp/notify";
import { WEB_TEMPLATES } from "./notification-registry";
const approvedSender = createSender(
  buildRegistry(
    WEB_TEMPLATES.map((t) => ({ ...t, approved: true, approvedBy: "test fixture", approvedAt: "2026-08-03" })),
  ),
);

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
  // INC-12: the env assertion runs inside dispatch now, so these two are part
  // of what an armed stream requires and must be saved/restored like the rest.
  "REMINDERS_RESCHEDULE_BASE_URL",
  "REMINDERS_LINK_SECRET",
] as const;

/**
 * Armed AND complete. Every "live mode" case below means both halves.
 * Placeholders; no real credential appears in this repo.
 */
function armComplete(): void {
  process.env.REMINDERS_LIVE_SEND = "true";
  process.env.RESEND_API_KEY = "re_test";
  process.env.REMINDERS_EMAIL_FROM = "reminders@osteojp.pt";
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "tok";
  process.env.TWILIO_SMS_FROM = "+351900000001";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://example.test";
  process.env.REMINDERS_LINK_SECRET = "test";
}

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
    const res = await approvedSender.sendEmail({ to: "p@example.com", subject: "s", body: "b", templateId: "confirmation.email" });
    expect(res).toEqual({ channel: "email", sandbox: true, id: "sandbox:email" });
    expect(ResendCtor).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("sendSms returns a sandbox result and never touches Twilio", async () => {
    const res = await approvedSender.sendSms({ to: "+351900000000", body: "b", templateId: "confirmation.sms" });
    expect(res).toEqual({ channel: "sms", sandbox: true, id: "sandbox:sms" });
    expect(twilioFactory).not.toHaveBeenCalled();
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  it("stays in sandbox even with keys present when live flag is off", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_SMS_FROM = "+351900000001";
    await approvedSender.sendEmail({ to: "p@example.com", subject: "s", body: "b", templateId: "confirmation.email" });
    await approvedSender.sendSms({ to: "+351900000000", body: "b", templateId: "confirmation.sms" });
    expect(ResendCtor).not.toHaveBeenCalled();
    expect(twilioFactory).not.toHaveBeenCalled();
  });

  /**
   * INC-12 CHANGED THIS CASE, AND IT PREVIOUSLY DESCRIBED A STATE THAT COULD
   * NOT REACH PRODUCTION.
   *
   * It used to read "stays in sandbox when live flag is on but keys are
   * missing" and expect `sandbox: true` with reason `missing_provider_config`.
   * That was true of the code and false of any deployment: `clients.ts`
   * asserted the same variables at MODULE SCOPE, so an armed deploy with no
   * keys never booted far enough to dispatch anything. The suppression branch
   * was unreachable while armed.
   *
   * Now the assertion lives in `dispatch`, so this state is reachable and it
   * THROWS. That is the whole point: a broken deploy must not write the same
   * log line a healthy sandbox deploy writes.
   *
   * `missing_provider_config` is NOT dead - it still guards a notifier built
   * with an injected `transportConfigured` (see packages/notify gate tests),
   * which is how the branch is exercised without pretending an impossible
   * environment is possible.
   */
  it("THROWS rather than degrading to sandbox when armed with no keys", async () => {
    process.env.REMINDERS_LIVE_SEND = "true"; // no keys set

    await expect(
      approvedSender.sendEmail({ to: "p@example.com", subject: "s", body: "b", templateId: "confirmation.email" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
    await expect(
      approvedSender.sendSms({ to: "+351900000000", body: "b", templateId: "confirmation.sms" }),
    ).rejects.toThrow(/TWILIO_ACCOUNT_SID/);

    // The throw is not a partial send: no SDK was constructed either way.
    expect(ResendCtor).not.toHaveBeenCalled();
    expect(twilioFactory).not.toHaveBeenCalled();
  });
});

describe("dry-run intent logging (PII-safe)", () => {
  it("logs channel + reason and NEVER the recipient/subject/body", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await approvedSender.sendEmail({ to: "patient@example.com", subject: "Secret subject", body: "Secret body", templateId: "confirmation.email" });
      await approvedSender.sendSms({ to: "+351912345678", body: "Secret sms body", templateId: "confirmation.sms" });

      const lines = info.mock.calls.map((c) => String(c[0]));
      expect(lines).toContain(
        "[notify] suppressed template=confirmation.email channel=email appointment=- reason=live_send_disabled",
      );
      expect(lines).toContain(
        "[notify] suppressed template=confirmation.sms channel=sms appointment=- reason=live_send_disabled",
      );

      const all = lines.join("\n");
      expect(all).not.toMatch(/patient@example\.com/);
      expect(all).not.toMatch(/\+351912345678/);
      expect(all).not.toMatch(/Secret/);
    } finally {
      info.mockRestore();
    }
  });

  /**
   * INC-12: the twin of the case above, and it matters for the same reason.
   * An armed deploy with no keys must NOT write a suppression line - a
   * suppression line is what a healthy sandbox deploy writes, so the two
   * would be indistinguishable in the Vercel logs. It throws instead, naming
   * the missing variables.
   */
  it("writes NO suppression line when armed with no keys - it throws", async () => {
    process.env.REMINDERS_LIVE_SEND = "true"; // no provider keys set
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await expect(
        approvedSender.sendEmail({ to: "p@example.com", subject: "s", body: "b", templateId: "confirmation.email" }),
      ).rejects.toThrow(/notification path is armed/);

      const lines = info.mock.calls.map((c) => String(c[0]));
      expect(lines.join("\n")).not.toMatch(/missing_provider_config/);
    } finally {
      info.mockRestore();
    }
  });
});

describe("live mode (mocked SDKs — verifies wiring, no real network)", () => {
  beforeEach(() => {
    armComplete();
  });

  it("constructs Resend with the key and sends text email", async () => {
    resendSend.mockResolvedValue({ data: { id: "email_123" }, error: null });
    const res = await approvedSender.sendEmail({ to: "p@example.com", subject: "Hi", body: "Body", templateId: "confirmation.email" });
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
      approvedSender.sendEmail({ to: "p@example.com", subject: "Hi", body: "Body", templateId: "confirmation.email" }),
    ).rejects.toThrow(/Resend send failed/);
  });

  it("constructs Twilio with creds and creates the message", async () => {
    twilioCreate.mockResolvedValue({ sid: "SM_123" });
    const res = await approvedSender.sendSms({ to: "+351900000000", body: "Body", templateId: "confirmation.sms" });
    expect(twilioFactory).toHaveBeenCalledWith("AC_test", "tok");
    expect(twilioCreate).toHaveBeenCalledWith({
      to: "+351900000000",
      from: "+351900000001",
      body: "Body",
    });
    expect(res).toEqual({ channel: "sms", sandbox: false, id: "SM_123" });
  });
});
