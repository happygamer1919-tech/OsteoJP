/**
 * Item 4 DoD: boot validation names every missing var, and passing env boots.
 *
 * The rule under test: while every live-send flag is off, the notification path
 * is inert and requires nothing — that is what keeps dev, CI and preview builds
 * working. The moment a flag is armed, every var the path needs becomes required
 * and a missing one fails at BOOT with the full list, not one at a time at send
 * time on a real patient's reminder.
 */
import { describe, it, expect } from "vitest";
import {
  assertNotificationEnv,
  missingNotificationEnv,
  NotificationEnvError,
  REQUIRED_WHEN_LIVE,
  TWILIO_SENDER_ONE_OF,
} from "./env";

const FLAGS = ["REMINDERS_LIVE_SEND", "INVITES_LIVE_SEND"];

/** Every name the armed notification path needs, with placeholder values. */
const COMPLETE = {
  REMINDERS_LIVE_SEND: "true",
  RESEND_API_KEY: "test-key",
  REMINDERS_EMAIL_FROM: "reminders@send.osteojp.pt",
  REMINDERS_RESCHEDULE_BASE_URL: "https://app.osteojp.pt",
  REMINDERS_LINK_SECRET: "test-secret",
  TWILIO_ACCOUNT_SID: "AC_test",
  TWILIO_AUTH_TOKEN: "tok_test",
  TWILIO_SMS_FROM: "OsteoJP",
};

describe("unarmed: the path requires nothing", () => {
  it("passes with a completely empty env", () => {
    expect(() => assertNotificationEnv(FLAGS, {})).not.toThrow();
    expect(missingNotificationEnv(FLAGS, {})).toEqual([]);
  });

  it("passes when a flag is present but not exactly \"true\"", () => {
    for (const v of ["false", "1", "TRUE", "yes", ""]) {
      expect(missingNotificationEnv(FLAGS, { REMINDERS_LIVE_SEND: v })).toEqual([]);
    }
  });

  it("arms on INVITES_LIVE_SEND alone, not only on REMINDERS_LIVE_SEND", () => {
    expect(missingNotificationEnv(FLAGS, { INVITES_LIVE_SEND: "true" }).length).toBeGreaterThan(0);
  });
});

describe("armed: boot fails loudly, naming every missing var at once", () => {
  it("throws NotificationEnvError with an empty env", () => {
    expect(() => assertNotificationEnv(FLAGS, { REMINDERS_LIVE_SEND: "true" })).toThrow(
      NotificationEnvError,
    );
  });

  it("names EVERY missing var, not just the first", () => {
    const missing = missingNotificationEnv(FLAGS, { REMINDERS_LIVE_SEND: "true" });

    for (const name of [
      ...REQUIRED_WHEN_LIVE.email,
      ...REQUIRED_WHEN_LIVE.sms,
      ...REQUIRED_WHEN_LIVE.links,
    ]) {
      expect(missing).toContain(name);
    }
    // One-of pairs are reported as a choice, not as two separate requirements.
    expect(missing.some((m) => m.includes(TWILIO_SENDER_ONE_OF[0]))).toBe(true);
  });

  it("puts the full list in the thrown message, so one fix pass is enough", () => {
    try {
      assertNotificationEnv(FLAGS, { REMINDERS_LIVE_SEND: "true" });
      throw new Error("expected assertNotificationEnv to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(NotificationEnvError);
      const msg = (e as NotificationEnvError).message;
      expect(msg).toContain("RESEND_API_KEY");
      expect(msg).toContain("REMINDERS_EMAIL_FROM");
      expect(msg).toContain("REMINDERS_RESCHEDULE_BASE_URL");
      expect(msg).toContain("REMINDERS_LINK_SECRET");
      expect(msg).toContain("TWILIO_ACCOUNT_SID");
      expect(msg).toContain("TWILIO_AUTH_TOKEN");
    }
  });

  it("reports only what is actually missing", () => {
    const { RESEND_API_KEY: _omitted, ...withoutResendKey } = COMPLETE;
    expect(missingNotificationEnv(FLAGS, withoutResendKey)).toEqual(["RESEND_API_KEY"]);
  });

  it("treats a blank or whitespace value as missing, not as set", () => {
    expect(missingNotificationEnv(FLAGS, { ...COMPLETE, REMINDERS_EMAIL_FROM: "   " })).toEqual([
      "REMINDERS_EMAIL_FROM",
    ]);
  });

  it("accepts either Twilio sender form", () => {
    const { TWILIO_SMS_FROM: _unused, ...noSmsFrom } = COMPLETE;
    expect(
      missingNotificationEnv(FLAGS, { ...noSmsFrom, TWILIO_MESSAGING_SERVICE_SID: "MG_test" }),
    ).toEqual([]);
  });

  it("reports the sender choice when NEITHER form is set", () => {
    const { TWILIO_SMS_FROM: _unused, ...noSender } = COMPLETE;
    const missing = missingNotificationEnv(FLAGS, noSender);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain("TWILIO_SMS_FROM");
    expect(missing[0]).toContain("TWILIO_MESSAGING_SERVICE_SID");
  });
});

describe("armed and complete: boot passes", () => {
  it("does not throw when every name is present with a placeholder value", () => {
    expect(() => assertNotificationEnv(FLAGS, COMPLETE)).not.toThrow();
    expect(missingNotificationEnv(FLAGS, COMPLETE)).toEqual([]);
  });

  it("never puts a VALUE in the error message, only names", () => {
    const { RESEND_API_KEY: _omitted, ...withoutResendKey } = COMPLETE;
    try {
      assertNotificationEnv(FLAGS, withoutResendKey);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("test-secret");
      expect(msg).not.toContain("tok_test");
      expect(msg).not.toContain("AC_test");
    }
  });
});
