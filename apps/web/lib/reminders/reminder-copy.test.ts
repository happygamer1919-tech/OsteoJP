import { describe, expect, it } from "vitest";

import { INBOUND_KEYWORDS, classifyInboundReply } from "./inbound-classify";
import {
  CANCEL_KEYWORD,
  CONFIRM_KEYWORD,
  reminderConfirmInstruction,
  REMINDER_CONFIRM_INSTRUCTION,
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
