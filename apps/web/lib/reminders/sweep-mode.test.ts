/**
 * sweep-mode.test.ts - SWEEP-47, the two switches of the reminder sweep.
 *
 * Everything the sweep sends stands behind these few lines, so every near-miss
 * of each value is pinned to its off side here.
 */
import { describe, expect, it } from "vitest";

import { reminderSweepMode, sweepRemindsNeverReminded, sweepSends } from "./sweep-mode";

/** Values that are not `send`, and must leave the sweep in shadow. */
const NOT_SEND = [
  "SEND",
  "Send",
  "sEND",
  "send ",
  " send",
  "send\n",
  "send\r\n",
  "\tsend",
  "",
  " ",
  "shadow",
  "on",
  "ON",
  "true",
  "TRUE",
  "1",
  "yes",
  "live",
  "sending",
  "sends",
  "send;",
  "send,shadow",
  '"send"',
  "'send'",
  "send=true",
  "null",
  "undefined",
];

/** Values that are not `on`, and must leave the second switch off. */
const NOT_ON = [
  "ON",
  "On",
  "oN",
  "on ",
  " on",
  "on\n",
  "\ton",
  "",
  " ",
  "off",
  "send",
  "true",
  "1",
  "yes",
  "enabled",
  "onn",
  '"on"',
  "on;",
  "null",
];

describe("REMINDERS_SWEEP_MODE: shadow unless the value is exactly send", () => {
  it("send reads as send", () => {
    expect(reminderSweepMode({ REMINDERS_SWEEP_MODE: "send" })).toBe("send");
    expect(sweepSends({ REMINDERS_SWEEP_MODE: "send" })).toBe(true);
  });

  it("unset reads as shadow", () => {
    expect(reminderSweepMode({})).toBe("shadow");
    expect(reminderSweepMode({ REMINDERS_SWEEP_MODE: undefined })).toBe("shadow");
    expect(sweepSends({})).toBe(false);
  });

  it.each(NOT_SEND)("%j reads as shadow", (value) => {
    expect(reminderSweepMode({ REMINDERS_SWEEP_MODE: value })).toBe("shadow");
    expect(sweepSends({ REMINDERS_SWEEP_MODE: value })).toBe(false);
  });

  it("reads the process environment when handed none, and reads it at the call, not at import", () => {
    const saved = process.env.REMINDERS_SWEEP_MODE;
    try {
      delete process.env.REMINDERS_SWEEP_MODE;
      expect(sweepSends()).toBe(false);
      process.env.REMINDERS_SWEEP_MODE = "send";
      expect(sweepSends()).toBe(true);
      process.env.REMINDERS_SWEEP_MODE = "Send";
      expect(sweepSends()).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.REMINDERS_SWEEP_MODE;
      else process.env.REMINDERS_SWEEP_MODE = saved;
    }
  });

  it("no other variable turns sending on", () => {
    expect(
      sweepSends({
        REMINDERS_SWEEP_NEVER_REMINDED: "on",
        REMINDERS_LIVE_SEND: "true",
        REMINDERS_SWEEP: "send",
        SWEEP_MODE: "send",
      }),
    ).toBe(false);
  });
});

describe("REMINDERS_SWEEP_NEVER_REMINDED: off unless the value is exactly on", () => {
  it("on reads as on", () => {
    expect(sweepRemindsNeverReminded({ REMINDERS_SWEEP_NEVER_REMINDED: "on" })).toBe(true);
  });

  it("unset reads as off", () => {
    expect(sweepRemindsNeverReminded({})).toBe(false);
    expect(sweepRemindsNeverReminded({ REMINDERS_SWEEP_NEVER_REMINDED: undefined })).toBe(false);
  });

  it.each(NOT_ON)("%j reads as off", (value) => {
    expect(sweepRemindsNeverReminded({ REMINDERS_SWEEP_NEVER_REMINDED: value })).toBe(false);
  });

  it("the two switches are independent: neither value sets the other", () => {
    expect(sweepRemindsNeverReminded({ REMINDERS_SWEEP_MODE: "send" })).toBe(false);
    expect(sweepSends({ REMINDERS_SWEEP_NEVER_REMINDED: "on" })).toBe(false);
    const both = { REMINDERS_SWEEP_MODE: "send", REMINDERS_SWEEP_NEVER_REMINDED: "on" };
    expect(sweepSends(both)).toBe(true);
    expect(sweepRemindsNeverReminded(both)).toBe(true);
  });
});
