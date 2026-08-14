import { describe, it, expect } from "vitest";
import { deepLinkWindow } from "./deep-link-window";

/**
 * ITEM 4 - the window a "Ver marcação" deep link must produce.
 *
 * THE FAILURE THIS GUARDS IS A SILENT ONE. Every wrong answer here still renders
 * a perfectly normal-looking list; it just does not contain the appointment the
 * notification promised. Reception would read that as "the appointment is gone".
 */
const MAX = 92;
const w = (from: string, to: string, targetDate: string | null) =>
  deepLinkWindow({ from, to, targetDate, maxWindowDays: MAX });

describe("ITEM 4 - deepLinkWindow", () => {
  it("no link: the requested range is returned untouched", () => {
    expect(w("2026-08-10", "2026-08-15", null)).toEqual({
      from: "2026-08-10",
      to: "2026-08-15",
    });
  });

  it("a target INSIDE the range changes nothing", () => {
    expect(w("2026-08-10", "2026-08-15", "2026-08-12")).toEqual({
      from: "2026-08-10",
      to: "2026-08-15",
    });
  });

  it("a target AFTER the range extends the end to reach it", () => {
    expect(w("2026-08-10", "2026-08-15", "2026-08-20")).toEqual({
      from: "2026-08-10",
      to: "2026-08-20",
    });
  });

  it("a target BEFORE the range extends the start to reach it", () => {
    expect(w("2026-08-10", "2026-08-15", "2026-08-03")).toEqual({
      from: "2026-08-03",
      to: "2026-08-15",
    });
  });

  it("NEGATIVE ARM: widening never NARROWS the range the user asked for", () => {
    // The user explicitly asked for a month; a link to one day inside it must
    // not collapse their view to that day.
    const out = w("2026-08-01", "2026-08-31", "2026-08-15");
    expect(out).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("a FAR target anchors on its own day rather than returning a window that cannot contain it", () => {
    // Eight months out. Clamping forward from `from` would return
    // 2026-08-10..2026-11-09 - a valid-looking window that provably excludes the
    // target. That is the fail-silent shape this function exists to avoid.
    const out = w("2026-08-10", "2026-08-15", "2027-04-01");
    expect(out).toEqual({ from: "2027-04-01", to: "2027-04-01" });
    // The property that matters, stated directly:
    expect(out.from <= "2027-04-01" && "2027-04-01" <= out.to).toBe(true);
  });

  it("a far target in the PAST anchors on its own day too", () => {
    const out = w("2026-08-10", "2026-08-15", "2025-01-05");
    expect(out).toEqual({ from: "2025-01-05", to: "2025-01-05" });
  });

  it("NEGATIVE ARM: the 92-day ceiling still binds when there is no link", () => {
    const out = w("2026-01-01", "2026-12-31", null);
    expect(out.from).toBe("2026-01-01");
    expect(out.to).toBe("2026-04-02"); // 2026-01-01 + 91 days
  });

  it("THE INVARIANT, over every case: a resolved target is always inside the window", () => {
    const cases: [string, string, string][] = [
      ["2026-08-10", "2026-08-15", "2026-08-12"],
      ["2026-08-10", "2026-08-15", "2026-08-20"],
      ["2026-08-10", "2026-08-15", "2026-08-03"],
      ["2026-08-10", "2026-08-15", "2027-04-01"],
      ["2026-08-10", "2026-08-15", "2025-01-05"],
      ["2026-01-01", "2026-12-31", "2026-06-15"],
    ];
    for (const [from, to, target] of cases) {
      const out = w(from, to, target);
      expect(
        out.from <= target && target <= out.to,
        `${target} fell outside ${out.from}..${out.to}`,
      ).toBe(true);
    }
  });
});
