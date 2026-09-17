/**
 * S2 — "Nao lemos respostas." — owner ruling Q-SMS-S2, dispatch
 * COMMS-SMS-WORDING-R2 (2026-09-16).
 *
 * ==========================================================================
 * WHAT THE RULING SAYS, AS ASSERTIONS
 * ==========================================================================
 * One line is appended to the 24h pt SMS, and it renders on EXACTLY ONE
 * condition: `senderCanReceiveReplies()` is false. When it is true the line is
 * absent and the existing reply instruction behaves as it does today. The two
 * are mutually exclusive, which is asserted in both directions rather than
 * assumed from the shape of the `if`.
 *
 * ==========================================================================
 * THIS IS THE BUILDER; THE TWO REAL CALLERS ARE PROVEN IN sms-body-parity
 * ==========================================================================
 * `renderReminderSmsBody` is one function, so proving it here proves nothing
 * about whether `dispatchReminder` and `sendMessagingCheck` carry the line -
 * criterion F of ACC-vacuous-guard-sweep. sms-body-parity.test.ts drives both
 * real entry points and pins the resulting LENGTH; this file pins the RULE.
 * The length lives in exactly one place on purpose.
 */
import { describe, expect, it } from "vitest";

import { renderReminderSmsBody } from "./sms-body";
import { REMINDER_CONFIRM_INSTRUCTION, REMINDER_NO_REPLIES_NOTICE_PT } from "./reminder-copy";
import { senderCanReceiveReplies } from "./reply-capability";
import { assembleSms, isGsm7, type ReminderContext } from "./templates";

/** The worst case: the longest real clinic name and a 16-character phone. */
const CTX: ReminderContext = {
  patientFirstName: "Teste",
  appointmentDateLong: "amanha",
  appointmentDateShort: "23/05",
  appointmentTime: "14:30",
  practitionerName: "Equipa OsteoJP",
  clinicLocation: "Castelo Branco",
  clinicPhone: "+351 210 000 000",
  rescheduleLink: "https://osteojp.pt/r/sample",
};

const CODE = "Ab3-Xy_9";
/** app.osteojp.pt is the DEPLOYED host; osteojp.pt is the marketing site. */
const LINK = `Confirmar: app.osteojp.pt/c/${CODE}`;

const BASE_ENV = { REMINDERS_RESCHEDULE_BASE_URL: "https://app.osteojp.pt" };
/** Production today: a PT alphanumeric sender id, which is one-way. */
const ALPHANUMERIC = { ...BASE_ENV, TWILIO_SMS_FROM: "OsteoJP" };
/** A real number: it can receive SMS, so the reply instruction is true. */
const E164 = { ...BASE_ENV, TWILIO_SMS_FROM: "+351912345678" };
const SERVICE = { ...BASE_ENV, TWILIO_MESSAGING_SERVICE_SID: "MG0123456789abcdef0123456789abcd" };

function body(env: Record<string, string>, confirmCode: string | null = CODE): string {
  const res = renderReminderSmsBody({ offset: "24h", locale: "pt", ctx: CTX, confirmCode, env });
  if (!res.ok) throw new Error(`expected a body, got ${res.kind}: ${res.refusal}`);
  return res.body;
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("S2 renders when, and only when, a reply cannot reach us", () => {
  it("ALPHANUMERIC SENDER: S2 is present exactly once and is the LAST line", () => {
    const b = body(ALPHANUMERIC);
    expect(occurrences(b, REMINDER_NO_REPLIES_NOTICE_PT)).toBe(1);
    expect(b.split("\n").at(-1)).toBe(REMINDER_NO_REPLIES_NOTICE_PT);
  });

  it("the confirm link is still there exactly once, and S2 sits BELOW it", () => {
    // The ruling puts S2 after the link deliberately: the line that says a
    // reply goes nowhere must not be the last thing offering a way to act.
    const b = body(ALPHANUMERIC);
    expect(occurrences(b, LINK)).toBe(1);
    expect(b.indexOf(REMINDER_NO_REPLIES_NOTICE_PT)).toBeGreaterThan(b.indexOf(LINK));
  });

  it("E.164 SENDER: S2 is ABSENT and the reply instruction behaves as today", () => {
    // No confirm link here: with one, this arm is 185 characters and the
    // single-segment rule refuses it, which is the 2026-09-02 event and is
    // asserted in sms-body-parity.test.ts. The RULE is what this file proves.
    const b = body(E164, null);
    expect(b).not.toContain(REMINDER_NO_REPLIES_NOTICE_PT);
    expect(b).toContain(REMINDER_CONFIRM_INSTRUCTION.pt);
  });

  it("the two lines are MUTUALLY EXCLUSIVE, in both directions", () => {
    const off = body(ALPHANUMERIC, null);
    const on = body(E164, null);
    expect(off).toContain(REMINDER_NO_REPLIES_NOTICE_PT);
    expect(off).not.toContain(REMINDER_CONFIRM_INSTRUCTION.pt);
    expect(on).toContain(REMINDER_CONFIRM_INSTRUCTION.pt);
    expect(on).not.toContain(REMINDER_NO_REPLIES_NOTICE_PT);
  });

  it("MESSAGING SERVICE: undeclared gets S2, declared does not", () => {
    // It follows the ONE gate the ruling names rather than a second rule of its
    // own: whatever senderCanReceiveReplies answers, S2 is its inverse.
    expect(body(SERVICE, null)).toContain(REMINDER_NO_REPLIES_NOTICE_PT);
    expect(body({ ...SERVICE, REMINDERS_REPLY_CAPABLE: "true" }, null)).not.toContain(
      REMINDER_NO_REPLIES_NOTICE_PT,
    );
  });

  it("NO SENDER CONFIGURED: S2 is present, because nothing can receive a reply", () => {
    expect(body(BASE_ENV, null)).toContain(REMINDER_NO_REPLIES_NOTICE_PT);
  });

  it("NEGATIVE CONTROL: the gate really does answer differently for the two senders", () => {
    // Without this the assertions above could all be reading one branch.
    expect(senderCanReceiveReplies(ALPHANUMERIC)).toBe(false);
    expect(senderCanReceiveReplies(E164)).toBe(true);
  });

  it("the body with S2 stays GSM-7, so the segment limit is still 160", () => {
    expect(isGsm7(body(ALPHANUMERIC))).toBe(true);
  });

  it("pt ONLY: the EN body is unchanged, because no EN wording was approved", () => {
    const en = renderReminderSmsBody({
      offset: "24h",
      locale: "en",
      ctx: CTX,
      confirmCode: CODE,
      env: ALPHANUMERIC,
    });
    if (!en.ok) throw new Error("expected an EN body");
    expect(en.body).not.toContain(REMINDER_NO_REPLIES_NOTICE_PT);
  });
});

describe("S2 is inside the segment budget, not outside it", () => {
  it("COUNTS TOWARD THE LENGTH: the refusal it can cause names the longer body", () => {
    // The fee line does not fit beside the link (owner ruling 2026-09-02 moved
    // that sentence to the page), so this arm is refused either way. What is
    // asserted is that the refused LENGTH includes S2 - i.e. the line is
    // appended BEFORE the compliance verdict, never after it.
    const refused = renderReminderSmsBody({
      offset: "24h",
      locale: "pt",
      ctx: CTX,
      confirmCode: CODE,
      feeNotice: true,
      env: ALPHANUMERIC,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");

    // DERIVED, NOT TYPED: what the same body would measure without S2, taken
    // from the templates assembler itself, plus the joining LF and the line.
    const withoutS2 = assembleSms("24h", "pt", CTX, { feeNotice: true, confirmLink: LINK });
    expect(refused.length).toBe(withoutS2.length + 1 + REMINDER_NO_REPLIES_NOTICE_PT.length);
    expect(refused.kind).toBe("too_long");
  });
});
