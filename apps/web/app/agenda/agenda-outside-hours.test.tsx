import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgendaGrid } from "./agenda-grid";
import { gridWindow, type ClinicHours } from "@/lib/scheduling/clinic-hours";
import type { AgendaAppointment } from "@/lib/scheduling/types";

/**
 * AGENDA-NEVER-HIDES — AN APPOINTMENT OUTSIDE THE CLINIC'S HOURS IS DRAWN IN ITS
 * OWN ROW, MARKED, AND REACHABLE.
 *
 * ==========================================================================
 * WHY THE EXISTING TEST DID NOT CATCH THIS
 * ==========================================================================
 * `agenda-grid-hours.test.tsx` already renders an 08:30 booking under a 09:00
 * opening and asserts `html).toContain("Ana Cedo")`. IT PASSES TODAY AND IT
 * PASSED THROUGHOUT THE INCIDENT. `makeMinToPx` CLAMPS a minute below the
 * window to the first rendered hour, so the row was in the markup at the SAME
 * `top` as the 09:00 row, painted underneath it, and could not be clicked. The
 * name being present in a string is not the same claim as the row being
 * reachable, and the gap between those two claims is exactly this defect.
 *
 * So these tests assert POSITION, not presence: two start-groups at different
 * minutes must be drawn at different offsets. That is a property the clamp
 * cannot satisfy and the fix can.
 *
 * Rendered to static markup (node env, no jsdom), as every grid test here is.
 */

const DAY = "2026-07-20"; // a Monday; Lisbon is UTC+1 in July (WEST)
const THERAPIST = { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Tiago Reis" };

/** The hours that caused the incident: opening moved to 09:00. */
const OPENS_NINE: ClinicHours = {
  opensAt: "09:00:00",
  closesAt: "21:00:00",
  middayClosedFrom: null,
  middayClosedTo: null,
};

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
    startsAt: `${DAY}T09:00:00Z`, // 10:00 Lisbon
    endsAt: `${DAY}T10:00:00Z`,
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

/** 08:00 Lisbon in July is 07:00Z. The booking the clinic could not open. */
const EARLY = appt({
  id: "appt-early",
  patientName: "Ana Cedo",
  startsAt: `${DAY}T07:00:00Z`,
  endsAt: `${DAY}T08:00:00Z`,
});
/** 09:00 Lisbon, the first row the clinic's own hours draw. */
const ON_TIME = appt({
  id: "appt-on-time",
  patientName: "Bruno Certo",
  startsAt: `${DAY}T08:00:00Z`,
  endsAt: `${DAY}T09:00:00Z`,
});

function render(view: "day" | "week", appts: AgendaAppointment[], spans = true) {
  const clinicWindow = gridWindow([OPENS_NINE]);
  const dayWindow = spans
    ? gridWindow(
        [OPENS_NINE],
        appts.map((a) => ({
          startMin: lisbonMin(a.startsAt),
          endMin: lisbonMin(a.endsAt),
        })),
      )
    : clinicWindow;
  return renderToStaticMarkup(
    <AgendaGrid
      view={view}
      anchor={DAY}
      appointments={appts}
      onSelectAppointment={() => {}}
      onSelectSlot={() => {}}
      dayWindow={dayWindow}
      clinicWindow={clinicWindow}
    />,
  );
}

/** Minutes from midnight, Lisbon, for a July instant (UTC+1). */
function lisbonMin(iso: string): number {
  const d = new Date(iso);
  return (d.getUTCHours() + 1) * 60 + d.getUTCMinutes();
}

/** Every start-group's rendered `top`, keyed by its start minute. */
function groupTops(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(
    /data-start-min="(\d+)"[^>]*style="([^"]*)"|style="([^"]*)"[^>]*data-start-min="(\d+)"/g,
  )) {
    const min = m[1] ?? m[4]!;
    const style = m[2] ?? m[3]!;
    out[min] = /top:\s*([^;"]+)/.exec(style)?.[1]?.trim() ?? "";
  }
  return out;
}

const hourLabels = (html: string): string[] =>
  [...html.matchAll(/text-v2-text-secondary[^>]*>(\d{2}:\d{2})</g)].map((m) => m[1]!);

describe("an 08:00 booking under a 09:00 opening", () => {
  for (const view of ["day", "week"] as const) {
    it(`${view} view: the 08:00 row is drawn`, () => {
      expect(hourLabels(render(view, [EARLY]))).toContain("08:00");
    });

    // THE ASSERTION THE OLD TEST WAS MISSING.
    it(`${view} view: it is NOT stacked on top of the 09:00 row`, () => {
      const tops = groupTops(render(view, [EARLY, ON_TIME]));
      expect(Object.keys(tops)).toHaveLength(2);
      const early = tops[String(8 * 60)];
      const onTime = tops[String(9 * 60)];
      expect(early, "the 08:00 group must be drawn").toBeDefined();
      expect(onTime, "the 09:00 group must be drawn").toBeDefined();
      expect(early).not.toBe(onTime);
      expect(parseFloat(early!)).toBeLessThan(parseFloat(onTime!));
    });

    it(`${view} view: both patients are on the page`, () => {
      const html = render(view, [EARLY, ON_TIME]);
      expect(html).toContain("Ana Cedo");
      expect(html).toContain("Bruno Certo");
    });
  }

  // The regression, stated as the old behaviour: with the window NOT widened,
  // the two groups collapse onto one offset. This is what production looked like.
  it("WITHOUT the widened window the two rows collapse onto the same offset", () => {
    const tops = groupTops(render("day", [EARLY, ON_TIME], false));
    expect(tops[String(8 * 60)]).toBe(tops[String(9 * 60)]);
  });
});

describe("the rows outside the clinic's hours are marked", () => {
  it("marks the 08:00 slots and leaves the 09:00 ones alone", () => {
    const html = render("day", [EARLY]);
    expect(html).toContain('data-outside-hours="true"');
    // The marked slots are disabled, because classifyStart refuses a
    // before_open booking on every write path.
    expect(/data-outside-hours="true"[^>]*disabled|disabled[^>]*data-outside-hours="true"/.test(html)).toBe(true);
  });

  it("names the reason in the accessible label, not by colour alone", () => {
    expect(render("day", [EARLY])).toContain("Fora do horário da clínica");
  });

  it("marks NOTHING when no appointment falls outside the hours", () => {
    const html = render("day", [ON_TIME]);
    expect(html).not.toContain('data-outside-hours="true"');
    expect(hourLabels(html)).not.toContain("08:00");
  });

  it("marks nothing at all when clinicWindow is not supplied (every old caller)", () => {
    const html = renderToStaticMarkup(
      <AgendaGrid
        view="day"
        anchor={DAY}
        appointments={[EARLY]}
        onSelectAppointment={() => {}}
        onSelectSlot={() => {}}
        dayWindow={{ startMin: 8 * 60, endMin: 20 * 60 }}
      />,
    );
    expect(html).not.toContain('data-outside-hours="true"');
  });
});

describe("a 21:30 booking at a clinic closing 21:00", () => {
  const LATE = appt({
    id: "appt-late",
    patientName: "Carla Tarde",
    startsAt: `${DAY}T20:30:00Z`, // 21:30 Lisbon
    endsAt: `${DAY}T21:30:00Z`,
  });

  it("draws the 21:00 row", () => {
    expect(hourLabels(render("day", [LATE]))).toContain("21:00");
  });

  it("draws the booking and marks the row as outside hours", () => {
    const html = render("day", [LATE]);
    expect(html).toContain("Carla Tarde");
    expect(html).toContain('data-outside-hours="true"');
  });

  // THE GRID MUST NOT CLAIM THE CLINIC CLOSES LATER THAN IT DOES.
  // The window runs to 23:00 to make room for this booking; the closing label
  // is a statement about the CLINIC and still reads 21:00.
  it("still names 21:00 as the closing time, not the last row drawn", () => {
    const html = render("day", [LATE]);
    const label = /data-testid="agenda-closing-label"[^>]*>([^<]*)</.exec(html)?.[1]?.trim();
    expect(label).toBe("21:00");
    expect(hourLabels(html)).toContain("21:00");
  });

  it("falls back to the drawn window when no clinicWindow is given", () => {
    const html = renderToStaticMarkup(
      <AgendaGrid
        view="day"
        anchor={DAY}
        appointments={[]}
        onSelectAppointment={() => {}}
        onSelectSlot={() => {}}
        dayWindow={{ startMin: 8 * 60, endMin: 20 * 60 }}
      />,
    );
    const label = /data-testid="agenda-closing-label"[^>]*>([^<]*)</.exec(html)?.[1]?.trim();
    expect(label).toBe("20:00");
  });
});
