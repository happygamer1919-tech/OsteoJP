/**
 * W13-03 — the OTP transport boundary. PG1.
 *
 * Covers the LOOP 3 DoD line "a test proves the Twilio adapter is not invoked
 * with the flag off, and the test sink is", plus the properties that make the
 * boundary worth having: nothing above it knows about Twilio, the flag defaults
 * OFF, env failure on the armed path is LOUD, and neither the code nor the phone
 * number is ever logged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const twilioCreate = vi.fn();
const twilioFactory = vi.fn();

vi.mock("twilio", () => ({
  default: (...args: unknown[]) => {
    twilioFactory(...args);
    return { messages: { create: twilioCreate } };
  },
}));

import {
  createOtpTestSink,
  createTwilioOtpTransport,
  otpLiveSendEnabled,
  otpMessageBody,
  resolveOtpTransport,
} from "./otp-transport";

const ENV_KEYS = [
  "OTP_LIVE_SEND",
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

function armCreds(): void {
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "tok_test";
  process.env.TWILIO_SMS_FROM = "OsteoJP";
}

describe("the flag defaults OFF and demands the exact string", () => {
  it("is off with nothing set", () => {
    expect(otpLiveSendEnabled({})).toBe(false);
  });

  it("refuses TRUE, 1 and yes — only the exact string true arms it", () => {
    for (const v of ["TRUE", "True", "1", "yes", "on", " true"]) {
      expect(otpLiveSendEnabled({ OTP_LIVE_SEND: v })).toBe(false);
    }
    expect(otpLiveSendEnabled({ OTP_LIVE_SEND: "true" })).toBe(true);
  });
});

describe("with the flag OFF the sink runs and Twilio is never touched", () => {
  it("resolves to a sink that captures the code and sends nothing", async () => {
    // Credentials deliberately PRESENT: the flag alone must decide, so that a
    // fully-configured deployment still sends nothing until it is armed.
    armCreds();

    const transport = resolveOtpTransport({});
    const res = await transport.send("+351912345678", "123456");

    expect(res.delivered).toBe(false);
    expect(res.id).toMatch(/^sink:otp:/);
    expect(twilioFactory).not.toHaveBeenCalled();
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  it("the sink records what was issued, so a test never needs the database", async () => {
    const sink = createOtpTestSink();
    await sink.send("+351912345678", "111111");
    await sink.send("+351999888777", "222222");

    expect(sink.sent).toEqual([
      { to: "+351912345678", code: "111111" },
      { to: "+351999888777", code: "222222" },
    ]);
    sink.reset();
    expect(sink.sent).toEqual([]);
  });

  it("each sink is independent, so suites cannot leak codes into each other", async () => {
    const a = createOtpTestSink();
    const b = createOtpTestSink();
    await a.send("+351912345678", "123456");
    expect(b.sent).toEqual([]);
  });
});

describe("with the flag ON the adapter is used", () => {
  it("resolves to the Twilio adapter and sends the code", async () => {
    armCreds();
    twilioCreate.mockResolvedValue({ sid: "SM_otp" });

    const transport = resolveOtpTransport({ OTP_LIVE_SEND: "true" });
    const res = await transport.send("+351912345678", "123456");

    expect(twilioFactory).toHaveBeenCalledWith("AC_test", "tok_test");
    expect(twilioCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+351912345678", from: "OsteoJP" }),
    );
    expect(res).toEqual({ delivered: true, id: "SM_otp" });
  });

  it("falls back to the messaging service sid when no sms-from is set", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "tok_test";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_test";
    twilioCreate.mockResolvedValue({ sid: "SM_mg" });

    await createTwilioOtpTransport().send("+351912345678", "123456");

    expect(twilioCreate).toHaveBeenCalledWith(expect.objectContaining({ from: "MG_test" }));
  });
});

describe("env failure on the armed path is LOUD, never a silent no-op", () => {
  it.each([
    ["TWILIO_ACCOUNT_SID", () => { process.env.TWILIO_AUTH_TOKEN = "t"; process.env.TWILIO_SMS_FROM = "f"; }],
    ["TWILIO_AUTH_TOKEN", () => { process.env.TWILIO_ACCOUNT_SID = "s"; process.env.TWILIO_SMS_FROM = "f"; }],
    ["a sender", () => { process.env.TWILIO_ACCOUNT_SID = "s"; process.env.TWILIO_AUTH_TOKEN = "t"; }],
  ])("throws when %s is missing, rather than reporting not-delivered", async (_name, setup) => {
    setup();
    // A login code that silently never sends is indistinguishable to the patient
    // from a wrong phone number, and the clinic debugs the wrong thing.
    await expect(createTwilioOtpTransport().send("+351912345678", "123456")).rejects.toThrow(
      /OTP_LIVE_SEND is armed but the transport is not configured/,
    );
    expect(twilioFactory).not.toHaveBeenCalled();
  });

  it("names the variables and never prints a value", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_secret_value";

    const err = await createTwilioOtpTransport()
      .send("+351912345678", "123456")
      .then(() => null)
      .catch((e: unknown) => e as Error);

    expect(err).toBeInstanceOf(Error);
    // It must say WHICH names are missing, so a misconfigured deploy is fixed in
    // one pass...
    expect(err!.message).toContain("TWILIO_AUTH_TOKEN");
    // ...and it must never echo a value it was handed. An env value in an error
    // message ends up in a log aggregator and in a screenshot.
    expect(err!.message).not.toContain("AC_secret_value");
    expect(err!.message).not.toContain("123456");
    expect(err!.message).not.toContain("+351912345678");
  });
});

describe("the message body reveals nothing beyond the code", () => {
  const body = otpMessageBody("123456");

  it("carries the code and the clinic name", () => {
    expect(body).toContain("123456");
    expect(body).toContain("OsteoJP");
  });

  it("carries anti-phishing copy, because the standard attack is a phone call", () => {
    expect(body).toContain("nunca lhe pede este codigo por telefone");
  });

  it("names no patient, no appointment, no link", () => {
    // An SMS arriving at a phone the attacker controls must not reveal whose
    // account it is or what the clinic knows about them.
    for (const leak of ["http", "://", "consulta", "marcacao", "@"]) {
      expect(body.toLowerCase()).not.toContain(leak);
    }
  });
});

describe("PII rule 7: neither the code nor the phone is ever logged", () => {
  it("the sink path logs nothing at all", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await resolveOtpTransport({}).send("+351912345678", "123456");
      const all = [...info.mock.calls, ...warn.mock.calls, ...error.mock.calls]
        .flat()
        .map(String)
        .join(" ");
      expect(all).not.toContain("123456");
      expect(all).not.toContain("+351912345678");
    } finally {
      info.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("the module source contains no console call on the code path", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "otp-transport.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // Not a style rule: any log line in this module would sit one careless
    // template literal away from carrying an OTP or a patient's phone number.
    expect(src).not.toContain("console.");
  });
});
