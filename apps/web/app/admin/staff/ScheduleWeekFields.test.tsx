import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * SCHED-08 — a disabled Guardar must say WHY, beside itself.
 *
 * The per-day message was already there and was not enough: it sits inside the
 * offending day's fieldset, and on a seven-day editor that fieldset can be
 * scrolled well off screen. What the person actually sees is a button that is
 * dead with no reason anywhere near it, which is indistinguishable from a
 * broken screen.
 *
 * @osteojp/ui and TimeFieldInput are stubbed; @/lib/i18n is REAL, so the
 * assertions below are against the actual pt-PT strings reception reads.
 */
vi.mock("@osteojp/ui", () => ({
  Button: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) =>
    createElement("button", { "data-testid": "save", "data-disabled": disabled ? "1" : "0" }, children),
}));
vi.mock("@/components/time-field-input", () => ({
  TimeFieldInput: () => createElement("input", { "data-stub": "time" }),
}));

const { ScheduleWeekFields } = await import("./ScheduleWeekFields");
const { s } = await import("@/lib/i18n");

const LOCATIONS = [{ id: "loc-a", name: "Castelo Branco" }];

const day = (over: Partial<Parameters<typeof ScheduleWeekFields>[0]["days"][number]> = {}) => ({
  weekday: 1, label: "Segunda", on: true, id: "t1",
  start: "09:00", end: "17:00", locationId: "loc-a",
  p2On: false, p2Id: "", p2Start: "17:00", p2End: "19:00", datedAhead: null,
  ...over,
});

const render = (days: ReturnType<typeof day>[]): string =>
  renderToStaticMarkup(createElement(ScheduleWeekFields, { days, locations: LOCATIONS }));

/**
 * Just the notice that sits beside Guardar.
 *
 * ASSERTIONS RUN AGAINST THIS AND NOT AGAINST THE WHOLE PAGE, because the whole
 * page already contains every day label and every reason string somewhere -
 * each day's own fieldset prints both. A test that searched the full markup
 * would pass with the notice deleted, which is a test that proves a render
 * happened rather than that it said anything.
 */
const notice = (html: string): string => {
  const at = html.indexOf(s["admin.workingHours.saveBlocked"]);
  if (at < 0) return "";
  return html.slice(at, html.indexOf("</p>", at));
};

describe("SCHED-08 — the blocking reason sits beside Guardar", () => {
  it("a valid week leaves Guardar enabled and prints no blocking notice", () => {
    const html = render([day(), day({ weekday: 2, label: "Terça" })]);
    expect(html).toContain('data-disabled="0"');
    expect(html).not.toContain(s["admin.workingHours.saveBlocked"]);
  });

  it("a day whose second period starts before the first ends NAMES THAT DAY beside the button", () => {
    // The exact pair the old fixed default produced: 09:00-17:00 with a second
    // period at 14:00.
    const html = render([day({ p2On: true, p2Start: "14:00", p2End: "19:00" })]);
    expect(html).toContain('data-disabled="1"');
    // The DAY, so the person knows where to scroll to, and the reason itself -
    // both INSIDE the notice beside the button.
    expect(notice(html)).toContain("Segunda");
    expect(notice(html)).toContain(s["admin.workingHours.period2AfterFirst"]);
  });

  it("names EVERY blocking day, not just the first", () => {
    const html = render([
      day({ p2On: true, p2Start: "14:00", p2End: "19:00" }),
      day({ weekday: 3, label: "Quarta", p2On: true, p2Start: "10:00", p2End: "11:00" }),
    ]);
    expect(notice(html)).toContain("Segunda");
    expect(notice(html)).toContain("Quarta");
  });

  it("a second period that ends before it starts gives its OWN reason, not the other one", () => {
    // Two distinct refusals must not collapse into one message — that is the
    // conflation §1.3 warns about, and it would send the person to fix the
    // wrong field.
    const html = render([day({ end: "13:00", p2On: true, p2Start: "18:00", p2End: "15:00" })]);
    expect(notice(html)).toContain(s["admin.workingHours.period2EndAfterStart"]);
    expect(notice(html)).not.toContain(s["admin.workingHours.period2AfterFirst"]);
  });

  it("a day that is OFF, or has no second period, cannot block the save", () => {
    // Nothing to contradict: the times are still in state but the day is not in play.
    expect(render([day({ on: false, p2On: true, p2Start: "10:00", p2End: "11:00" })]))
      .toContain('data-disabled="0"');
    expect(render([day({ p2On: false, p2Start: "10:00", p2End: "11:00" })]))
      .toContain('data-disabled="0"');
  });
});
