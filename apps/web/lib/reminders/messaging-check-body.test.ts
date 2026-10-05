/**
 * THE PREVIEW ON THE OWNER'S SCREEN IS THE MESSAGE THE SEND SENDS.
 *
 * `/admin/messaging-check` shows the body before the owner presses anything.
 * A preview assembled beside the send, rather than by it, is a second message:
 * it can drift, and then the screen shows a text nobody receives. So the
 * equality is asserted on the two real entry points - `previewMessagingCheck`,
 * which the page calls, and `sendMessagingCheck`, with the body it actually
 * handed to the transport - and not on the builder they share.
 *
 * The only difference allowed is the eight characters of the code, which the
 * send draws at random and the preview cannot know.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CONFIRM_CODE_LENGTH, CONFIRM_CODE_SECRET_VAR, CONFIRM_LINK_FLAG } from "./confirm-code";
import {
  MESSAGING_CHECK_PREVIEW_CODE,
  messagingCheckSampleContext,
  previewMessagingCheck,
  smsSegments,
} from "./messaging-check-body";
import { SMS_SEGMENT_LIMIT } from "./templates";

/** `.invalid` is reserved (RFC 2606): no test names a host that could answer. */
const BASE = "https://app.x.invalid";
/** The approved one-way sender. */
const ONE_WAY = { REMINDERS_RESCHEDULE_BASE_URL: BASE, TWILIO_SMS_FROM: "OsteoJP" };

describe("the preview, on its own", () => {
  it("is a body, with its length and its segment count", () => {
    const preview = previewMessagingCheck(ONE_WAY);
    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error("unreachable");
    expect(preview.length).toBe(preview.body.length);
    expect(preview.limit).toBe(SMS_SEGMENT_LIMIT);
    expect(preview.segments).toBe(1);
    expect(preview.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
  });

  it("carries the sample appointment and the placeholder code, and no real code", () => {
    const preview = previewMessagingCheck(ONE_WAY);
    if (!preview.ok) throw new Error("unreachable");
    const ctx = messagingCheckSampleContext();
    expect(preview.body).toContain(ctx.appointmentDateShort);
    expect(preview.body).toContain(ctx.appointmentTime);
    expect(preview.body).toContain(ctx.clinicLocation);
    expect(preview.body).toContain(ctx.clinicPhone);
    expect(preview.body).toContain(`app.x.invalid/c/${MESSAGING_CHECK_PREVIEW_CODE}`);
  });

  it("the placeholder is exactly as long as a real code, so the count is the send's", () => {
    expect(MESSAGING_CHECK_PREVIEW_CODE).toHaveLength(CONFIRM_CODE_LENGTH);
  });

  it("a body the renderer refuses is reported as refused, never shown as sendable", () => {
    // A sender that can receive replies arms the reply instruction, and the
    // body no longer fits one segment: the 2026-09-02 event.
    const preview = previewMessagingCheck({
      REMINDERS_RESCHEDULE_BASE_URL: BASE,
      TWILIO_SMS_FROM: "+351900000000",
    });
    expect(preview.ok).toBe(false);
    if (preview.ok) throw new Error("unreachable");
    expect(preview.kind).toBe("too_long");
    expect(preview.length).toBeGreaterThan(SMS_SEGMENT_LIMIT);
    expect(preview.refusal).toContain(String(preview.length));
  });

  it("an unset link origin is its own refusal, with no length to report", () => {
    const preview = previewMessagingCheck({ TWILIO_SMS_FROM: "OsteoJP" });
    expect(preview).toMatchObject({ ok: false, kind: "no_link_origin", length: null });
  });

  it("segments are counted against the single-segment limit", () => {
    expect(smsSegments(1)).toBe(1);
    expect(smsSegments(SMS_SEGMENT_LIMIT)).toBe(1);
    expect(smsSegments(SMS_SEGMENT_LIMIT + 1)).toBe(2);
  });
});

describe("the preview equals what the send hands to the transport", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
    vi.restoreAllMocks();
  });

  /** Drive the real send with a transport that records the body and accepts it. */
  async function sendAndCapture() {
    const sent: string[] = [];
    vi.resetModules();
    vi.doMock("./clients", () => ({
      sendSms: async (m: { body: string }) => {
        sent.push(m.body);
        return { channel: "sms", sandbox: false, id: "SM-test-accepted" };
      },
      suppressionReasonOf: () => undefined,
    }));
    vi.doMock("./confirm-code-store", () => ({
      issueConfirmCode: async () => null,
      withdrawConfirmCode: async () => true,
    }));
    vi.doMock("./messaging-check-target", () => ({
      loadMessagingCheckTarget: async () => null,
    }));
    vi.doMock("@osteojp/db", () => ({
      auditLog: {},
      getDbAdmin: () => ({ insert: () => ({ values: async () => undefined }) }),
    }));
    const { sendMessagingCheck } = await import("./messaging-check");
    const result = await sendMessagingCheck({
      tenantId: "t",
      actorUserId: "u",
      phone: "+351912345678",
      ip: null,
    });
    return { result, sent };
  }

  function arm(sender: string) {
    for (const k of ["REMINDERS_REPLY_CAPABLE", "TWILIO_MESSAGING_SERVICE_SID"]) delete process.env[k];
    process.env[CONFIRM_LINK_FLAG] = "true";
    process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-body-test-secret";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = BASE;
    process.env.TWILIO_SMS_FROM = sender;
  }

  it("BYTE FOR BYTE, once the random code is put back to the placeholder", async () => {
    arm("OsteoJP");
    // The page calls this with no argument, so it reads the same environment
    // the send reads.
    const preview = previewMessagingCheck();
    const { result, sent } = await sendAndCapture();

    expect(preview.ok).toBe(true);
    expect(result.ok).toBe(true);
    if (!preview.ok || !result.ok) throw new Error("unreachable");
    expect(sent).toHaveLength(1);

    const code = /\/c\/([A-Za-z0-9_-]+)/.exec(sent[0])?.[1];
    expect(code).toHaveLength(CONFIRM_CODE_LENGTH);
    // A function replacement: a code may hold `$`-free symbols only, but data
    // is never passed as a replacement pattern.
    expect(sent[0].replace(`/c/${code}`, () => `/c/${MESSAGING_CHECK_PREVIEW_CODE}`)).toBe(
      preview.body,
    );
    // And the two numbers the screen prints are the send's own.
    expect(preview.length).toBe(result.length);
    expect(preview.segments).toBe(result.segments);
  });

  it("NOT VACUOUS: the sent body really carries a code the preview does not", async () => {
    arm("OsteoJP");
    const preview = previewMessagingCheck();
    const { sent } = await sendAndCapture();
    if (!preview.ok) throw new Error("unreachable");
    expect(sent[0]).not.toBe(preview.body);
    expect(sent[0]).not.toContain(MESSAGING_CHECK_PREVIEW_CODE);
  });

  it("when the preview says nothing would be sent, the send refuses and sends nothing", async () => {
    arm("+351900000000");
    const preview = previewMessagingCheck();
    const { result, sent } = await sendAndCapture();

    expect(preview.ok).toBe(false);
    expect(result.ok).toBe(false);
    if (preview.ok || result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("body_refused");
    // The send reports the same length the preview refused at, as a number.
    expect(result.length).toBe(preview.length);
    expect(sent).toEqual([]);
  });
});
