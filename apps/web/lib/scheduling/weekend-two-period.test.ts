import { describe, expect, it } from "vitest";

import { buildDay } from "./day-availability-core";
import { lisbonWeekday, type AvailabilityTemplate } from "./availability";

/**
 * SCHED-12 — SATURDAY AND SUNDAY ON A TWO-PERIOD DAY.
 *
 * REPORTED: "ZZ TESTE THERAPIST" has Sábado 08:00-13:00 plus a second period
 * 14:00-19:00 at OsteoJP (LV). Nova marcação for Saturday 2026-09-05 08:00 at
 * that clinic answers "O terapeuta não tem horário de trabalho definido neste
 * dia."; Friday 2026-09-04 08:00 books fine.
 *
 * That message is rendered by availability-panel.tsx on exactly one condition:
 * `day.working.length === 0`. So the question is whether the RESOLVER returns
 * no working windows for a weekend two-period day - which is what these tests
 * ask, at the two boundaries a weekday index can get wrong.
 *
 * WHY SATURDAY AND SUNDAY BOTH. Saturday is 6, the top of the range, and Sunday
 * is 0, the bottom - and the schedule EDITOR renders them in the order
 * [1,2,3,4,5,6,0], so the two weekend days sit at opposite ends of two
 * different orderings. An off-by-one in either direction lands on one of them
 * and on nothing else, which is precisely why a bug here shows up on Saturday
 * while Friday is fine.
 */

const tpl = (weekday: number, startTime: string, endTime: string): AvailabilityTemplate => ({
  weekday,
  startTime,
  endTime,
  validFrom: null,
  validUntil: null,
  isActive: true,
});

/** Working windows as Lisbon "HH:mm-HH:mm", for readable assertions. */
const workingHours = (day: ReturnType<typeof buildDay>): string[] => {
  const hhmm = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  return day.working.map((w) => `${hhmm(w.start)}-${hhmm(w.end)}`);
};

describe("SCHED-12 — the weekday index at the week boundary", () => {
  it("maps the reported dates to the weekdays the editor stores", () => {
    // 0 = Sunday .. 6 = Saturday, matching availability_templates.weekday.
    expect(lisbonWeekday("2026-09-04")).toBe(5); // Friday, the one that works
    expect(lisbonWeekday("2026-09-05")).toBe(6); // Saturday, the one reported
    expect(lisbonWeekday("2026-09-06")).toBe(0); // Sunday
  });
});

describe("SCHED-12 — a two-period SATURDAY resolves to two working windows", () => {
  const SATURDAY = "2026-09-05";
  const templates = [tpl(6, "08:00", "13:00"), tpl(6, "14:00", "19:00")];

  it("returns BOTH periods, so the panel cannot say 'sem horário'", () => {
    const day = buildDay(SATURDAY, templates, []);
    expect(workingHours(day)).toEqual(["08:00-13:00", "14:00-19:00"]);
    // The exact condition availability-panel.tsx renders the refusal on.
    expect(day.working.length).toBeGreaterThan(0);
  });

  it("08:00 falls inside the FIRST period, which is the slot that was refused", () => {
    const day = buildDay(SATURDAY, templates, []);
    const first = day.working[0]!;
    expect(new Date(first.start).toISOString()).toBe(
      new Date(Date.UTC(2026, 8, 5, 7, 0)).toISOString(), // 08:00 Lisbon = 07:00Z in September
    );
  });

  it("the SAME templates on Friday's weekday still work - the control", () => {
    // Friday books fine in the report, so a test that only proved Saturday
    // would not distinguish "Saturday is broken" from "two periods are broken".
    const day = buildDay("2026-09-04", [tpl(5, "08:00", "13:00"), tpl(5, "14:00", "19:00")], []);
    expect(workingHours(day)).toEqual(["08:00-13:00", "14:00-19:00"]);
  });
});

describe("SCHED-12 — a two-period SUNDAY resolves too (weekday 0, the other boundary)", () => {
  it("returns both periods for Sunday", () => {
    const day = buildDay("2026-09-06", [tpl(0, "08:00", "13:00"), tpl(0, "14:00", "19:00")], []);
    expect(workingHours(day)).toEqual(["08:00-13:00", "14:00-19:00"]);
  });

  it("a Saturday template does NOT leak into Sunday, and vice versa", () => {
    // The negative arm. Without it, a resolver that ignored `weekday` entirely
    // would pass every test above.
    expect(buildDay("2026-09-06", [tpl(6, "08:00", "13:00")], []).working).toHaveLength(0);
    expect(buildDay("2026-09-05", [tpl(0, "08:00", "13:00")], []).working).toHaveLength(0);
  });
});
