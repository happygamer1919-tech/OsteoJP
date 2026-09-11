import { describe, expect, it } from "vitest";
import { needsProlongadaWarning, prolongadaWarning } from "./prolongada-warning";
import { s } from "@/lib/i18n";

const STRINGS = {
  title: s["admin.workingHours.prolongadaWarnTitle"],
  scope: s["admin.workingHours.prolongadaWarnScope"],
  effect: s["admin.workingHours.prolongadaWarnEffect"],
  wrongTool: s["admin.workingHours.prolongadaWarnWrongTool"],
};

describe("SCHED-23 - when the warning fires", () => {
  it("fires for prolongada with both dates", () => {
    expect(
      needsProlongadaWarning({ mode: "prolongada", startDate: "2026-09-21", endDate: "2026-09-25" }),
    ).toBe(true);
  });

  it.each(["pontual", "lote"])("does NOT fire for %s", (mode) => {
    // Warning about an hour range would teach reception to click through the
    // warning that matters.
    expect(
      needsProlongadaWarning({ mode, startDate: "2026-09-21", endDate: "2026-09-25" }),
    ).toBe(false);
  });

  it("does not fire on a half-filled form - the warning quotes the dates", () => {
    expect(
      needsProlongadaWarning({ mode: "prolongada", startDate: "2026-09-21", endDate: "" }),
    ).toBe(false);
  });
});

describe("SCHED-23 - what the warning says", () => {
  const w = prolongadaWarning(STRINGS, {
    therapistName: "JP",
    startDate: "2026-09-21",
    endDate: "2026-09-25",
  });

  it("names the therapist, both dates in Portuguese order, and every clinic", () => {
    expect(w.scope).toContain("JP");
    expect(w.scope).toContain("21/09/2026");
    expect(w.scope).toContain("25/09/2026");
    expect(w.scope).toContain("todas as clínicas");
  });

  it("says booking stops for reception AND the portal", () => {
    expect(w.effect).toContain("receção");
    expect(w.effect).toContain("portal");
  });

  it("promises the existing appointments survive", () => {
    // Q-W5-4: scheduling data is never silently destroyed, and the person
    // pressing this button needs to know that before they hesitate over it.
    expect(w.effect).toContain("não são canceladas");
  });

  it("THE PARAGRAPH THE OUTAGE NEEDED: it names Definir dia a dia", () => {
    // Stating the consequence alone leaves somebody who genuinely needs "at the
    // other clinic this week" with nowhere to go - so they press through and do
    // the same thing again.
    expect(w.wrongTool).toContain("Definir dia a dia");
    expect(w.wrongTool).toContain("não muda o local de trabalho");
  });

  it("leaves no placeholder unfilled", () => {
    for (const line of [w.scope, w.effect, w.wrongTool]) {
      expect(line, `an unfilled placeholder reached the screen: ${line}`).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it("falls back to the start date when only one day is set", () => {
    const one = prolongadaWarning(STRINGS, {
      therapistName: "JP",
      startDate: "2026-09-21",
      endDate: "",
    });
    expect(one.scope).toContain("21/09/2026");
    expect(one.scope).not.toContain("undefined");
  });
});
