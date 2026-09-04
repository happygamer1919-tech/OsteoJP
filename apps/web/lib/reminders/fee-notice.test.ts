/**
 * The double gate on the 50% fee line (W13-05, WAVE-13.md LOOP 5 section 3).
 *
 * Every DoD line in that section is asserted here or in the sibling suites named
 * against it. The three gate-combination tests are the counsel-critical ones and
 * are named so a reader can find them without reading the file.
 */
import { describe, it, expect } from "vitest";

import { REMINDER_CONFIRM_INSTRUCTION } from "./reminder-copy";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FEE_NOTICE_ACCEPTANCE_CLAUSE,
  FEE_NOTICE_FLAG,
  FEE_NOTICE_SMS,
  FEE_NOTICE_TEMPLATE_ID,
  feeNoticeFlagEnabled,
  shouldRenderFeeNotice,
  smsTemplateIdFor,
} from "./fee-notice";
import { renderSms, SMS, SMS_SEGMENT_LIMIT, isGsm7 } from "./templates";
import { REMINDER_TEMPLATES } from "./notification-registry";

/** The approval packet's own sample fill, so the measurement below is the one
 *  JP was shown: 10/09 14:30, Castelo Branco (the longest prod clinic name per
 *  templates.ts:125), +351 272 000 000. */
const CTX = {
  patientFirstName: "Madalena",
  appointmentDateLong: "10 de setembro de 2026",
  appointmentDateShort: "10/09",
  appointmentTime: "14:30",
  practitionerName: "Dr. Joao Pereira",
  clinicLocation: "Castelo Branco",
  clinicPhone: "+351 272 000 000",
  rescheduleLink: "https://app.osteojp.pt/r/abc",
};

describe("the double gate — the three combinations", () => {
  /**
   * THE COUNSEL-CRITICAL CASE, named explicitly as the DoD requires.
   *
   * This is the failure the whole design exists to prevent: someone flips the
   * global flag and every patient is told about a fee, including the ones who
   * never accepted it. A gate that consulted only the flag would pass every
   * other test in this file and fail exactly here.
   */
  it("FLAG ON + NO per-patient acceptance -> the fee line does NOT render", () => {
    expect(
      shouldRenderFeeNotice({ flagEnabled: true, patientHasAcceptedTerms: false }),
    ).toBe(false);

    const message = renderSms("24h", "pt", CTX, { feeNotice: false });
    expect(message).not.toContain("50%");
    expect(message).not.toContain(FEE_NOTICE_ACCEPTANCE_CLAUSE);
  });

  it("acceptance ON + FLAG OFF -> the fee line does NOT render", () => {
    expect(
      shouldRenderFeeNotice({ flagEnabled: false, patientHasAcceptedTerms: true }),
    ).toBe(false);
  });

  it("BOTH -> and only both -> the fee line is what would be sent", () => {
    expect(
      shouldRenderFeeNotice({ flagEnabled: true, patientHasAcceptedTerms: true }),
    ).toBe(true);

    const message = renderSms("24h", "pt", CTX, { feeNotice: true });
    expect(message).toContain("50%");
    expect(message).toContain(FEE_NOTICE_ACCEPTANCE_CLAUSE);
  });

  it("neither -> no", () => {
    expect(
      shouldRenderFeeNotice({ flagEnabled: false, patientHasAcceptedTerms: false }),
    ).toBe(false);
  });

  /**
   * The gate is ONE function and the render site takes its ANSWER, never its
   * inputs. LOOP 5 section 6 makes duplicating the condition a halt condition,
   * so this asserts the shape rather than trusting the reviewer to notice.
   */
  it("renderSms takes the gate's answer, not its inputs, and defaults to OFF", () => {
    // Omitting the argument must be identical to passing false: a call site that
    // forgot the gate renders no fee line rather than an unguarded one.
    expect(renderSms("24h", "pt", CTX)).toBe(renderSms("24h", "pt", CTX, { feeNotice: false }));
  });

  /**
   * THE HALT CONDITION, ASSERTED IN SOURCE. LOOP 5 section 6 halts the loop if
   * the double gate has to be restated at a second site. A reviewer noticing
   * that is not a control; this is.
   *
   * The flag name may appear anywhere (docs, env checks). What must appear in
   * exactly ONE non-test module is the CONDITION: the conjunction of the flag
   * and the per-patient fact. Everything else consumes `shouldRenderFeeNotice`.
   */
  it("the condition exists in exactly one module", () => {
    const dir = join(__dirname);
    const files = readdirSync(dir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "fee-notice.ts",
    );
    const restating = files.filter((f) => {
      const src = readFileSync(join(dir, f), "utf8");
      // A second site would have to name the per-patient fact next to the flag.
      return src.includes("patientHasAcceptedTerms") && src.includes("feeNoticeFlagEnabled");
    });
    // POSITIVE CONTROL. Without this the loop below passes vacuously the moment
    // the grep stops matching — which is precisely how 0058's append-only
    // assertions passed for the wrong reason before the grant was fixed.
    expect(restating).toEqual(["dispatch.ts"]);

    // dispatch.ts is the ONE consumer, and it passes both into the gate rather
    // than combining them: it must call shouldRenderFeeNotice, not `&&` them.
    for (const f of restating) {
      const src = readFileSync(join(dir, f), "utf8");
      // COMMENTS STRIPPED FOR THE PRESENCE ASSERTION (ACC-vacuous-guard-sweep).
      // `toContain("shouldRenderFeeNotice(")` on raw source is satisfied by a
      // COMMENT naming the function - including the comment three lines above,
      // which says "it must call shouldRenderFeeNotice". Delete the real call,
      // keep any prose that mentions it, and this guard still passes. That is
      // criterion F: matching a MENTION rather than a USE.
      //
      // The paired `.not.toMatch` below deliberately stays on the RAW source. It
      // is an ABSENCE assertion, so a comment can only make it FAIL - the safe
      // direction - and running it on the stripped body would quietly narrow
      // what it refuses.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(
        code,
        `${f}: the call is absent from the CODE. A hit inside a comment does not count.`,
      ).toContain("shouldRenderFeeNotice(");
      expect(src).not.toMatch(/feeNoticeFlagEnabled\(\)\s*&&/);
    }
  });
});

describe("the flag", () => {
  it("is off unless the value is EXACTLY 'true'", () => {
    for (const v of [undefined, "", "TRUE", "True", "1", "yes", " true ", "false"]) {
      expect(feeNoticeFlagEnabled({ [FEE_NOTICE_FLAG]: v })).toBe(false);
    }
    expect(feeNoticeFlagEnabled({ [FEE_NOTICE_FLAG]: "true" })).toBe(true);
  });

  it("defaults OFF — the committed repo arms it nowhere", () => {
    expect(feeNoticeFlagEnabled({})).toBe(false);
  });

  it("is read at call time, so a flip needs no re-import", () => {
    const env: Record<string, string | undefined> = {};
    expect(feeNoticeFlagEnabled(env)).toBe(false);
    env[FEE_NOTICE_FLAG] = "true";
    expect(feeNoticeFlagEnabled(env)).toBe(true);
  });
});

describe("the wording JP ruled", () => {
  it("carries the ruled clause EXACTLY", () => {
    expect(FEE_NOTICE_ACCEPTANCE_CLAUSE).toBe("nos termos aceites na marcacao");
    expect(FEE_NOTICE_SMS.pt).toContain("nos termos aceites na marcacao");
  });

  it("renders that clause verbatim in the message a patient would receive", () => {
    // Back on renderSms: with the reply line gated on the sender, the
    // fee-bearing body fits one segment again and the render produces it. A
    // fill step that mangled the clause would pass a constant-only check.
    expect(renderSms("24h", "pt", CTX, { feeNotice: true })).toContain(
      "nos termos aceites na marcacao",
    );
  });

  it("is accent-free, because an accent forces UCS-2 and halves the limit", () => {
    expect(isGsm7(FEE_NOTICE_SMS.pt)).toBe(true);
    expect(isGsm7(FEE_NOTICE_SMS.en)).toBe(true);
  });
});

/**
 * THE SEGMENT BUDGET. Measured, not assumed.
 *
 * ==========================================================================
 * THE MARGIN IS BACK, BECAUSE THE REPLY LINE IS NOW GATED ON THE SENDER.
 * ==========================================================================
 * WF-18 B appended the reply instruction unconditionally and spent all but 12
 * of the 61 characters of headroom, which left the fee line (53) unable to
 * fit. The same-day capability gate makes that line conditional on the sender
 * being able to receive a reply - so with the live alphanumeric sender the 24h
 * body is JP's 2026-08-03 body again, 99 chars, and the fee variant fits at
 * 153 with 7 to spare exactly as it did before.
 *
 * THE CONFLICT DID NOT GO AWAY, IT BECAME CONDITIONAL, and that is the arm
 * worth having: when the Portuguese number arrives AND counsel signs the fee
 * rule, both lines want the same segment and TOGETHER they overflow.
 * `renderSms` throws rather than splitting - `assertSmsCompliant` runs after
 * both appends, which is what makes that guarantee real rather than intended.
 *
 * NOTHING IS AT RISK TODAY on either count: the fee flag is unarmed, its entry
 * is `approved: false`, counsel has not signed, and the reply gate is off.
 */
describe("segment budget", () => {
  const base = renderSms("24h", "pt", CTX);
  const withFee = renderSms("24h", "pt", CTX, { feeNotice: true });

  it("the 24h body is 99 chars again, leaving 61 to the limit", () => {
    // The gate is OFF here, which is production today: this is JP's
    // 2026-08-03 body, byte-identical.
    expect(base.length).toBe(99);
    expect(SMS_SEGMENT_LIMIT - base.length).toBe(61);
  });

  it("with the fee line it is 153 chars — ONE segment, 7 to spare", () => {
    expect(withFee.length).toBe(153);
    expect(withFee.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
    expect(SMS_SEGMENT_LIMIT - withFee.length).toBe(7);
    expect(isGsm7(withFee)).toBe(true);
  });

  it("the reply instruction alone still fits: 148 chars, 12 to spare", () => {
    const withReply = renderSms("24h", "pt", CTX, { replyInstruction: true });
    expect(REMINDER_CONFIRM_INSTRUCTION.pt.length).toBe(48);
    expect(withReply.length).toBe(148);
    expect(SMS_SEGMENT_LIMIT - withReply.length).toBe(12);
    expect(isGsm7(withReply)).toBe(true);
  });

  it("BOTH TOGETHER OVERFLOW, and the render THROWS rather than splitting", () => {
    // 12 remaining < 53 needed. The arm that will matter the day the
    // Portuguese number lands and counsel signs; it fails loudly instead of
    // billing a silent second segment.
    expect(SMS_SEGMENT_LIMIT - 148).toBeLessThan(FEE_NOTICE_SMS.pt.length);
    expect(() =>
      renderSms("24h", "pt", CTX, { feeNotice: true, replyInstruction: true }),
    ).toThrow(/exceeds 160-char single segment/);
  });

  it("the fee line is unchanged — WF-18 B amended the reminder, not the fee copy", () => {
    expect(FEE_NOTICE_SMS.pt).toBe(`Falta sem aviso: 50%, ${FEE_NOTICE_ACCEPTANCE_CLAUSE}.`);
    expect(FEE_NOTICE_SMS.pt.length).toBe(53);
  });

  /**
   * KEPT, because the number is quoted in the approval packet and in the
   * report to JP. It was a second segment before any of this and remains one.
   */
  it("the natural full-sentence phrasing costs a SECOND segment too", () => {
    const naturalPhrasing = `Falta sem aviso 24h: cobranca de 50%, ${FEE_NOTICE_ACCEPTANCE_CLAUSE}.`;
    expect(naturalPhrasing.length).toBe(69);
    expect(base.length + 1 + naturalPhrasing.length).toBeGreaterThan(SMS_SEGMENT_LIMIT);
  });

  it("the render THROWS rather than truncating if a future line overflows", () => {
    // Proves assertSmsCompliant is downstream of the append. Without that
    // ordering an overlong line would ship as two billed segments in silence.
    const long = "x".repeat(200);
    expect(() => renderSms("24h", "pt", { ...CTX, clinicLocation: long })).toThrow(
      /exceeds 160-char single segment/,
    );
  });
});

describe("the ten approved bodies are untouched", () => {
  /**
   * LOOP 5 section 5: the fee line is conditional ADDITIONAL content, never an
   * edit to an approved body. The strongest available form of that assertion is
   * that the source constant is byte-identical whichever way the gate answers.
   */
  it("the 24h body constant is not re-authored, branched on, or mutated", () => {
    // BYTE-IDENTICAL TO 2026-08-03. The reply instruction is NOT in this
    // constant - it is appended by renderSms when the sender can receive a
    // reply, exactly as the fee line is appended when its double gate opens.
    // Both are conditional ADDITIONAL content and neither edits the approved
    // body, which is the rule LOOP 5 section 5 states.
    expect(SMS["24h"].pt).toBe(
      "OsteoJP - Lembrete\nConsulta: amanha {date} as {time}\nLocal: {clinic}\nRemarcar: {phone}",
    );
    expect(
      renderSms("24h", "pt", CTX, { feeNotice: true }).startsWith(renderSms("24h", "pt", CTX)),
    ).toBe(true);
  });

  it("the fee line is APPENDED, so the approved text is a strict prefix", () => {
    const base = renderSms("24h", "pt", CTX);
    const withFee = renderSms("24h", "pt", CTX, { feeNotice: true });
    expect(withFee.slice(0, base.length)).toBe(base);
    expect(withFee.slice(base.length)).toBe(`\n${FEE_NOTICE_SMS.pt}`);
  });
});

/**
 * THE REGISTRY GATE, which is the third lock and the one that actually stops a
 * send today.
 */
describe("registry gating", () => {
  const entry = REMINDER_TEMPLATES.find((t) => t.id === FEE_NOTICE_TEMPLATE_ID);

  it("the fee-bearing body is registered and UNAPPROVED by default", () => {
    expect(entry).toBeDefined();
    expect(entry!.approved).toBe(false);
  });

  it("carries no approver and no approval date, because nobody has approved it", () => {
    // An entry that were `approved: false` but still named an approver would be
    // the same class of false claim this lane spent a session removing.
    expect(entry!.approvedBy).toBeNull();
    expect(entry!.approvedAt).toBeNull();
  });

  it("the APPROVED bodies are untouched by this entry — it changes nothing else", () => {
    // W14-04 narrowed this from "every other body" to "the approved ten". The
    // old spelling asserted that the fee notice was the registry's ONLY
    // unapproved entry, which is a claim about the registry as a whole and not
    // about the fee notice - so registering the three reply acknowledgements
    // (also unapproved, also deliberate) broke a fee-notice test that has no
    // opinion about them. The property this file owns is that adding the fee
    // line did not disturb the approved set; notification-registry.test.ts owns
    // the pin on which ids are unapproved.
    // The count moved 10 -> 13 on 2026-09-01 when JP approved the three reply
    // acknowledgements (WF-18). It is asserted as a NUMBER rather than left
    // loose so that this file still notices if the fee line is ever swept into
    // an approval sitting alongside other copy - which is the only thing this
    // assertion has ever been about.
    // 13 -> 9 on 2026-09-04, owner ruling B: the follow-up and no-show pairs
    // were darkened. THIS FILE'S POINT IS UNCHANGED - it still notices if the
    // fee line is ever swept into somebody else's approval sitting - and the
    // fee entry is still unapproved for its own reasons, which are counsel's
    // and not JP's alone.
    const approved = REMINDER_TEMPLATES.filter((t) => t.approved);
    expect(approved).toHaveLength(9);
    expect(approved.some((t) => t.id === FEE_NOTICE_TEMPLATE_ID)).toBe(false);
  });

  /**
   * The hole this closes: notify's gate resolves approval BY ID. A fee-bearing
   * body sent under `reminder.24h.sms` would be approved by an entry describing
   * different copy. The id is derived from the same boolean as the body, so it
   * cannot happen.
   */
  it("a fee-bearing send uses the unapproved id, never the approved plain one", () => {
    expect(smsTemplateIdFor("24h", true)).toBe(FEE_NOTICE_TEMPLATE_ID);
    expect(smsTemplateIdFor("24h", false)).toBe("reminder.24h.sms");
    expect(smsTemplateIdFor("48h", false)).toBe("reminder.48h.sms");
  });

  it("the registered body matches what the renderer actually produces", () => {
    // A registry whose body drifts from the code is a registry that approves
    // something else. Compare on the unfilled template, which is what is stored.
    expect(entry!.body).toBe(`${SMS["24h"].pt}\n${FEE_NOTICE_SMS.pt}`);
  });
});
