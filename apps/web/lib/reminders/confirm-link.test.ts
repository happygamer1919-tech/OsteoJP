import { describe, expect, it } from "vitest";

import {
  CONFIRM_CODE_LENGTH,
  CONFIRM_CODE_SECRET_VAR,
  CONFIRM_LINK_FLAG,
  CONFIRM_LINK_PREFIX,
  confirmLinkEnabled,
  confirmLinkLine,
  confirmLinkReason,
  generateConfirmCode,
  hashConfirmCode,
  hashesEqual,
  isWellFormedConfirmCode,
} from "./confirm-code";
import {
  isGsm7,
  renderSms,
  SMS_SEGMENT_LIMIT,
  type ReminderContext,
} from "./templates";

/**
 * THE 24h CONFIRM LINK: the segment budget, the capability gate, and the code.
 *
 * ==========================================================================
 * WHY THE SEGMENT COUNT IS ASSERTED AS A NUMBER AND NOT AS "IT FITS"
 * ==========================================================================
 * A message that leaves GSM-7 or exceeds 160 characters is split by the carrier
 * into 153-character parts and DOUBLES the cost of every reminder the clinic
 * sends — silently, with no error anywhere. The margin here is 28 characters on
 * the worst-case body, which is enough for the link and nothing else, so this
 * file pins the exact count rather than the inequality: a future word added to
 * the body would still satisfy "≤ 160" right up until the day it did not.
 */

/** The worst case the copy was verified against: the longest clinic name. */
const ctx: ReminderContext = {
  patientFirstName: "Madalena",
  appointmentDateLong: "23 de maio de 2026",
  appointmentDateShort: "23/05",
  appointmentTime: "14:30",
  practitionerName: "Dr. Joao Pereira",
  clinicLocation: "Castelo Branco",
  clinicPhone: "+351 210 000 000",
  rescheduleLink: "https://osteojp.pt/r/abc123",
};

const CODE = "aB3-_xY9".slice(0, CONFIRM_CODE_LENGTH);
const LINE = confirmLinkLine(CODE);

describe("JP's approved line", () => {
  it("is exactly the approved shape: bare host, /c/, eight characters", () => {
    expect(LINE).toBe(`Confirmar: ${CONFIRM_LINK_PREFIX}${CODE}`);
    expect(LINE).toBe("Confirmar: osteojp.pt/c/aB3-_xY9");
  });

  it("is 32 characters, which is the figure the whole budget was computed from", () => {
    // docs/audit/PERF-06-RLS.md §6: body 99 + LF + 32 = 132, margin 28.
    expect(LINE.length).toBe(32);
  });

  it("is GSM-7, including the two base64url symbols a code can contain", () => {
    // `-` and `_` are in the GSM-7 basic set. If either were not, every SMS
    // carrying a code with one would silently become UCS-2 and halve the limit
    // from 160 to 70 — a cost doubling nothing would report.
    expect(isGsm7(LINE)).toBe(true);
    expect(isGsm7(confirmLinkLine("--______"))).toBe(true);
  });
});

describe("the segment budget, on the real 24h body", () => {
  it("the 24h pt body with the link is ONE GSM-7 segment, and here is the count", () => {
    const withLink = renderSms("24h", "pt", ctx, { confirmLink: LINE });
    const withoutLink = renderSms("24h", "pt", ctx, {});

    expect(isGsm7(withLink)).toBe(true);
    expect(withLink.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
    // THE NUMBERS, PINNED, and they are the card's own budget confirmed by
    // execution rather than by arithmetic: body 99 + LF + line 32 = 132 of 160,
    // margin 28. docs/audit/PERF-06-RLS.md §6 predicted exactly these.
    expect(withoutLink.length).toBe(99);
    expect(withLink.length).toBe(132);
    expect(SMS_SEGMENT_LIMIT - withLink.length).toBe(28);
  });

  it("the link is the LAST line and the approved body is a strict prefix", () => {
    // The same property templates.ts asserts for the reply instruction: with the
    // gate off, the body is byte-identical to what JP approved on 2026-08-03, so
    // neither rendering is copy nobody has seen.
    const withLink = renderSms("24h", "pt", ctx, { confirmLink: LINE });
    const withoutLink = renderSms("24h", "pt", ctx, {});
    expect(withLink.startsWith(withoutLink)).toBe(true);
    expect(withLink).toBe(`${withoutLink}\n${LINE}`);
    expect(withLink.split("\n").at(-1)).toBe(LINE);
  });

  it("the English body also fits", () => {
    const en = renderSms("24h", "en", ctx, { confirmLink: LINE });
    expect(isGsm7(en)).toBe(true);
    expect(en.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
  });

  it("48h NEVER carries the link, even when one is passed", () => {
    // 48h routes to email. The offset check lives in renderSms rather than at
    // the caller so a future 48h SMS cannot inherit the line by accident.
    const s48 = renderSms("48h", "pt", ctx, { confirmLink: LINE });
    expect(s48).not.toContain("osteojp.pt/c/");
    expect(s48).toBe(renderSms("48h", "pt", ctx, {}));
  });

  it("REFUSES TO SEND rather than silently splitting when the fee line joins it", () => {
    // This is the arithmetic that moved the fee sentence to the page (owner
    // ruling 2026-09-02): 123 + LF + 53 is over the segment. A throw costs a
    // failed render in a log; a split costs double for every reminder forever.
    expect(() =>
      renderSms("24h", "pt", ctx, { confirmLink: LINE, feeNotice: true }),
    ).toThrow(/exceeds 160/);
  });

  it("REFUSES the reply instruction beside the link, for the same reason", () => {
    expect(() =>
      renderSms("24h", "pt", ctx, { confirmLink: LINE, replyInstruction: true }),
    ).toThrow(/exceeds 160/);
  });
});

describe("the capability gate", () => {
  const secret = { [CONFIRM_CODE_SECRET_VAR]: "a-test-secret-value" };

  it("is ARMED only on the exact string \"true\"", () => {
    expect(confirmLinkEnabled({ ...secret, [CONFIRM_LINK_FLAG]: "true" })).toBe(true);
  });

  it("is DISARMED on every near-miss a typed Vercel variable produces", () => {
    for (const value of ["TRUE", "True", " true", "true ", "1", "yes", "on", ""]) {
      expect(confirmLinkEnabled({ ...secret, [CONFIRM_LINK_FLAG]: value })).toBe(false);
    }
    expect(confirmLinkEnabled({ ...secret })).toBe(false);
  });

  it("is DISARMED when the flag is on but the HMAC key is absent", () => {
    // Both gates, one answer. Arming the flag on a project with no secret would
    // otherwise produce a reminder whose link is broken for every patient.
    expect(confirmLinkEnabled({ [CONFIRM_LINK_FLAG]: "true" })).toBe(false);
    expect(confirmLinkEnabled({ [CONFIRM_LINK_FLAG]: "true", [CONFIRM_CODE_SECRET_VAR]: "  " })).toBe(
      false,
    );
  });

  it("says WHY, in words an operator can act on, and never prints the secret", () => {
    const reason = confirmLinkReason({ [CONFIRM_LINK_FLAG]: "true" });
    expect(reason).toContain(CONFIRM_CODE_SECRET_VAR);
    expect(reason).not.toContain("a-test-secret-value");
    expect(confirmLinkReason({ ...secret, [CONFIRM_LINK_FLAG]: "true" })).toContain("is present");
    expect(confirmLinkReason({ ...secret })).toContain("disarmed");
  });
});

describe("the code", () => {
  it("is eight base64url characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateConfirmCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[A-Za-z0-9_-]{8}$/);
      expect(isWellFormedConfirmCode(code)).toBe(true);
    }
  });

  it("does not repeat itself, which is what 48 bits is for", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateConfirmCode()));
    expect(seen.size).toBe(500);
  });

  it("rejects malformed shapes without consulting anything", () => {
    for (const bad of ["", "short", "toolongcode", "aB3-_xY!", "aB3 _xY9"]) {
      expect(isWellFormedConfirmCode(bad)).toBe(false);
    }
  });

  it("hashes to the 64-hex shape 0072's CHECK pins, and the key changes it", () => {
    const a = hashConfirmCode(CODE, { [CONFIRM_CODE_SECRET_VAR]: "key-one" });
    const b = hashConfirmCode(CODE, { [CONFIRM_CODE_SECRET_VAR]: "key-two" });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    // Keyed, not a bare digest: the same code under a different key is a
    // different row, which is the whole of SR-28's offline-attack argument.
    expect(a).not.toBe(b);
    expect(hashConfirmCode(CODE, { [CONFIRM_CODE_SECRET_VAR]: "key-one" })).toBe(a);
  });

  it("REFUSES to hash with no key rather than falling back to an unkeyed digest", () => {
    // The §1.3 shape: a fallback here would produce codes that look identical
    // and are offline-breakable, while everything carried on reporting success.
    expect(() => hashConfirmCode(CODE, {})).toThrow(new RegExp(CONFIRM_CODE_SECRET_VAR));
    expect(() => hashConfirmCode(CODE, { [CONFIRM_CODE_SECRET_VAR]: "   " })).toThrow();
  });

  it("compares hashes without leaking a prefix match through timing", () => {
    const a = "a".repeat(64);
    expect(hashesEqual(a, a)).toBe(true);
    expect(hashesEqual(a, "b".repeat(64))).toBe(false);
    expect(hashesEqual(a, "a".repeat(63))).toBe(false);
  });
});
