import { afterEach, describe, expect, it } from "vitest";

import { remindersInboundEnabled } from "./inbound-config";

const original = process.env.REMINDERS_INBOUND;

afterEach(() => {
  if (original === undefined) delete process.env.REMINDERS_INBOUND;
  else process.env.REMINDERS_INBOUND = original;
});

describe("remindersInboundEnabled — OFF by default (migration deferred)", () => {
  it("is OFF when unset", () => {
    delete process.env.REMINDERS_INBOUND;
    expect(remindersInboundEnabled()).toBe(false);
  });

  it("is OFF for any value other than the exact string 'true'", () => {
    for (const v of ["false", "1", "yes", "TRUE", ""]) {
      process.env.REMINDERS_INBOUND = v;
      expect(remindersInboundEnabled()).toBe(false);
    }
  });

  it("is ON only when set to exactly 'true'", () => {
    process.env.REMINDERS_INBOUND = "true";
    expect(remindersInboundEnabled()).toBe(true);
  });
});
