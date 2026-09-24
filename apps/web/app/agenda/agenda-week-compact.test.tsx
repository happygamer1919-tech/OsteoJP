import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgendaWeekCompact, CompactWeekView } from "./agenda-week-compact";
import { s } from "@/lib/i18n";
import { buildCompactWeek } from "@/lib/scheduling/agenda-compact-core";
import type { BlockSpan } from "@/lib/scheduling/blocked-time-core";
import { lisbonMinutesFromMidnight, todayInLisbon } from "@/lib/scheduling/time";
import type { AgendaAppointment } from "@/lib/scheduling/types";

/**
 * AGENDA-MOBILE-WEEK - the phone's Semana grid, as MARKUP, plus source guards
 * on where agenda-view.tsx mounts it.
 *
 * WHAT THIS IS FOR. agenda-compact-core.test.ts decides the values. This file
 * asserts the properties that only exist once they are rendered: that nothing
 * here answers to a selector the desktop grid or the phone list answers to
 * (all three trees are in the DOM at every width), that the face carries the
 * time and the first name while the accessible name carries the rest, and that
 * the render reads no clock.
 *
 * IT IS NOT EVIDENCE ABOUT A PHONE: renderToStaticMarkup has no layout. Whether
 * the grid fits 390px and a twin pair sits side by side is
 * e2e/agenda-mobile-week.spec.ts's question, measured with bounding boxes.
 */

const WED = "2026-09-23";
const SUN = "2026-09-27";

function iso(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${date}T${String(h! - 1).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
}

function appt(over: Partial<AgendaAppointment> & { id: string }): AgendaAppointment {
  return {
    patientId: `p-${over.id}`,
    patientName: "Bartolomeu Sintetico Teste",
    practitionerId: "t-1",
    practitionerName: "Terapeuta Sintetico",
    colorKey: null,
    patientTwoId: null,
    patientTwoName: null,
    practitionerTwoId: null,
    practitionerTwoName: null,
    locationId: "loc-1",
    locationName: "Clinica",
    serviceId: "svc-1",
    serviceName: "Osteopatia",
    room: null,
    startsAt: iso(WED, "10:00"),
    endsAt: iso(WED, "10:45"),
    status: "scheduled",
    notes: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    confirmationState: "pending",
    confirmationChannel: null,
    confirmationReceivedAt: null,
    hasNote: false,
    createdBy: null,
    createdByName: null,
    createdAt: iso(WED, "01:00"),
    ...over,
  } as AgendaAppointment;
}

function render(over: Partial<Parameters<typeof AgendaWeekCompact>[0]> = {}) {
  return renderToStaticMarkup(
    <AgendaWeekCompact
      anchor={WED}
      appointments={[]}
      onSelectAppointment={() => {}}
      onSelectDay={() => {}}
      {...over}
    />,
  );
}

describe("AgendaWeekCompact markup", () => {
  it("answers to NO handle the desktop grid or the phone list answers to", () => {
    const block: BlockSpan = {
      id: "b-1",
      startsAt: iso(WED, "14:00"),
      endsAt: iso(WED, "15:00"),
      reason: "x",
      note: "nota",
    };
    const html = render({
      appointments: [appt({ id: "a1" }), appt({ id: "a2", practitionerId: "nesa-1", practitionerName: "NESA" })],
      blocks: [block],
      closure: { startMin: 13 * 60, endMin: 14 * 60, locationName: "Clinica" },
    });

    // The grid's attributes and test ids. Eleven e2e files select on
    // `data-appointment-id`, one of them unscoped; four desktop specs read
    // `agenda-weekday-header`; three read `agenda-closing-label`.
    for (const handle of [
      "data-day=",
      "data-header-day=",
      "data-appointment-id=",
      "data-start-min=",
      "data-outside-hours=",
      "data-block-id=",
      'data-testid="agenda-weekday-header"',
      'data-testid="agenda-time-gutter"',
      'data-testid="agenda-closing-label"',
      'data-testid="agenda-start-group"',
      'data-testid="agenda-card-patient"',
      'data-testid="agenda-blocked-band"',
      'data-testid="agenda-closure-band"',
      // ...and the phone list's, which is in the DOM beside this one.
      "data-list-",
      'data-testid="week-list-patient"',
      'data-testid="agenda-week-list"',
    ]) {
      expect(html, handle).not.toContain(handle);
    }

    // CONTROLS, SAME RENDER: the prefixed forms ARE there, so the absences
    // above measured the prefix, not an empty render.
    expect(html.match(/data-compact-day="/g) ?? []).toHaveLength(6);
    expect(html.match(/data-compact-header-day="/g) ?? []).toHaveLength(6);
    expect(html.match(/data-compact-appointment-id="/g) ?? []).toHaveLength(2);
    expect(html).toContain('data-compact-band-kind="block"');
    expect(html).toContain('data-compact-band-kind="closure"');
    expect(html).toContain('data-testid="agenda-compact-axis"');
  });

  it("the face is the time and the FIRST name; the accessible name carries the rest", () => {
    const html = render({ appointments: [appt({ id: "a1" })] });
    // The visible face.
    expect(html).toMatch(/>10:00</);
    expect(html).toMatch(/data-testid="agenda-compact-patient"[^>]*>Bartolomeu</);
    // The surname is NOT on the face (it is in the aria-label only).
    expect(html).not.toMatch(/>[^<]*Sintetico Teste[^<]*</);
    // The accessible name: time, full name, whose row, service, status.
    expect(html).toContain(
      `aria-label="10:00, Bartolomeu Sintetico Teste, Terapeuta Sintetico, Osteopatia, ${s["appointment.status"]}: ${s["appointment.status.scheduled"]}"`,
    );
  });

  it("a twin pair renders as two blocks in two lanes; four at once render one block and +3", () => {
    const twin = render({
      appointments: [
        appt({ id: "person" }),
        appt({ id: "machine", practitionerId: "nesa-1", practitionerName: "NESA" }),
      ],
      sharedResourceIds: new Set(["nesa-1"]),
    });
    expect(twin).toMatch(/data-compact-appointment-id="person" data-compact-lane="0" data-compact-lanes="2"/);
    expect(twin).toMatch(/data-compact-appointment-id="machine" data-compact-lane="1" data-compact-lanes="2"/);
    expect(twin).not.toContain('data-testid="agenda-compact-more"');

    const four = render({
      appointments: ["a", "b", "c", "d"].map((id) => appt({ id })),
    });
    expect(four.match(/data-compact-appointment-id="/g) ?? []).toHaveLength(1);
    expect(four).toMatch(/data-testid="agenda-compact-more" data-compact-more-count="3"/);
    expect(four).toMatch(/>\+3<\/button>/);
    expect(four).toContain(s["agenda.moreMany"].replace("{n}", "3"));
  });

  it("Dom is a column only when a Sunday holds a booking (Q-B6-5)", () => {
    const without = render({ appointments: [appt({ id: "a1" })] });
    expect(without.match(/data-compact-day="/g) ?? []).toHaveLength(6);
    expect(without).not.toContain('data-compact-label="Dom');
    expect(without).toContain('data-compact-label="S\u00e1b 26"'); // CONTROL: the labels are there, just not Dom
    const withSunday = render({
      appointments: [appt({ id: "s1", startsAt: iso(SUN, "10:00"), endsAt: iso(SUN, "10:45") })],
    });
    expect(withSunday.match(/data-compact-day="/g) ?? []).toHaveLength(7);
    expect(withSunday).toContain(`data-compact-day="${SUN}"`);
    expect(withSunday).toContain('data-compact-label="Dom 27"');
  });

  it("the day header is a button into Dia, showing a 3-letter day and NAMED with the full one", () => {
    const html = render();
    const cell = html.match(new RegExp(`<button[^>]*data-compact-header-day="${WED}"[^>]*>(.*?)</button>`));
    expect(cell, "the Wednesday header is a button").not.toBeNull();
    expect(cell![1]).toContain('data-compact-label="Qua 23"');
    expect(cell![1]).toContain("before:content-[attr(data-compact-label)]");
    expect(cell![0]).toMatch(new RegExp(`aria-label="${s["agenda.openDay"]} Qua[^"]* 23"`));
  });

  it("W3-08's desktop locators find nothing here: no text node starts with a weekday, even with Dom shown", () => {
    // Four desktop specs assert `page.getByText(/^dom/i)` counts zero and read
    // `page.getByText(/^s\u00e1b/i).first()`. A text locator matches a hidden
    // element, so this tree must hold no such text at any width.
    const html = render({
      appointments: [
        appt({ id: "a1" }),
        appt({ id: "s1", startsAt: iso(SUN, "10:00"), endsAt: iso(SUN, "10:45") }),
      ],
    });
    const texts = [...html.matchAll(/>([^<]+)</g)].map((m) => m[1]!.trim()).filter(Boolean);
    const weekday = /^(seg|ter|qua|qui|sex|s\u00e1b|sab|dom)/i;
    expect(texts.filter((t) => weekday.test(t))).toEqual([]);
    // CONTROLS: the render is not empty of text, and the seven labels ARE
    // there, Dom included, where a text locator does not look.
    expect(texts).toContain("10:00");
    const labels = [...html.matchAll(/data-compact-label="([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toHaveLength(7);
    expect(labels[6]).toBe("Dom 27");
    expect(labels.every((l) => weekday.test(l!))).toBe(true);
  });

  it("the axis labels every hour AND the window's end on the bottom edge; the rules are hour rules only (W13-B)", () => {
    // 26px per 30-minute row, so 52px per hour from the window's start.
    const px = (m: number, start = 8 * 60) => ((m - start) / 30) * 26;
    const axis = (html: string) => {
      const inner = html.match(/<div data-testid="agenda-compact-axis"[^>]*>(.*?)<\/div>/)![1]!;
      return [...inner.matchAll(/data-compact-axis-min="(\d+)"[^>]*style="top:(-?[\d.]+)px"[^>]*>([^<]+)</g)].map((m) => ({
        min: Number(m[1]),
        top: Number(m[2]),
        text: m[3]!,
      }));
    };

    const plain = axis(render());
    expect(plain.map((l) => l.text)).toEqual(
      ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21"].map((h) => `${h}:00`),
    );
    // The first label sits inside the top edge; every other one, the END
    // included, is centred on its line (a 10px label, 5px above).
    expect(plain[0]!.top).toBe(2);
    for (const l of plain.slice(1)) expect(l.top, l.text).toBe(px(l.min) - 5);
    // The end label is on the BOTTOM EDGE: the axis is exactly that tall.
    const height = Number(render().match(/data-testid="agenda-compact-axis"[^>]*style="height:(\d+)px"/)![1]);
    expect(height).toBe(px(21 * 60));
    expect(plain.at(-1)!.top).toBe(height - 5);

    // A booking to 21:45 widens the window to 22:00, and the end label follows.
    const late = axis(
      render({ appointments: [appt({ id: "late", startsAt: iso(WED, "21:00"), endsAt: iso(WED, "21:45") })] }),
    );
    expect(late).toHaveLength(15);
    expect(late.at(-1)!.text).toBe("22:00");

    // The rules: one per hour INSIDE the window after the first, and none at
    // :30 (the desktop dropped its faint :30 rule on the owner's request, W13-B,
    // and this is that grid, compressed). Six Mon-Sat columns.
    const rules = [...render().matchAll(/<div aria-hidden="true" class="absolute inset-x-0 border-t border-v2-border" style="top:(\d+)px"/g)].map(
      (m) => Number(m[1]),
    );
    expect(rules).toHaveLength(6 * 12);
    expect([...new Set(rules)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, i) => px((9 + i) * 60)),
    );
  });

  it("names every service in the week beside its colour (Q-B6-3)", () => {
    const html = render({
      appointments: [
        appt({ id: "a1" }),
        appt({ id: "a2", startsAt: iso(WED, "12:00"), endsAt: iso(WED, "12:45"), serviceId: "svc-2", serviceName: "NESA" }),
      ],
    });
    expect(html).toContain('data-testid="agenda-compact-legend"');
    expect(html).toContain(`aria-label="${s["agenda.legend"]}"`);
    expect(html).toMatch(/<li[^>]*>.*Osteopatia/);
    expect(html).toMatch(/<li[^>]*>.*NESA/);
    // CONTROL: an empty week has no legend at all rather than an empty list.
    expect(render()).not.toContain('data-testid="agenda-compact-legend"');
  });

  it("the face in a half lane: the time sizes itself to the lane, and a 45-minute block gives the name a line of its own", () => {
    const pair = (from: string, to: string) =>
      render({
        appointments: [
          appt({ id: "person", startsAt: iso(WED, from), endsAt: iso(WED, to) }),
          appt({ id: "machine", practitionerId: "nesa-1", practitionerName: "NESA", startsAt: iso(WED, from), endsAt: iso(WED, to) }),
        ],
        sharedResourceIds: new Set(["nesa-1"]),
      });
    const button = (html: string, id: string) =>
      html.match(new RegExp(`<button[^>]*data-compact-appointment-id="${id}"[^>]*>.*?</button>`))![0];

    const tall = button(pair("10:00", "10:45"), "person");
    expect(tall).toContain('data-compact-lanes="2"');
    expect(tall).toContain('data-compact-face="three-lines"');
    expect(tall).toContain("container-type:inline-size");
    expect(tall).toMatch(/data-testid="agenda-compact-time"[^>]*style="font-size:min\(9px, calc\(100cqi \/ 2\.9\)\)"/);
    // Time, then the name on its own line (clipped, not ellipsised), then the glyph.
    const order = ["agenda-compact-time", "agenda-compact-patient", "data-estado="].map((k) => tall.indexOf(k));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(tall).toMatch(/data-testid="agenda-compact-patient" class="[^"]*text-clip/);

    // CONTROLS: a 30-minute pair has no room for three lines, and a block on
    // its own keeps the ellipsis and the glyph before the name.
    const short = button(pair("10:00", "10:30"), "person");
    expect(short).toContain('data-compact-face="two-lines"');
    expect(short.indexOf("data-estado=")).toBeLessThan(short.indexOf("agenda-compact-patient"));
    const alone = button(render({ appointments: [appt({ id: "a1" })] }), "a1");
    expect(alone).toContain('data-compact-lanes="1"');
    expect(alone).toContain('data-compact-face="two-lines"');
    expect(alone).toMatch(/data-testid="agenda-compact-patient" class="[^"]*text-ellipsis/);
  });
});

/* ------------------------------------------------------------------ */
/* The clock: never read in render, and the now line under the header.  */
/* ------------------------------------------------------------------ */
describe("AgendaWeekCompact and the clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Thursday 24 Sep 2026, 16:10 Lisbon (UTC+1): a weekday of the WED week,
   *  inside 08:00-21:00. Fixed, so this never depends on when CI runs. */
  const FIXED = new Date("2026-09-24T15:10:00.000Z");
  const rows = () => [appt({ id: "a1" })];

  function frozen<T>(fn: () => T): T {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED);
    return fn();
  }

  it("reads no clock while rendering: at a time and week where the line WOULD show, the server render has none", () => {
    const html = frozen(() =>
      renderToStaticMarkup(
        <AgendaWeekCompact anchor={WED} appointments={rows()} onSelectAppointment={() => {}} onSelectDay={() => {}} />,
      ),
    );
    expect(html).not.toContain('data-testid="agenda-compact-now"');
    // No day is marked as today either: that also needs the clock.
    expect(html).not.toContain("text-v2-green-700");
  });

  it("CONTROL: the same week, given the time that clock says, DOES draw the line, on Thursday", () => {
    // What the mount effect would set. If this arm drew nothing, the arm above
    // would be passing on a week or an hour where no line can appear.
    const html = frozen(() => {
      const d = new Date();
      const now = { date: todayInLisbon(d), min: lisbonMinutesFromMidnight(d) };
      expect(now).toEqual({ date: "2026-09-24", min: 16 * 60 + 10 });
      return renderToStaticMarkup(
        <CompactWeekView
          week={buildCompactWeek({ anchor: WED, appointments: rows() })}
          now={now}
          appointments={rows()}
          onSelectAppointment={() => {}}
          onSelectDay={() => {}}
        />,
      );
    });
    const line = html.match(/<div data-compact-day="([^"]+)"(?:(?!<div data-compact-day=).)*?data-testid="agenda-compact-now"/);
    expect(line, "a now line is drawn").not.toBeNull();
    expect(line![1]).toBe("2026-09-24");
  });

  it("the pinned day header paints ABOVE the now line: a higher z-index in the same stacking context", () => {
    const html = renderToStaticMarkup(
      <CompactWeekView
        week={buildCompactWeek({ anchor: WED, appointments: rows() })}
        now={{ date: "2026-09-24", min: 16 * 60 + 10 }}
        appointments={rows()}
        onSelectAppointment={() => {}}
        onSelectDay={() => {}}
      />,
    );
    const z = (testid: string) => {
      const tag = html.match(new RegExp(`<div[^>]*data-testid="${testid}"[^>]*>`))![0];
      const m = tag.match(/\bz-(\d+)\b/);
      expect(m, `${testid} has a z-index`).not.toBeNull();
      return Number(m![1]);
    };
    expect(z("agenda-compact-header")).toBeGreaterThan(z("agenda-compact-now"));
    expect(tagHas(html, "agenda-compact-header", "sticky")).toBe(true);
    // Same context: no day column (the now line's parent) sets a z-index, so the
    // comparison above is the one the browser makes.
    for (const col of html.match(/<div data-compact-day="[^"]+"[^>]*>/g) ?? []) {
      expect(col).not.toMatch(/\bz-\d+\b|isolate/);
    }
  });
});

function tagHas(html: string, testid: string, cls: string): boolean {
  const tag = html.match(new RegExp(`<div[^>]*data-testid="${testid}"[^>]*>`))![0];
  return new RegExp(`\\b${cls}\\b`).test(tag);
}

describe("agenda-view.tsx mounts the compact grid where the ruling says", () => {
  const src = readFileSync(new URL("./agenda-view.tsx", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("is still the file this guard thinks it is", () => {
    expect(code.length).toBeGreaterThan(1_000);
    expect(code).toContain("<AgendaGrid");
    expect(code).toContain("<AgendaWeekList");
  });

  it("for the WEEK only, displayed only under sm", () => {
    expect(code).toMatch(/view === "week" && \(\s*<AgendaWeekCompact\s+className="sm:hidden"/);
  });

  it("AFTER the desktop grid and the list, so no desktop .first() lands on it", () => {
    const grid = code.indexOf("<AgendaGrid");
    const list = code.indexOf("<AgendaWeekList");
    const compact = code.indexOf("<AgendaWeekCompact");
    expect(grid).toBeGreaterThan(-1);
    expect(compact).toBeGreaterThan(list);
    expect(list).toBeGreaterThan(grid);
  });

  it("the compact grid's scroll is the core's decision, fed whether the tree is displayed", () => {
    const compact = readFileSync(new URL("./agenda-week-compact.tsx", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(compact).toMatch(/autoScrollDecision\(\{/);
    expect(compact).toMatch(/displayed:\s*root\.getClientRects\(\)\.length > 0/);
    // Exactly one scrollTo, and it is behind the decision.
    expect(compact.match(/window\.scrollTo\(/g) ?? []).toHaveLength(1);
    expect(compact.indexOf("if (!decision.scroll")).toBeLessThan(compact.indexOf("window.scrollTo("));
  });

  it("the list keeps Dia at every width under md, and yields Semana to the grid under sm", () => {
    expect(code).toContain('className={view === "week" ? "max-sm:hidden md:hidden" : "md:hidden"}');
  });
});
