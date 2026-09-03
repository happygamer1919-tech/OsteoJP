/**
 * senderCanReceiveReplies — the gate on the reply instruction.
 *
 * THE DEFECT IT CLOSES: the 24h SMS told patients to reply SIM while the live
 * sender was the alphanumeric `OsteoJP`, which cannot receive one. A patient
 * who answered believed they had confirmed; the agenda still said `agendada`.
 * Asking and not hearing is worse than never asking, so the message adapts to
 * the sender.
 *
 * The env is INJECTED in every case rather than mutated globally: the matrix
 * below is the whole point of the module and a leaked process.env value would
 * make one row pass for the wrong reason.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  REPLY_CAPABLE_FLAG,
  replyCapabilityReason,
  senderCanReceiveReplies,
} from "./reply-capability";

describe("an E.164 sender can receive replies", () => {
  it.each([
    "+351912345678", // a PT mobile — what the clinic is buying
    "+351210000000", // a PT geographic line, also a real number
    "+12025550123",
    "+4407700900123",
  ])("%s -> capable", (from) => {
    expect(senderCanReceiveReplies({ TWILIO_SMS_FROM: from })).toBe(true);
  });

  it("tolerates surrounding whitespace, which a pasted env var carries", () => {
    expect(senderCanReceiveReplies({ TWILIO_SMS_FROM: "  +351912345678  " })).toBe(true);
  });
});

describe("an alphanumeric sender CANNOT, and no flag may say otherwise", () => {
  it("the live production value is refused", () => {
    expect(senderCanReceiveReplies({ TWILIO_SMS_FROM: "OsteoJP" })).toBe(false);
  });

  /**
   * THE LOAD-BEARING ASSERTION IN THIS FILE. An operator declaration must not
   * be able to contradict a fact the code can see for itself. If the flag
   * could override a visible alphanumeric sender, a well-meaning "we set the
   * number up, tick the box" would put the instruction back on a one-way
   * message and reintroduce the exact defect.
   */
  it("REMINDERS_REPLY_CAPABLE cannot override a sender the code can read", () => {
    expect(
      senderCanReceiveReplies({
        TWILIO_SMS_FROM: "OsteoJP",
        [REPLY_CAPABLE_FLAG]: "true",
      }),
    ).toBe(false);
  });

  it.each([
    "OsteoJP",
    "12345", // a numeric short code — deliberately refused, see the module note
    "351912345678", // digits without the leading +, i.e. not E.164
    "00351912345678", // the 00 international form, also not E.164
    "+0912345678", // a zero country digit is not valid E.164
    "+35191", // too short
  ])("%j -> not capable", (from) => {
    expect(senderCanReceiveReplies({ TWILIO_SMS_FROM: from })).toBe(false);
  });
});

describe("a messaging service is UNKNOWABLE from here, so the operator declares", () => {
  const service = { TWILIO_MESSAGING_SERVICE_SID: "MG0123456789abcdef0123456789abcd" };

  it("without the flag it is NOT capable — ambiguity defaults to silence", () => {
    expect(senderCanReceiveReplies(service)).toBe(false);
  });

  it("with the flag exactly \"true\" it IS capable", () => {
    expect(senderCanReceiveReplies({ ...service, [REPLY_CAPABLE_FLAG]: "true" })).toBe(true);
  });

  /**
   * EXACT STRING, the same fail-safe rule REMINDERS_LIVE_SEND follows. A typo
   * in a Vercel variable must fail closed. Every value below is a plausible
   * mistake and every one of them means OFF.
   */
  it.each(["TRUE", "True", " true", "true ", "1", "yes", "on", "", "false"])(
    "%j does NOT arm it",
    (value) => {
      expect(senderCanReceiveReplies({ ...service, [REPLY_CAPABLE_FLAG]: value })).toBe(false);
    },
  );

  it("the flag alone, with no sender at all, arms nothing", () => {
    expect(senderCanReceiveReplies({ [REPLY_CAPABLE_FLAG]: "true" })).toBe(false);
  });
});

describe("precedence comes from ONE resolver, which both files call", () => {
  /**
   * If these two ever disagreed about WHICH sender is in play, this function
   * would be answering about a sender that is not the one sending. They DID
   * disagree, on one input: an empty-string `TWILIO_SMS_FROM` was a value to
   * clients.ts's `??` and falsy to the `?.trim()` here.
   *
   * SR-43 removed the duplication instead of re-pinning it. An explicit
   * from-address still wins - and when that address is alphanumeric, the
   * service's declaration is irrelevant because the service is not what sends.
   */
  it("an explicit alphanumeric from-address beats a declared messaging service", () => {
    expect(
      senderCanReceiveReplies({
        TWILIO_SMS_FROM: "OsteoJP",
        TWILIO_MESSAGING_SERVICE_SID: "MG0123456789abcdef0123456789abcd",
        [REPLY_CAPABLE_FLAG]: "true",
      }),
    ).toBe(false);
  });

  it("an explicit E.164 from-address is capable regardless of the flag", () => {
    expect(
      senderCanReceiveReplies({
        TWILIO_SMS_FROM: "+351912345678",
        TWILIO_MESSAGING_SERVICE_SID: "MG0123456789abcdef0123456789abcd",
      }),
    ).toBe(true);
  });

  it("NEITHER FILE READS THE TWO VARIABLES ITSELF - sender.ts is the only reader", () => {
    // THIS ASSERTION REPLACED ONE THAT PINNED THE DUPLICATION. It used to
    // require clients.ts to contain
    // `process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_MESSAGING_SERVICE_SID`
    // and called the copy "duplicated by necessity". It was not necessary, and
    // the necessity was doing the arguing: the two copies differed on the empty
    // string and nothing noticed for as long as both files agreed with the
    // test rather than with each other.
    //
    // Source-level, comments stripped, so prose about the rule cannot satisfy
    // it. A direct read reappearing in either file is the regression.
    for (const file of ["clients.ts", "reply-capability.ts"]) {
      const src = readStripped(file);
      expect(src, `${file} must not read TWILIO_SMS_FROM directly`).not.toMatch(
        /(?:process\.)?env(?:\.|\[\s*["'])TWILIO_SMS_FROM/,
      );
      expect(src, `${file} must not read TWILIO_MESSAGING_SERVICE_SID directly`).not.toMatch(
        /(?:process\.)?env(?:\.|\[\s*["'])TWILIO_MESSAGING_SERVICE_SID/,
      );
    }
  });

  it("and BOTH of them call the resolver, so the property above is not vacuous", () => {
    // Without this, deleting the sender logic from both files entirely would
    // satisfy the negative assertion above and prove nothing.
    expect(readStripped("clients.ts")).toMatch(/outboundSenderValue|resolveOutboundSender/);
    expect(readStripped("reply-capability.ts")).toMatch(/resolveOutboundSender/);
  });
});

describe("nothing configured", () => {
  it("is not capable", () => {
    expect(senderCanReceiveReplies({})).toBe(false);
    expect(senderCanReceiveReplies({ TWILIO_SMS_FROM: "   " })).toBe(false);
  });
});

describe("the reason string explains the answer without deciding it", () => {
  it("names the E.164 case", () => {
    expect(replyCapabilityReason({ TWILIO_SMS_FROM: "+351912345678" })).toContain("E.164");
  });

  it("names the alphanumeric case AND that the flag cannot override it", () => {
    const why = replyCapabilityReason({ TWILIO_SMS_FROM: "OsteoJP" });
    expect(why).toContain("not an E.164");
    expect(why).toContain("cannot override");
  });

  it("names the messaging-service case in both directions", () => {
    const service = { TWILIO_MESSAGING_SERVICE_SID: "MG0123456789abcdef0123456789abcd" };
    expect(replyCapabilityReason(service)).toContain(REPLY_CAPABLE_FLAG);
    expect(replyCapabilityReason({ ...service, [REPLY_CAPABLE_FLAG]: "true" })).toContain(
      "declaring",
    );
  });

  it("names the unconfigured case", () => {
    expect(replyCapabilityReason({})).toContain("no outbound SMS sender");
  });

  /**
   * THE REASON IS NEVER THE DECISION. It is returned for an operator-facing
   * log; if anything branched on it, the rule would exist twice and the copy
   * would drift. Asserted at source rather than argued.
   */
  it("no caller branches on the reason string", () => {
    const src = readStripped("dispatch.ts") + readStripped("reply-capability.ts");
    expect(src).not.toMatch(/replyCapabilityReason\([^)]*\)\s*(===|!==|\.includes)/);
  });
});

function readStripped(name: string): string {
  return readFileSync(join(__dirname, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
