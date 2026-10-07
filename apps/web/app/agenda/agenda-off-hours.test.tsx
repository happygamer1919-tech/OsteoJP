import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgendaGrid } from "./agenda-grid";
import type { AvailabilityTemplate } from "@/lib/scheduling/availability";
import type { BlockSpan } from "@/lib/scheduling/blocked-time-core";
import { offHoursByDate, schedulesByClinic, type OffHoursByDate } from "@/lib/scheduling/off-hours-core";
import { daySlots, viewDates } from "@/lib/scheduling/time";

/**
 * AGENDA-OFF-HOURS - THE BAND ON THE DESKTOP GRID.
 *
 * off-hours-core.test.ts pins WHICH slots are outside the therapist's hours,
 * against the write path's own check. This file pins what the grid does with
 * that answer: where the band is drawn, what it is called, that the slots under
 * it stay enabled, and that it gives way to a block and to the clinic.
 *
 * THE INPUT IS BUILT THE WAY page.tsx BUILDS IT (`offHoursByDate` over
 * `daySlots` of the same window), not typed in by hand, so a change to the
 * shape the page sends cannot leave these tests asserting about a prop nobody
 * passes.
 *
 * Rendered to static markup (node env, no jsdom), as every grid test here is.
 */

// A Monday. Lisbon is UTC+1 in July (WEST), so 19:30 Lisbon is 18:30Z.
const DAY = "2026-07-20";
const CLINIC = "loc-1";
const WINDOW = { startMin: 8 * 60, endMin: 21 * 60 };
/** Base height of an hour row in the grid (two 48px slots). */
const HOUR_PX = 96;

/** Works 09:00-13:00 and 14:00-19:00, Monday to Friday. */
const SPLIT: AvailabilityTemplate[] = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startTime: "09:00:00", endTime: "13:00:00", validFrom: null, validUntil: null, isActive: true, locationId: CLINIC },
  { weekday, startTime: "14:00:00", endTime: "19:00:00", validFrom: null, validUntil: null, isActive: true, locationId: CLINIC },
]);

function offHoursFor(
  view: "day" | "week",
  templates: AvailabilityTemplate[],
  win = WINDOW,
): OffHoursByDate {
  return offHoursByDate({
    dates: viewDates(view, DAY),
    slots: daySlots(win.startMin, win.endMin),
    clinics: schedulesByClinic(templates, [CLINIC]),
  });
}

function render(over: Partial<Parameters<typeof AgendaGrid>[0]> = {}): string {
  return renderToStaticMarkup(
    <AgendaGrid
      view="day"
      anchor={DAY}
      appointments={[]}
      onSelectAppointment={() => {}}
      onSelectSlot={() => {}}
      dayWindow={WINDOW}
      {...over}
    />,
  );
}

/** Each off-hours band's `top` and `height`, in px, in DOM order. */
function bands(html: string): { top: number; height: number }[] {
  return [...html.matchAll(/<div[^>]*data-testid="agenda-off-hours-band"[^>]*>/g)].map((m) => {
    const style = /style="([^"]*)"/.exec(m[0])?.[1] ?? "";
    return {
      top: parseFloat(/top:\s*([^;"]+)/.exec(style)?.[1] ?? "NaN"),
      height: parseFloat(/height:\s*([^;"]+)/.exec(style)?.[1] ?? "NaN"),
    };
  });
}

/** The opening tag of the slot button whose accessible name holds `time`. */
function slot(html: string, time: string): string {
  const tag = [...html.matchAll(/<button[^>]*aria-label="[^"]*"[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => new RegExp(`aria-label="[^"]* ${time}( - [^"]*)?"`).test(t));
  if (!tag) throw new Error(`no slot button for ${time}`);
  return tag;
}

const label = (tag: string): string => /aria-label="([^"]*)"/.exec(tag)?.[1] ?? "";
const px = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return ((h! * 60 + m! - WINDOW.startMin) / 60) * HOUR_PX;
};

describe("one therapist selected: the hours they do not work are drawn", () => {
  const html = render({ offHours: offHoursFor("day", SPLIT) });

  it("draws one band per run: before the start, the midday gap, after the stop", () => {
    expect(bands(html)).toEqual([
      { top: px("08:00"), height: HOUR_PX },
      { top: px("13:00"), height: HOUR_PX },
      { top: px("19:00"), height: 2 * HOUR_PX },
    ]);
  });

  it("says so in words, in the error scale's own tokens and not the block's hatch or the closure's grey", () => {
    const band = /<div[^>]*data-testid="agenda-off-hours-band"[^>]*>.*?<\/div>/.exec(html)?.[0] ?? "";
    expect(band).toContain("Fora do horário");
    expect(band).toContain("text-error-800");
    expect(band).toContain("border-error-200");
    expect(band).not.toContain("repeating-linear-gradient");
    expect(band).not.toContain("bg-v2-text-primary");
    // Takes no click from the slot beneath it.
    expect(band).toContain("pointer-events-none");
    expect(slot(html, "19:00")).toContain("bg-error-bg/70");
  });

  it("names the reason on the slot: the day, the time, then the therapist's hours", () => {
    expect(label(slot(html, "19:30"))).toMatch(/ 19:30 - fora do horário do terapeuta$/);
    expect(label(slot(html, "08:00"))).toMatch(/ 08:00 - fora do horário do terapeuta$/);
    expect(label(slot(html, "13:30"))).toMatch(/ 13:30 - fora do horário do terapeuta$/);
  });

  it("marks exactly the slots outside the hours, by their own attribute", () => {
    const marked = [...html.matchAll(/<button[^>]*data-therapist-off-hours="true"[^>]*>/g)].map(
      (m) => /aria-label="[^"]* (\d{2}:\d{2}) - /.exec(m[0])?.[1],
    );
    expect(marked).toEqual(["08:00", "08:30", "13:00", "13:30", "19:00", "19:30", "20:00", "20:30"]);
  });

  it("leaves the slots ENABLED: the click, the drawer and the refusal are unchanged", () => {
    for (const time of ["08:00", "13:30", "19:00", "20:30"]) {
      expect(slot(html, time), time).not.toMatch(/\sdisabled(=|\s|>)/);
      expect(slot(html, time), time).not.toContain("cursor-not-allowed");
    }
  });

  it("leaves a slot inside the hours exactly as it was", () => {
    const inside = slot(html, "10:00");
    expect(label(inside)).toMatch(/ 10:00$/);
    expect(inside).not.toContain("data-therapist-off-hours");
    expect(inside).not.toContain("bg-error-bg");
    expect(inside).toContain("hover:bg-v2-green-50");
    // And it is byte-identical to the same slot with no off-hours prop at all.
    expect(inside).toBe(slot(render(), "10:00"));
  });

  it("does not answer to the clinic-hours marker or to either other band's test id", () => {
    expect(html).not.toContain("data-outside-hours");
    expect(html).not.toContain('data-testid="agenda-closure-band"');
    expect(html).not.toContain('data-testid="agenda-blocked-band"');
    expect(html).not.toContain("Fora do horário da clínica");
  });

  it("week view: each day gets its own bands, and Saturday (not worked) is one band", () => {
    const week = render({ view: "week", offHours: offHoursFor("week", SPLIT) });
    // Monday to Friday three runs each, Saturday one run from open to close.
    expect(bands(week)).toHaveLength(5 * 3 + 1);
    const saturday = week.slice(week.indexOf('data-day="2026-07-25"'));
    expect(bands(saturday)).toEqual([{ top: 0, height: 13 * HOUR_PX }]);
  });
});

describe("all therapists shown, or no hours configured: nothing changes", () => {
  const plain = render();

  it("no off-hours prop: no band, no marker, no tint, no label", () => {
    expect(plain).not.toContain("agenda-off-hours-band");
    expect(plain).not.toContain("data-therapist-off-hours");
    expect(plain).not.toContain("bg-error-bg");
    expect(plain).not.toContain("Fora do horário");
  });

  it("an empty map (what the page sends for all therapists) renders the same bytes", () => {
    expect(render({ offHours: {} })).toBe(plain);
  });

  it("a therapist with no hours configured renders the same bytes", () => {
    expect(offHoursFor("week", [])).toEqual({});
    expect(render({ view: "week", offHours: offHoursFor("week", []) })).toBe(render({ view: "week" }));
  });

  it("another day's runs draw nothing on this one", () => {
    expect(render({ offHours: { "2026-07-21": [{ startMin: 480, endMin: 1260 }] } })).toBe(plain);
  });
});

describe("a block wins over off hours", () => {
  // 19:30-20:30 Lisbon, inside the 19:00-21:00 off-hours run.
  const BLOCK: BlockSpan = {
    id: "block-1",
    startsAt: `${DAY}T18:30:00.000Z`,
    endsAt: `${DAY}T19:30:00.000Z`,
    reason: "other",
    note: "Formação",
  };
  const html = render({ offHours: offHoursFor("day", SPLIT), blocks: [BLOCK] });

  it("the off-hours band is cut around the blocked slots and the block band is drawn", () => {
    expect(html).toContain('data-testid="agenda-blocked-band"');
    expect(bands(html)).toEqual([
      { top: px("08:00"), height: HOUR_PX },
      { top: px("13:00"), height: HOUR_PX },
      { top: px("19:00"), height: HOUR_PX / 2 },
      { top: px("20:30"), height: HOUR_PX / 2 },
    ]);
  });

  it("a blocked slot keeps the block's name, stays disabled and carries no off-hours marker", () => {
    for (const time of ["19:30", "20:00"]) {
      const tag = slot(html, time);
      expect(label(tag), time).toMatch(/ - Tempo bloqueado$/);
      expect(tag, time).toMatch(/\sdisabled(=|\s|>)/);
      expect(tag, time).not.toContain("data-therapist-off-hours");
      expect(tag, time).not.toContain("bg-error-bg");
    }
  });

  it("the slots either side of the block are still off hours", () => {
    expect(label(slot(html, "19:00"))).toMatch(/ - fora do horário do terapeuta$/);
    expect(label(slot(html, "20:30"))).toMatch(/ - fora do horário do terapeuta$/);
  });

  it("an absence over the whole day leaves no off-hours band at all", () => {
    const allDay: BlockSpan = {
      id: "block-day",
      startsAt: `${DAY}T00:00:00.000Z`,
      endsAt: `${DAY}T23:00:00.000Z`,
      reason: "vacation",
      note: null,
    };
    const absent = render({ offHours: offHoursFor("day", SPLIT), blocks: [allDay] });
    expect(absent).toContain('data-testid="agenda-blocked-band"');
    expect(bands(absent)).toEqual([]);
    expect(absent).not.toContain("data-therapist-off-hours");
    expect(label(slot(absent, "20:00"))).toMatch(/ - Tempo bloqueado$/);
  });

  it("the block band sits above the off-hours band (z-10 against none)", () => {
    const off = /<div[^>]*data-testid="agenda-off-hours-band"[^>]*>/.exec(html)?.[0] ?? "";
    const block = /<(?:div|button)[^>]*data-testid="agenda-blocked-band"[^>]*>/.exec(html)?.[0] ?? "";
    expect(off).not.toMatch(/\bz-\d/);
    expect(block).toMatch(/\bz-10\b/);
  });
});

describe("the clinic wins over off hours", () => {
  const CLOSURE = { startMin: 13 * 60, endMin: 14 * 60, locationName: "Clínica Teste" };

  it("no off-hours band over the clinic's closure; the closure band and its name stay", () => {
    const html = render({ offHours: offHoursFor("day", SPLIT), closure: CLOSURE });
    expect(html).toContain('data-testid="agenda-closure-band"');
    // The 13:00-14:00 run is gone; the other two are untouched.
    expect(bands(html)).toEqual([
      { top: px("08:00"), height: HOUR_PX },
      { top: px("19:00"), height: 2 * HOUR_PX },
    ]);
    for (const time of ["13:00", "13:30"]) {
      const tag = slot(html, time);
      expect(label(tag), time).toMatch(/ - Clínica encerrada$/);
      expect(tag, time).toMatch(/\sdisabled(=|\s|>)/);
      expect(tag, time).not.toContain("data-therapist-off-hours");
    }
  });

  it("a closure that covers only part of an off-hours run cuts it, and the rest is still drawn", () => {
    // Closure 20:00-21:00 over the 19:00-21:00 run.
    const html = render({
      offHours: offHoursFor("day", SPLIT),
      closure: { startMin: 20 * 60, endMin: 21 * 60, locationName: "Clínica Teste" },
    });
    expect(bands(html)).toEqual([
      { top: px("08:00"), height: HOUR_PX },
      { top: px("13:00"), height: HOUR_PX },
      { top: px("19:00"), height: HOUR_PX },
    ]);
  });

  it("a row outside the clinic's own hours keeps the clinic's name, not the therapist's", () => {
    // The clinic opens at 09:00 and the 08:00 row is drawn only because the
    // window was widened (AGENDA-NEVER-HIDES). The therapist starts at 10:00.
    const late = SPLIT.map((t) => (t.startTime === "09:00:00" ? { ...t, startTime: "10:00:00" } : t));
    const html = render({
      offHours: offHoursFor("day", late),
      clinicWindow: { startMin: 9 * 60, endMin: 21 * 60 },
    });
    const outside = slot(html, "08:00");
    expect(label(outside)).toMatch(/ - Fora do horário da clínica$/);
    expect(outside).toContain('data-outside-hours="true"');
    expect(outside).not.toContain("data-therapist-off-hours");
    // The off-hours band starts where the clinic's hours do.
    expect(bands(html)[0]).toEqual({ top: px("09:00"), height: HOUR_PX });
    expect(label(slot(html, "09:30"))).toMatch(/ - fora do horário do terapeuta$/);
  });
});
