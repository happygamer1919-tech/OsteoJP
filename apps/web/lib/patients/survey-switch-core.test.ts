/**
 * survey-switch-core.test.ts: SAT-01 (S8). WHO IS OFFERED THE PATIENT'S SURVEY
 * SWITCH ON THE FICHA, role by role and switch state by switch state.
 *
 * The rule is asked twice, by the page that draws the switch and by the write
 * behind it, and both ask this one function. The table is the rule.
 */
import { describe, expect, it } from "vitest";
import { ROLES, type Role } from "@osteojp/auth";
import { surveyVisible } from "@/lib/reminders/survey-mode";
import { offersSurveySwitch } from "./survey-switch-core";

const OFFERED: Record<Role, boolean> = {
  owner: true,
  admin: true,
  reception: true,
  therapist: false,
};

describe("the survey switch is offered to owner, admin and reception, and only while the survey exists", () => {
  it("the table names every role there is", () => {
    expect(Object.keys(OFFERED).sort()).toEqual([...ROLES].sort());
  });

  it.each(ROLES.map((role) => [role] as const))("%s, with the survey visible", (role) => {
    expect(offersSurveySwitch(role, true)).toBe(OFFERED[role]);
  });

  it.each(ROLES.map((role) => [role] as const))("%s, with the survey switched off: never", (role) => {
    expect(offersSurveySwitch(role, false)).toBe(false);
  });

  it("CONTROL: the table has both answers in it", () => {
    expect(new Set(Object.values(OFFERED))).toEqual(new Set([true, false]));
  });
});

describe("read through the survey's own switch", () => {
  const offered = (mode: string | undefined) =>
    offersSurveySwitch("reception", surveyVisible({ SURVEY_SEND_MODE: mode }));

  it("off, unset and every near-miss value: nothing is offered", () => {
    for (const mode of [undefined, "", "off", "ON", "On", " on", "on ", "on\n", "Canary", "true", "1"]) {
      expect(offered(mode), JSON.stringify(mode)).toBe(false);
    }
  });

  it("canary and on: offered", () => {
    expect(offered("canary")).toBe(true);
    expect(offered("on")).toBe(true);
  });
});
