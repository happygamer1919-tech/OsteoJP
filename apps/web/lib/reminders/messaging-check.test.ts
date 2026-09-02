import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CONFIRM_CODE_SECRET_VAR, CONFIRM_LINK_FLAG } from "./confirm-code";

/**
 * The two refusals the owner's delivery test can reach WITHOUT sending, and
 * they are the two worth pinning: both happen before anything costs money or
 * touches a handset, and both are easy to regress into a silent send.
 */
describe("the delivery test refuses before it spends", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("refuses a number that is not usable, without sending", async () => {
    process.env[CONFIRM_LINK_FLAG] = "true";
    process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-test-secret";
    const { sendMessagingCheck } = await import("./messaging-check");
    expect(
      await sendMessagingCheck({
        tenantId: "t",
        actorUserId: "u",
        phone: "not a number",
        ip: null,
      }),
    ).toEqual({ ok: false, reason: "invalid_phone" });
  });

  it("refuses when the confirm link is DISARMED, because there is nothing to test", async () => {
    // The commonest reason a delivery test would appear to work and prove
    // nothing: the flag is off, so the body has no link in it. Sending that
    // costs money and answers a question nobody asked.
    delete process.env[CONFIRM_LINK_FLAG];
    process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-test-secret";
    const { sendMessagingCheck } = await import("./messaging-check");
    expect(
      await sendMessagingCheck({
        tenantId: "t",
        actorUserId: "u",
        phone: "+351912345678",
        ip: null,
      }),
    ).toEqual({ ok: false, reason: "no_link" });
  });
});
