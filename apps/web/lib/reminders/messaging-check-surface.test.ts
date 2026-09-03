/**
 * THE TWO FACTS THE 2026-09-02 INCIDENT NEEDED ON A SCREEN.
 *
 * ==========================================================================
 * WHY THESE ARE ASSERTED ON THE FUNCTIONS AND ON THE PAGE SOURCE
 * ==========================================================================
 * `/admin/messaging-check` is an async server component that reads the request
 * context and redirects a non-owner, so it cannot be rendered with
 * `renderToStaticMarkup` the way the drawer tests render theirs. What CAN be
 * proven without a request is the whole of what was added: that the two
 * ANSWERS are correct for the incident's environment, and that the page asks
 * for them rather than deriving its own.
 *
 * THE SOURCE ASSERTIONS ARE NOT DECORATION. The defect was not a wrong value;
 * it was that no screen carried the value AT ALL. A test that only checked
 * `senderLabel` would stay green if somebody deleted the block from the page.
 *
 * ==========================================================================
 * THE INCIDENT, RESTATED
 * ==========================================================================
 * `TWILIO_SMS_FROM` held an E.164 number Twilio does not own. Every outbound
 * message failed at the provider, AND the reply line armed, because an E.164
 * sender is exactly the condition the reply gate reads as replyable. One
 * variable, two symptoms, two days, and the only place either fact existed was
 * a Twilio console.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { senderLabel } from "./sender";
import { replyCapabilityReason, senderCanReceiveReplies } from "./reply-capability";

const PAGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../app/admin/messaging-check/page.tsx"),
  "utf8",
);

/** The environment as it stood during the incident. */
const BROKEN = { TWILIO_SMS_FROM: "+351969123456" };
/** The environment SR-43 restores. */
const FIXED = { TWILIO_SMS_FROM: "OsteoJP" };

describe("the page would have shown the misconfiguration", () => {
  it("the sender reads as a NUMBER, masked, and the two states differ visibly", () => {
    const broken = senderLabel(BROKEN);
    const fixed = senderLabel(FIXED);
    expect(broken).not.toBe(fixed);
    expect(fixed).toBe("OsteoJP");
    expect(broken).toContain("numero");
    expect(broken).toContain("3456");
  });

  it("NEVER THE WHOLE NUMBER, which is the rule the label exists under", () => {
    const label = senderLabel(BROKEN);
    expect(label).not.toContain("+351969123456");
    expect(label).not.toContain("969123");
  });

  it("the reply line reads ARMED under the broken sender and OFF under the fixed one", () => {
    expect(senderCanReceiveReplies(BROKEN)).toBe(true);
    expect(senderCanReceiveReplies(FIXED)).toBe(false);
  });

  it("and the WHY is a sentence, not a flag", () => {
    // "armed" alone sends the reader back to Vercel to guess which variable did
    // it. The reason names the variable and the rule.
    expect(replyCapabilityReason(BROKEN)).toContain("TWILIO_SMS_FROM");
    expect(replyCapabilityReason(BROKEN)).toContain("E.164");
    expect(replyCapabilityReason(FIXED)).toContain("cannot override");
  });
});

describe("the page renders those answers rather than deriving its own", () => {
  it("asks for the sender label and the reply state", () => {
    expect(PAGE).toMatch(/senderLabel\(\)/);
    expect(PAGE).toMatch(/senderCanReceiveReplies\(\)/);
    expect(PAGE).toMatch(/replyCapabilityReason\(\)/);
  });

  it("carries both slots, so deleting one is a visible change", () => {
    expect(PAGE).toContain('data-testid="messaging-check-sender"');
    expect(PAGE).toContain('data-testid="messaging-check-reply-state"');
  });

  it("warns when the sender is a NUMBER, which is always wrong here", () => {
    // The approved sender is the alphanumeric name, so a number means somebody
    // set the wrong value. This is the shape that cost two days.
    expect(PAGE).toContain('data-testid="messaging-check-sender-warning"');
    expect(PAGE).toMatch(/sender\.kind === "number"/);
  });

  it("NEVER prints the raw variable, on any path", () => {
    // The page may read env NAMES and answers; it may not interpolate a value.
    expect(PAGE).not.toMatch(/process\.env\.TWILIO/);
    expect(PAGE).not.toMatch(/outboundSenderValue/);
  });
});
