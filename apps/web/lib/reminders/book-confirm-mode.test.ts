/**
 * book-confirm-mode.test.ts - BOOK-CONFIRM, the three-state switch.
 *
 * The switch decides whether an accepted online request gets the new
 * booking-approved message or today's confirmation. It is read by the dispatch
 * AND by the acceptance actions (for the approver's notice), so both arms of
 * the feature stand on these few lines.
 *
 * The ids below are made up. No real patient id is, or may be, in this
 * repository: the canary list lives in configuration.
 */
import { describe, expect, it } from "vitest";

import {
  bookConfirmAppliesTo,
  bookConfirmCanaryPatientIds,
  bookConfirmMode,
} from "./book-confirm-mode";

const LISTED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ALSO_LISTED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOT_LISTED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("the mode: off | canary | on, and everything else is off", () => {
  it.each([
    ["off", "off"],
    ["canary", "canary"],
    ["on", "on"],
    // Tolerant of case and of the whitespace a dashboard paste leaves behind.
    [" ON ", "on"],
    ["Canary", "canary"],
  ] as const)("BOOK_CONFIRM_MODE=%j reads as %s", (value, expected) => {
    expect(bookConfirmMode({ BOOK_CONFIRM_MODE: value })).toBe(expected);
  });

  it("unset reads as off", () => {
    expect(bookConfirmMode({})).toBe("off");
  });

  it.each(["", " ", "true", "1", "yes", "enabled", "onn", "canary,on", "on;"])(
    "an unrecognised value %j reads as off, never as on",
    (value) => {
      expect(bookConfirmMode({ BOOK_CONFIRM_MODE: value })).toBe("off");
    },
  );
});

describe("the canary list", () => {
  it("is comma-separated uuids, trimmed and case-insensitive", () => {
    const ids = bookConfirmCanaryPatientIds({
      BOOK_CONFIRM_CANARY_PATIENT_IDS: ` ${LISTED} , ${ALSO_LISTED.toUpperCase()} `,
    });
    expect([...ids].sort()).toEqual([LISTED, ALSO_LISTED].sort());
  });

  it("drops anything that is not a uuid, so a stray word matches nobody", () => {
    const ids = bookConfirmCanaryPatientIds({
      BOOK_CONFIRM_CANARY_PATIENT_IDS: `all,*,,${LISTED},not-a-uuid,${LISTED.slice(0, 20)}`,
    });
    expect([...ids]).toEqual([LISTED]);
  });

  it("unset or blank is the empty list", () => {
    expect(bookConfirmCanaryPatientIds({}).size).toBe(0);
    expect(bookConfirmCanaryPatientIds({ BOOK_CONFIRM_CANARY_PATIENT_IDS: " , " }).size).toBe(0);
  });
});

describe("the matrix: does the new behaviour apply to this patient?", () => {
  const list = { BOOK_CONFIRM_CANARY_PATIENT_IDS: LISTED };

  it("off: nobody, listed or not", () => {
    expect(bookConfirmAppliesTo(LISTED, { ...list, BOOK_CONFIRM_MODE: "off" })).toEqual({
      mode: "off",
      applies: false,
    });
    expect(bookConfirmAppliesTo(NOT_LISTED, { ...list, BOOK_CONFIRM_MODE: "off" }).applies).toBe(false);
    // Unset is off, and a populated list does not switch anything on by itself.
    expect(bookConfirmAppliesTo(LISTED, list)).toEqual({ mode: "off", applies: false });
  });

  it("canary, listed: applies", () => {
    expect(bookConfirmAppliesTo(LISTED, { ...list, BOOK_CONFIRM_MODE: "canary" })).toEqual({
      mode: "canary",
      applies: true,
    });
    // The patient id is matched the same way the list is read.
    expect(
      bookConfirmAppliesTo(LISTED.toUpperCase(), { ...list, BOOK_CONFIRM_MODE: "canary" }).applies,
    ).toBe(true);
  });

  it("canary, not listed: does not apply", () => {
    expect(bookConfirmAppliesTo(NOT_LISTED, { ...list, BOOK_CONFIRM_MODE: "canary" })).toEqual({
      mode: "canary",
      applies: false,
    });
  });

  it("canary with an empty list: nobody", () => {
    expect(bookConfirmAppliesTo(LISTED, { BOOK_CONFIRM_MODE: "canary" }).applies).toBe(false);
  });

  it("on: everybody, with or without a list", () => {
    expect(bookConfirmAppliesTo(NOT_LISTED, { BOOK_CONFIRM_MODE: "on" })).toEqual({
      mode: "on",
      applies: true,
    });
    expect(bookConfirmAppliesTo(LISTED, { ...list, BOOK_CONFIRM_MODE: "on" }).applies).toBe(true);
  });
});
