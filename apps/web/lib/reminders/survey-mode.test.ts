/**
 * survey-mode.test.ts - SAT-01, the three-state switch.
 *
 * The switch decides whether the satisfaction survey exists in a deployment:
 * whether a send may go out, and whether any screen shows it. The sends and the
 * screens all stand on these few lines, so every near-miss of the value is
 * pinned to `off` here.
 *
 * The ids below are made up. No real patient id is, or may be, in this
 * repository: the canary list lives in configuration.
 */
import { describe, expect, it } from "vitest";

import {
  surveyAppliesTo,
  surveyCanaryPatientIds,
  surveySendMode,
  surveyVisible,
} from "./survey-mode";

const LISTED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ALSO_LISTED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOT_LISTED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** Every value that is not the switch, and must leave the survey dark. */
const NEAR_MISSES = [
  // Case and surrounding whitespace. BOOK_CONFIRM_MODE tolerates these; this
  // switch does not: the value is compared exactly as it was set.
  " ON ",
  "ON ",
  "ON",
  "On",
  "oN",
  "on ",
  " on",
  "on\n",
  "on\r\n",
  "\ton",
  "Canary",
  "CANARY",
  " canary\n",
  "canary ",
  " canary",
  "",
  " ",
  "\t",
  "true",
  "TRUE",
  "1",
  "0",
  "yes",
  "enabled",
  "live",
  "onn",
  "o n",
  "on;",
  "on,",
  "canary,on",
  "canary on",
  "canaries",
  '"on"',
  "'on'",
  "on=true",
  "null",
  "undefined",
];

describe("the mode: off | canary | on, and everything else is off", () => {
  it.each([
    ["off", "off"],
    ["canary", "canary"],
    ["on", "on"],
    ["OFF", "off"],
  ] as const)("SURVEY_SEND_MODE=%j reads as %s", (value, expected) => {
    expect(surveySendMode({ SURVEY_SEND_MODE: value })).toBe(expected);
  });

  it("unset reads as off", () => {
    expect(surveySendMode({})).toBe("off");
    expect(surveySendMode({ SURVEY_SEND_MODE: undefined })).toBe("off");
  });

  it.each(NEAR_MISSES)("an unrecognised value %j reads as off, never as on", (value) => {
    expect(surveySendMode({ SURVEY_SEND_MODE: value })).toBe("off");
  });

  it("reads its own variable and no neighbour's", () => {
    // BOOK-CONFIRM's switch and the reminders' live-send flag being on must not
    // switch the survey on.
    expect(
      surveySendMode({
        BOOK_CONFIRM_MODE: "on",
        REMINDERS_LIVE_SEND: "true",
        SURVEY_MODE: "on",
        SURVEY_CANARY_PATIENT_IDS: LISTED,
      }),
    ).toBe("off");
  });
});

describe("the canary list", () => {
  it("is comma-separated uuids, trimmed and case-insensitive", () => {
    const ids = surveyCanaryPatientIds({
      SURVEY_CANARY_PATIENT_IDS: ` ${LISTED} , ${ALSO_LISTED.toUpperCase()} `,
    });
    expect([...ids].sort()).toEqual([LISTED, ALSO_LISTED].sort());
  });

  it("drops anything that is not a uuid, so a stray word matches nobody", () => {
    const ids = surveyCanaryPatientIds({
      SURVEY_CANARY_PATIENT_IDS: `all,*,,${LISTED},not-a-uuid,${LISTED.slice(0, 20)}`,
    });
    expect([...ids]).toEqual([LISTED]);
  });

  it("unset or blank is the empty list", () => {
    expect(surveyCanaryPatientIds({}).size).toBe(0);
    expect(surveyCanaryPatientIds({ SURVEY_CANARY_PATIENT_IDS: "" }).size).toBe(0);
    expect(surveyCanaryPatientIds({ SURVEY_CANARY_PATIENT_IDS: " , " }).size).toBe(0);
  });

  it.each([
    // Another separator: the whole value is one entry, and it is not a uuid.
    `${LISTED};${ALSO_LISTED}`,
    `${LISTED} ${ALSO_LISTED}`,
    `${LISTED}\n${ALSO_LISTED}`,
    // A JSON array, quotes, braces: what a paste from another tool looks like.
    `["${LISTED}"]`,
    `"${LISTED}"`,
    `{${LISTED}}`,
    // A uuid with a character missing, one too many, or no hyphens.
    LISTED.slice(1),
    `${LISTED}a`,
    LISTED.replaceAll("-", ""),
    "*",
    "all",
    "true",
  ])("a malformed list %j matches nobody", (value) => {
    const env = { SURVEY_SEND_MODE: "canary", SURVEY_CANARY_PATIENT_IDS: value };
    expect(surveyCanaryPatientIds(env).size).toBe(0);
    expect(surveyAppliesTo(LISTED, env).applies).toBe(false);
    expect(surveyAppliesTo(ALSO_LISTED, env).applies).toBe(false);
    // Nor the malformed text itself, passed back as an id.
    expect(surveyAppliesTo(value, env).applies).toBe(false);
  });
});

describe("the matrix: may a survey be sent to this patient?", () => {
  const list = { SURVEY_CANARY_PATIENT_IDS: LISTED };

  it("off: nobody, listed or not", () => {
    expect(surveyAppliesTo(LISTED, { ...list, SURVEY_SEND_MODE: "off" })).toEqual({
      mode: "off",
      applies: false,
    });
    expect(surveyAppliesTo(NOT_LISTED, { ...list, SURVEY_SEND_MODE: "off" }).applies).toBe(false);
    // Unset is off, and a populated list does not switch anything on by itself.
    expect(surveyAppliesTo(LISTED, list)).toEqual({ mode: "off", applies: false });
  });

  it.each(NEAR_MISSES)("a near-miss %j: nobody, even a listed patient", (value) => {
    expect(surveyAppliesTo(LISTED, { ...list, SURVEY_SEND_MODE: value })).toEqual({
      mode: "off",
      applies: false,
    });
  });

  it("canary, listed: applies", () => {
    expect(surveyAppliesTo(LISTED, { ...list, SURVEY_SEND_MODE: "canary" })).toEqual({
      mode: "canary",
      applies: true,
    });
    // The patient id is matched the same way the list is read.
    expect(
      surveyAppliesTo(LISTED.toUpperCase(), { ...list, SURVEY_SEND_MODE: "canary" }).applies,
    ).toBe(true);
  });

  it("canary, not listed: does not apply", () => {
    expect(surveyAppliesTo(NOT_LISTED, { ...list, SURVEY_SEND_MODE: "canary" })).toEqual({
      mode: "canary",
      applies: false,
    });
    // An empty id is not a patient, with a list that has an empty segment.
    expect(
      surveyAppliesTo("", { SURVEY_SEND_MODE: "canary", SURVEY_CANARY_PATIENT_IDS: `,${LISTED},` })
        .applies,
    ).toBe(false);
  });

  it("canary with an empty list: nobody", () => {
    expect(surveyAppliesTo(LISTED, { SURVEY_SEND_MODE: "canary" }).applies).toBe(false);
  });

  it("canary does not read BOOK-CONFIRM's list", () => {
    expect(
      surveyAppliesTo(LISTED, {
        SURVEY_SEND_MODE: "canary",
        BOOK_CONFIRM_CANARY_PATIENT_IDS: LISTED,
      }).applies,
    ).toBe(false);
  });

  it("on: everybody, with or without a list", () => {
    expect(surveyAppliesTo(NOT_LISTED, { SURVEY_SEND_MODE: "on" })).toEqual({
      mode: "on",
      applies: true,
    });
    expect(surveyAppliesTo(LISTED, { ...list, SURVEY_SEND_MODE: "on" }).applies).toBe(true);
  });
});

describe("what the screens ask: does the survey show at all?", () => {
  it("off, unset and every near-miss: nothing shows", () => {
    expect(surveyVisible({})).toBe(false);
    expect(surveyVisible({ SURVEY_SEND_MODE: "off" })).toBe(false);
    for (const value of NEAR_MISSES) {
      expect(surveyVisible({ SURVEY_SEND_MODE: value }), JSON.stringify(value)).toBe(false);
    }
  });

  it("a populated list does not show anything while the switch is off", () => {
    expect(surveyVisible({ SURVEY_CANARY_PATIENT_IDS: LISTED })).toBe(false);
  });

  it("canary and on: it shows", () => {
    expect(surveyVisible({ SURVEY_SEND_MODE: "canary" })).toBe(true);
    expect(surveyVisible({ SURVEY_SEND_MODE: "on" })).toBe(true);
  });
});
