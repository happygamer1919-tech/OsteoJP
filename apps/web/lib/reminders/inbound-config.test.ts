import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EnvSource } from "@osteojp/notify";

/**
 * SR-47 — the inbound capability arms on TWO independent conditions, and a
 * sender that is not E.164 is a hard refusal whatever the flag says.
 *
 * ==========================================================================
 * EVERY TEST RE-IMPORTS THE MODULE, AND THAT IS LOAD-BEARING
 * ==========================================================================
 * The refusal is reported ONCE PER BOOT, which is module state. A suite that
 * imported once would have exactly one test able to observe a report and every
 * later one silently asserting against a spent latch - a guard that cannot
 * fail. `vi.resetModules()` makes each test its own boot.
 */

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage }));

/** A real PT mobile shape. Never a real subscriber. */
const E164 = "+351210000000";
/** The live production sender. One-way: a handset cannot reply to it. */
const ALPHANUMERIC = "OsteoJP";
/** `MG` + 32 hex, Twilio's own id scheme. */
const SERVICE_SID = `MG${"0".repeat(32)}`;

let errors: unknown[][] = [];

async function boot(): Promise<(env?: EnvSource) => boolean> {
  vi.resetModules();
  captureMessage.mockClear();
  errors = [];
  const mod = await import("./inbound-config");
  return mod.remindersInboundEnabled;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The Sentry emit rides a dynamic import, so it lands a microtask later. */
async function sentryCalls(): Promise<number> {
  await vi.waitFor(() => {
    // Resolves as soon as the import chain has settled either way.
    expect(captureMessage.mock.calls.length).toBeGreaterThanOrEqual(0);
  });
  await new Promise((r) => setTimeout(r, 0));
  return captureMessage.mock.calls.length;
}

describe("remindersInboundEnabled — condition 1, the flag", () => {
  it("is OFF when the flag is unset, even with a replyable sender", async () => {
    const enabled = await boot();
    expect(enabled({ TWILIO_SMS_FROM: E164 })).toBe(false);
  });

  /**
   * THE NEGATIVE ARM OF "flag true plus E.164 sender arms": the SENDER ALONE
   * MUST NOT ARM IT. This is the defect SR-47 was ruled on - buying a number
   * and setting TWILIO_SMS_FROM is a change made for OUTBOUND reasons, and an
   * unauthenticated route that changes appointment status must not come up as
   * its side effect.
   */
  it("is OFF for every near-miss flag value while the sender IS E.164", async () => {
    const enabled = await boot();
    for (const v of ["false", "1", "yes", "TRUE", "True", " true", "true ", ""]) {
      expect(enabled({ REMINDERS_INBOUND: v, TWILIO_SMS_FROM: E164 })).toBe(false);
    }
  });

  it("reports nothing when the flag is off — an unarmed capability is not a mismatch", async () => {
    const enabled = await boot();
    enabled({ TWILIO_SMS_FROM: ALPHANUMERIC });
    enabled({ REMINDERS_INBOUND: "false", TWILIO_SMS_FROM: ALPHANUMERIC });
    expect(errors).toHaveLength(0);
    expect(await sentryCalls()).toBe(0);
  });
});

describe("remindersInboundEnabled — condition 2, the sender", () => {
  it("ARMS on the flag plus an E.164 sender", async () => {
    const enabled = await boot();
    expect(enabled({ REMINDERS_INBOUND: "true", TWILIO_SMS_FROM: E164 })).toBe(true);
  });

  /**
   * THE NEGATIVE ARM OF "flag true plus alphanumeric refuses and logs": the
   * reporting path must stay SILENT on the good configuration. A reporter that
   * fires on every call would make the refusal test pass for the wrong reason
   * and would page somebody about a working system.
   */
  it("reports NOTHING when it arms", async () => {
    const enabled = await boot();
    expect(enabled({ REMINDERS_INBOUND: "true", TWILIO_SMS_FROM: E164 })).toBe(true);
    expect(errors).toHaveLength(0);
    expect(await sentryCalls()).toBe(0);
  });

  it("REFUSES the flag against an alphanumeric sender, and says so", async () => {
    const enabled = await boot();
    expect(enabled({ REMINDERS_INBOUND: "true", TWILIO_SMS_FROM: ALPHANUMERIC })).toBe(false);

    expect(errors).toHaveLength(1);
    const line = String(errors[0]![0]);
    expect(line).toContain("REMINDERS_INBOUND");
    expect(line).toContain("alphanumeric");

    expect(await sentryCalls()).toBe(1);
    expect(captureMessage.mock.calls[0]![1]).toMatchObject({
      level: "warning",
      tags: { capability: "reminders-inbound", senderShape: "alphanumeric" },
    });
  });

  /**
   * THE SHAPE TRAVELS, THE VALUE NEVER DOES (PII rule 7). Asserted against the
   * whole emitted payload rather than the message alone, because a tag is just
   * as visible in Sentry as a message is.
   */
  it("never puts the sender VALUE in the log line or the Sentry payload", async () => {
    const enabled = await boot();
    enabled({ REMINDERS_INBOUND: "true", TWILIO_SMS_FROM: ALPHANUMERIC });
    await sentryCalls();

    const emitted = JSON.stringify([errors, captureMessage.mock.calls]);
    expect(emitted).not.toContain(ALPHANUMERIC);
  });

  /**
   * THE HARD REFUSAL, and it is the half of SR-47 that a flag could otherwise
   * undo. `senderCanReceiveReplies()` lets REMINDERS_REPLY_CAPABLE declare a
   * messaging service replyable, because its pool cannot be inspected. This
   * decision does not consult that function and does not read that flag: the
   * cost of a wrong "yes" here is an armed unauthenticated webhook.
   */
  it("REFUSES a messaging service, and REMINDERS_REPLY_CAPABLE cannot open it", async () => {
    const enabled = await boot();
    expect(
      enabled({
        REMINDERS_INBOUND: "true",
        TWILIO_MESSAGING_SERVICE_SID: SERVICE_SID,
        REMINDERS_REPLY_CAPABLE: "true",
      }),
    ).toBe(false);
    expect(await sentryCalls()).toBe(1);
    expect(captureMessage.mock.calls[0]![1]).toMatchObject({
      tags: { senderShape: "messaging_service" },
    });
  });

  it("REFUSES an MG service id pasted into TWILIO_SMS_FROM", async () => {
    const enabled = await boot();
    expect(enabled({ REMINDERS_INBOUND: "true", TWILIO_SMS_FROM: SERVICE_SID })).toBe(false);
  });

  /**
   * A numeric SHORT CODE can receive replies and is NOT E.164, and `sender.ts`
   * classifies one as alphanumeric on purpose. Pinned here so the narrower
   * reading stays a decision rather than becoming an accident.
   */
  it("REFUSES a numeric short code, because the rule is E.164 and not 'can receive'", async () => {
    const enabled = await boot();
    expect(enabled({ REMINDERS_INBOUND: "true", TWILIO_SMS_FROM: "12345" })).toBe(false);
  });

  it("REFUSES with no sender configured at all", async () => {
    const enabled = await boot();
    expect(enabled({ REMINDERS_INBOUND: "true" })).toBe(false);
    expect(await sentryCalls()).toBe(1);
    expect(captureMessage.mock.calls[0]![1]).toMatchObject({ tags: { senderShape: "none" } });
  });

  /** A blank sender is NOT a sender - `sender.ts` trims before the test. */
  it("REFUSES a TWILIO_SMS_FROM set to whitespace", async () => {
    const enabled = await boot();
    expect(enabled({ REMINDERS_INBOUND: "true", TWILIO_SMS_FROM: "   " })).toBe(false);
  });

  /** A value pasted with a trailing newline behaves as the value. */
  it("ARMS on an E.164 number pasted with surrounding whitespace", async () => {
    const enabled = await boot();
    expect(enabled({ REMINDERS_INBOUND: "true", TWILIO_SMS_FROM: `  ${E164}\n` })).toBe(true);
  });
});

describe("remindersInboundEnabled — the report is once per boot", () => {
  it("emits ONCE however many times the misconfiguration is read", async () => {
    const enabled = await boot();
    const env = { REMINDERS_INBOUND: "true", TWILIO_SMS_FROM: ALPHANUMERIC };
    for (let i = 0; i < 5; i += 1) expect(enabled(env)).toBe(false);

    expect(errors).toHaveLength(1);
    expect(await sentryCalls()).toBe(1);
  });

  it("emits again on a fresh boot — the latch is per process, not forever", async () => {
    const first = await boot();
    first({ REMINDERS_INBOUND: "true", TWILIO_SMS_FROM: ALPHANUMERIC });
    expect(errors).toHaveLength(1);
    // DRAINED BEFORE THE NEXT BOOT. The emit rides a dynamic import, so a
    // first-boot report still in flight would land after the counter is reset
    // and be counted against the SECOND boot - which would fail this test for
    // a reason that has nothing to do with the latch.
    expect(await sentryCalls()).toBe(1);

    const second = await boot();
    second({ REMINDERS_INBOUND: "true", TWILIO_SMS_FROM: ALPHANUMERIC });
    expect(errors).toHaveLength(1);
    expect(await sentryCalls()).toBe(1);
  });
});

describe("remindersInboundEnabled — the shape its two readers actually call", () => {
  /**
   * Both call sites - `app/api/webhooks/twilio/inbound/route.ts` and
   * `app/reminders/review/page.tsx` - call it with NO ARGUMENT, so the default
   * `process.env` path is the one that runs in production and it is tested
   * rather than assumed.
   */
  it("reads process.env when called with no argument", async () => {
    const enabled = await boot();
    const before = { flag: process.env.REMINDERS_INBOUND, from: process.env.TWILIO_SMS_FROM };
    try {
      process.env.REMINDERS_INBOUND = "true";
      process.env.TWILIO_SMS_FROM = ALPHANUMERIC;
      expect(enabled()).toBe(false);

      process.env.TWILIO_SMS_FROM = E164;
      expect(enabled()).toBe(true);
    } finally {
      if (before.flag === undefined) delete process.env.REMINDERS_INBOUND;
      else process.env.REMINDERS_INBOUND = before.flag;
      if (before.from === undefined) delete process.env.TWILIO_SMS_FROM;
      else process.env.TWILIO_SMS_FROM = before.from;
    }
  });
});
