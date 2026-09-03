/**
 * ONE RESOLVER, AND THE EMPTY STRING IS THE INPUT THAT PROVES IT (SR-43).
 *
 * ==========================================================================
 * THE DIVERGENCE THIS FILE EXISTS TO CLOSE
 * ==========================================================================
 * `clients.ts` resolved the sender with `??` and `reply-capability.ts` with
 * `?.trim()`. Those agree on every input except one:
 *
 *   TWILIO_SMS_FROM = ""   clients.ts saw a VALUE (nullish coalescing does not
 *                          fall through on an empty string), resolved the
 *                          sender to "" and suppressed the send as
 *                          missing_provider_config.
 *                          reply-capability.ts saw FALSY, fell through to the
 *                          messaging service, and could arm the reply line on a
 *                          sender clients.ts would never have used.
 *
 * It was found by reading, not by a failure: with a blank variable nothing
 * sends at all, so the wrong answer could not reach a patient. It matters
 * because a Vercel variable created and left blank is an ordinary state, and
 * the reply line is exactly what it would have armed.
 *
 * BOTH DIRECTIONS ARE ASSERTED HERE: the resolver's answer, and the two
 * callers' answers, for the same env. A test of the resolver alone would prove
 * nothing about either caller.
 */
import { describe, expect, it } from "vitest";

import {
  MESSAGING_SERVICE_VAR,
  SMS_FROM_VAR,
  outboundSenderValue,
  resolveOutboundSender,
  senderLabel,
} from "./sender";
import { senderCanReceiveReplies, replyCapabilityReason } from "./reply-capability";

/**
 * The SHORT fixture the older suites use: `MG` + 30 hex, not 32. Kept because
 * it is what those files pass, and because a value that does NOT match Twilio's
 * SID shape is the sharper test of "the source decides".
 */
const SERVICE = "MG0123456789abcdef0123456789abcd";

/** `MG` + exactly 32 hex, which is the real Twilio shape. */
const WELL_FORMED_SERVICE = "MG0123456789abcdef0123456789abcdef";

describe("THE EMPTY STRING, which is the input the two files disagreed on", () => {
  const blankWithService = { [SMS_FROM_VAR]: "", [MESSAGING_SERVICE_VAR]: SERVICE };

  it("a BLANK from-address is not a sender: it falls through to the service", () => {
    expect(resolveOutboundSender(blankWithService)).toEqual({
      kind: "messaging_service",
      value: SERVICE,
      source: MESSAGING_SERVICE_VAR,
    });
  });

  it("BOTH CALLERS now say the same thing about it", () => {
    // The transport takes the service, so the send is configured...
    expect(outboundSenderValue(blankWithService)).toBe(SERVICE);
    // ...and the reply gate answers about that same service, not about "".
    // Undeclared, so still false - but now for the SERVICE's reason, which is
    // the answer clients.ts's sender implies.
    expect(senderCanReceiveReplies(blankWithService)).toBe(false);
    expect(replyCapabilityReason(blankWithService)).toContain("messaging service");
  });

  it("with the flag declared, the blank from-address still yields the service", () => {
    const declared = { ...blankWithService, REMINDERS_REPLY_CAPABLE: "true" };
    expect(senderCanReceiveReplies(declared)).toBe(true);
    expect(outboundSenderValue(declared)).toBe(SERVICE);
  });

  it("BLANK WITH NO SERVICE is nothing at all, to both callers", () => {
    const nothing = { [SMS_FROM_VAR]: "   " };
    expect(resolveOutboundSender(nothing)).toEqual({ kind: "none" });
    expect(outboundSenderValue(nothing)).toBeUndefined();
    expect(senderCanReceiveReplies(nothing)).toBe(false);
  });

  it("THE OLD BEHAVIOUR, restated so the change is visible", () => {
    // `"" ?? x` is `""`. This is not a claim about the current code; it is the
    // one-line reason the two files parted company, kept executable so a reader
    // does not have to take the header on trust.
    // Through a widened binding, because the compiler can prove a literal ""
    // is never nullish and rejects the expression outright - which is itself
    // the point: the two files were not written side by side, so nothing was
    // in a position to notice.
    const blank: string | undefined = ["", undefined][0];
    const nullish = blank ?? SERVICE;
    const falsy = blank ? blank : SERVICE;
    expect(nullish).toBe("");
    expect(falsy).toBe(SERVICE);
    expect(nullish).not.toBe(falsy);
  });
});

describe("the source decides for the service variable, not the shape", () => {
  it("a SHORT or mistyped SID in TWILIO_MESSAGING_SERVICE_SID is still a service", () => {
    // Classifying by pattern here would call a mistyped SID an alphanumeric
    // sender id and report "one-way" with confidence about the wrong thing.
    expect(resolveOutboundSender({ [MESSAGING_SERVICE_VAR]: "MG-not-a-real-sid" }).kind).toBe(
      "messaging_service",
    );
  });

  it("but a WELL-FORMED SID pasted into TWILIO_SMS_FROM is read by shape", () => {
    // `twilioSenderParam` exists for exactly this case: it must go out as
    // MessagingServiceSid, not as From. TWILIO_SMS_FROM is the one variable
    // that can hold all three forms, so its value has to be classified.
    expect(WELL_FORMED_SERVICE).toMatch(/^MG[0-9a-f]{32}$/);
    expect(resolveOutboundSender({ [SMS_FROM_VAR]: WELL_FORMED_SERVICE }).kind).toBe(
      "messaging_service",
    );
  });

  it("a MALFORMED SID in TWILIO_SMS_FROM is NOT guessed at - it reads as alphanumeric", () => {
    // Unchanged behaviour, pinned because it is surprising and it is right: the
    // shape is all this variable offers, and inventing a service from a value
    // that is not one would send under the wrong Twilio parameter.
    expect(resolveOutboundSender({ [SMS_FROM_VAR]: SERVICE }).kind).toBe("alphanumeric");
  });

  it.each([
    ["+351912345678", "number"],
    ["OsteoJP", "alphanumeric"],
    ["12345", "alphanumeric"], // a numeric short code, deliberately not a number
    ["351912345678", "alphanumeric"], // no leading +, so not E.164
  ])("%j in TWILIO_SMS_FROM is %s", (value, kind) => {
    expect(resolveOutboundSender({ [SMS_FROM_VAR]: value }).kind).toBe(kind);
  });
});

describe("the label is safe to print on an operator screen", () => {
  it("shows an alphanumeric id IN FULL, because that is the fact being checked", () => {
    // Every patient already sees `OsteoJP` on their handset. Masking it would
    // hide the one thing the operator opened the page to read.
    expect(senderLabel({ [SMS_FROM_VAR]: "OsteoJP" })).toBe("OsteoJP");
  });

  it("MASKS A NUMBER to its last four digits, and never prints the rest", () => {
    const label = senderLabel({ [SMS_FROM_VAR]: "+351969123456" });
    expect(label).toContain("3456");
    expect(label).not.toContain("+351969123456");
    expect(label).not.toContain("969");
  });

  it("masks a messaging service the same way", () => {
    const label = senderLabel({ [MESSAGING_SERVICE_VAR]: SERVICE });
    expect(label).toContain(SERVICE.slice(-4));
    expect(label).not.toContain(SERVICE);
  });

  it("says so when nothing is configured, rather than rendering an empty label", () => {
    expect(senderLabel({})).toContain("nenhum remetente");
  });

  it("THE INCIDENT, AS A LABEL: a number where a name belongs is visible at a glance", () => {
    // 2026-09-02: TWILIO_SMS_FROM held an E.164 number Twilio does not own, so
    // every message failed at the provider AND the reply line armed. Two
    // symptoms, one variable, and nothing on any screen said which sender was
    // in play. These two labels are what that difference now looks like.
    expect(senderLabel({ [SMS_FROM_VAR]: "+351969123456" })).not.toBe(
      senderLabel({ [SMS_FROM_VAR]: "OsteoJP" }),
    );
    expect(senderCanReceiveReplies({ [SMS_FROM_VAR]: "+351969123456" })).toBe(true);
    expect(senderCanReceiveReplies({ [SMS_FROM_VAR]: "OsteoJP" })).toBe(false);
  });
});
