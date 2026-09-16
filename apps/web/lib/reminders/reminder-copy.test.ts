import { describe, expect, it } from "vitest";

import { INBOUND_KEYWORDS, classifyInboundReply } from "./inbound-classify";
import {
  CANCEL_KEYWORD,
  CONFIRM_KEYWORD,
  reminderConfirmInstruction,
  REMINDER_CONFIRM_INSTRUCTION,
  REMINDER_NO_REPLIES_NOTICE_PT,
} from "./reminder-copy";
import { isGsm7 } from "./templates";

// The confirm-affordance copy is a CONFIG VALUE derived from the keyword config.

describe("reminder confirm instruction (config-derived, GSM-7 safe)", () => {
  it("is derived from the keyword config, not a hardcoded literal", () => {
    expect(CONFIRM_KEYWORD).toBe(INBOUND_KEYWORDS.confirm[0]!.toUpperCase());
    expect(CANCEL_KEYWORD).toBe(INBOUND_KEYWORDS.cancel[0]!.toUpperCase());
  });

  it("stays GSM-7 (single-segment safe) in every locale", () => {
    for (const locale of ["pt", "en"] as const) {
      expect(isGsm7(reminderConfirmInstruction(locale))).toBe(true);
    }
  });

  it("tells the patient to send words the classifier actually recognizes", () => {
    // The keywords named in the copy must classify to the right tiers, so the
    // instruction can never drift from the parser.
    expect(classifyInboundReply(CONFIRM_KEYWORD).intent).toBe("confirmada");
    expect(classifyInboundReply(CANCEL_KEYWORD).intent).toBe("cancelada");
  });

  it("exposes both locales", () => {
    expect(REMINDER_CONFIRM_INSTRUCTION.pt).toContain(CONFIRM_KEYWORD);
    expect(REMINDER_CONFIRM_INSTRUCTION.en).toContain(CANCEL_KEYWORD);
  });
});

/**
 * S2, the line for the other case: the sender cannot receive a reply.
 * Owner ruling Q-SMS-S2, dispatch COMMS-SMS-WORDING-R2 (2026-09-16).
 */
describe("the no-replies notice (S2)", () => {
  it("is the ruled wording, character for character", () => {
    // An EQUALITY, like FEE_NOTICE_ACCEPTANCE_CLAUSE: this is the exact string
    // the owner ruled, and a `toContain` would let it drift inside a longer one.
    expect(REMINDER_NO_REPLIES_NOTICE_PT).toBe("Nao lemos respostas.");
  });

  it("stays GSM-7, so appending it cannot halve the segment limit to 70", () => {
    expect(isGsm7(REMINDER_NO_REPLIES_NOTICE_PT)).toBe(true);
  });

  it("carries no accent, which is what keeps it GSM-7", () => {
    // The template convention, asserted rather than eyeballed: "Não" would be
    // the natural Portuguese and would force UCS-2 on the whole body.
    expect(REMINDER_NO_REPLIES_NOTICE_PT).not.toMatch(/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/);
  });

  it("does not tell the patient to reply, which is the whole point", () => {
    expect(REMINDER_NO_REPLIES_NOTICE_PT).not.toContain(CONFIRM_KEYWORD);
    expect(REMINDER_NO_REPLIES_NOTICE_PT).not.toContain(CANCEL_KEYWORD);
    expect(REMINDER_NO_REPLIES_NOTICE_PT).not.toMatch(/Responda/);
  });
});
