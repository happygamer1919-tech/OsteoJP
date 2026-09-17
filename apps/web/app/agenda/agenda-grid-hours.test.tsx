import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgendaGrid } from "./agenda-grid";
import type { AgendaAppointment } from "@/lib/scheduling/types";

/**
 * AGENDA-2100 — THE GRID DRAWS THE CLINIC'S DAY, TO THE HOUR IT CLOSES.
 *
 * ==========================================================================
 * THE FINDING THIS FILE PINS, AND IT IS THE OPPOSITE OF THE REQUEST
 * ==========================================================================
 * The dispatch says "remove any constant capping the grid at 20:00". THERE IS
 * NO SUCH CONSTANT. `gridWindow` has read `locations.closes_at` since 0085, and
 * `DAY_END_HOUR` survives only as the default argument of two helpers whose
 * call sites both pass the real window. The last row is 19:00-20:00 today
 * because production's `closes_at` IS 20:00 - the column's own default.
 *
 * So the risk is not a cap to delete; it is a cap somebody REINTRODUCES, in a
 * default argument or a clamp, where it would look like tidying. These tests
 * render the component at both sets of hours and fail if the drawn window stops
 * following the data.
 *
 * Rendered to static markup (node env, no jsdom): the now-line timer does not
 * run under SSR, so the render is deterministic - the same reasoning
 * agenda-grid.test.tsx gives.
 */

/** 2026-07-20 is a Monday. Lisbon is UTC+1 in July (WEST). */
const DAY = "2026-07-20";
const THERAPIST = { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Tiago Reis" };

const NEW_WINDOW = { startMin: 9 * 60, endMin: 21 * 60 };
const TODAY_WINDOW = { startMin: 8 * 60, endMin: 20 * 60 };

function appt(over: Partial<AgendaAppointment> = {}): AgendaAppointment {
  return {
    id: "appt-1",
    patientId: "pat-1",
    patientName: "Maria Silva",
    practitionerId: THERAPIST.id,
    practitionerName: THERAPIST.name,
    patientTwoId: null,
    patientTwoName: null,
    practitionerTwoId: null,
    practitionerTwoName: null,
    locationId: "loc-1",
    locationName: "Linda-a-Velha",
    serviceId: "svc-1",
    serviceName: "Osteopatia",
    room: null,
    startsAt: `${DAY}T19:00:00Z`, // 20:00 Lisbon
    endsAt: `${DAY}T20:00:00Z`,
    status: "scheduled",
    notes: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    confirmationState: "pending",
    confirmationReceivedAt: null,
    confirmationChannel: null,
    hasNote: false,
    createdBy: "u-1",
    createdByName: "Rececao Teste",
    createdAt: `${DAY}T06:00:00Z`,
    ...over,
  } as AgendaAppointment;
}

function render(
  view: "day" | "week",
  dayWindow: { startMin: number; endMin: number },
  appts: AgendaAppointment[] = [],
) {
  return renderToStaticMarkup(
    <AgendaGrid
      view={view}
      anchor={DAY}
      appointments={appts}
      onSelectAppointment={() => {}}
      onSelectSlot={() => {}}
      dayWindow={dayWindow}
    />,
  );
}

/** The text of the closing label, which names the boundary rather than a row. */
function closingLabel(html: string): string {
  const m = html.match(/data-testid="agenda-closing-label"[^>]*>([^<]*)</);
  if (!m) throw new Error("the closing label is not rendered");
  return m[1]!.trim();
}

/** Does a 30-minute slot button exist whose accessible name ends at this time? */
function hasSlot(html: string, hhmm: string): boolean {
  return new RegExp(`aria-label="[^"]*\\s${hhmm}"`).test(html);
}

/** The hour labels drawn in the gutter. */
function hourLabels(html: string): string[] {
  return [...html.matchAll(/text-v2-text-secondary[^>]*>(\d{2}:\d{2})</g)].map((m) => m[1]!);
}

describe("AGENDA-2100: a clinic open 09:00-21:00", () => {
  for (const view of ["day", "week"] as const) {
    it(`${view} view: the closing label reads 21:00`, () => {
      expect(closingLabel(render(view, NEW_WINDOW))).toBe("21:00");
    });

    it(`${view} view: the last hour row is 20:00, and 08:00 is not drawn`, () => {
      const labels = hourLabels(render(view, NEW_WINDOW));
      expect(labels).toContain("20:00");
      expect(labels).toContain("09:00");
      expect(labels).not.toContain("08:00");
    });

    it(`${view} view: 20:00 and 20:30 are bookable slots, and 21:00 is not a slot`, () => {
      const html = render(view, NEW_WINDOW);
      expect(hasSlot(html, "20:00")).toBe(true);
      expect(hasSlot(html, "20:30")).toBe(true);
      // `daySlots` yields starts BEFORE the close, so the 21:00 boundary is a
      // label and never a slot - a 21:00 slot would be a booking starting after
      // the clinic shuts.
      expect(hasSlot(html, "21:00")).toBe(false);
    });
  }

  it("draws a 20:00 appointment inside the new last row", () => {
    const html = render("day", NEW_WINDOW, [appt()]);
    expect(html).toContain("Maria Silva");
  });
});

describe("AGENDA-2100: today's hours are untouched by the code change", () => {
  for (const view of ["day", "week"] as const) {
    it(`${view} view: the closing label still reads 20:00`, () => {
      expect(closingLabel(render(view, TODAY_WINDOW))).toBe("20:00");
    });

    it(`${view} view: 19:30 is the last bookable slot, exactly as today`, () => {
      const html = render(view, TODAY_WINDOW);
      expect(hasSlot(html, "19:30")).toBe(true);
      expect(hasSlot(html, "20:00")).toBe(false);
    });
  }

  it("draws 08:00 as the first hour, exactly as today", () => {
    expect(hourLabels(render("day", TODAY_WINDOW))).toContain("08:00");
  });
});

describe("AGENDA-2100: an appointment before opening still has a place on the grid", () => {
  /**
   * The ruling: existing appointments before 09:00 stay, render and report, and
   * are never cancelled. `makeMinToPx` clamps to the first rendered hour, so the
   * row is pinned to the top of the grid rather than given a negative offset and
   * drawn off the card.
   */
  it("renders an 08:30 appointment under a 09:00 opening", () => {
    const early = appt({
      id: "appt-early",
      patientName: "Ana Cedo",
      startsAt: `${DAY}T07:30:00Z`, // 08:30 Lisbon
      endsAt: `${DAY}T08:30:00Z`,
    });
    const html = render("day", NEW_WINDOW, [early]);
    expect(html).toContain("Ana Cedo");
  });

  it("does not drop it from the week view either", () => {
    const early = appt({
      id: "appt-early",
      patientName: "Ana Cedo",
      startsAt: `${DAY}T07:30:00Z`,
      endsAt: `${DAY}T08:30:00Z`,
    });
    expect(render("week", NEW_WINDOW, [early])).toContain("Ana Cedo");
  });
});
