import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({ applyDayByDayScheduleAction: vi.fn() }));

import { DayByDayPanel } from "./DayByDayPanel";

/**
 * SCHED-04 - the same standalone-render guard AlternatingWeeksPanel carries, for
 * the same reason: /horarios has no ToastProvider, and a hook that needs one
 * throws during render and turns the whole page into a black "Application
 * error". That was STAFF-05, and it came back once already on this exact screen.
 *
 * A browser is an expensive way to learn that a component needs a context nobody
 * gives it. This renders it with nothing around it, in milliseconds.
 */
const LOCATIONS = [
  { id: "loc-cb", name: "Castelo Branco" },
  { id: "loc-lv", name: "Linda-a-Velha" },
];

describe("DayByDayPanel - renders standalone", () => {
  it("renders with NO provider of any kind above it", () => {
    expect(() =>
      renderToStaticMarkup(
        <DayByDayPanel therapistId="t-1" therapistName="JP" locations={LOCATIONS} />,
      ),
    ).not.toThrow();
  });

  it("offers the entry point", () => {
    const html = renderToStaticMarkup(
      <DayByDayPanel therapistId="t-1" therapistName="JP" locations={LOCATIONS} />,
    );
    expect(html).toContain("day-grid-open");
  });

  it("offers it with ONE clinic too, unlike the alternating panel", () => {
    // The difference is not an oversight. An alternating pattern needs two
    // clinics to alternate between; an irregular set of dates does not, so a
    // single-location tenant can still use this mode.
    const html = renderToStaticMarkup(
      <DayByDayPanel therapistId="t-1" therapistName="JP" locations={[LOCATIONS[0]!]} />,
    );
    expect(html).toContain("day-grid-open");
  });

  it("NEGATIVE ARM: renders NOTHING when the therapist has no clinic at all", () => {
    const html = renderToStaticMarkup(
      <DayByDayPanel therapistId="t-1" therapistName="JP" locations={[]} />,
    );
    expect(html).toBe("");
  });

  it("the grid is not rendered until a window is chosen", () => {
    // The dialog is closed on first render, so neither the day list nor the save
    // control exists yet. Pins that the panel does not build a 100-row list on
    // mount for every therapist on the roster.
    const html = renderToStaticMarkup(
      <DayByDayPanel therapistId="t-1" therapistName="JP" locations={LOCATIONS} />,
    );
    expect(html).not.toContain("day-grid-days");
    expect(html).not.toContain("day-grid-save");
  });
});
