import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgendaWeekList } from "./agenda-week-list";
import { s } from "@/lib/i18n";
import type { BlockSpan } from "@/lib/scheduling/blocked-time-core";
import type { AgendaAppointment } from "@/lib/scheduling/types";

/**
 * AGMOB-01 — the phone week list, as MARKUP, plus two source-shape guards.
 *
 * ==========================================================================
 * WHAT THIS FILE IS FOR, AND WHAT IT IS EXPLICITLY NOT EVIDENCE OF
 * ==========================================================================
 * `agenda-week-list-core.test.ts` decides the values. This file asserts the
 * properties that only exist once the values are rendered, and which a reader
 * of the core cannot check: the therapist name reaches the DOM on every row
 * (W9-05 — colour is never the only cue), the withheld case renders the
 * withheld LABEL rather than an empty element, and — the arm that matters most
 * — that NOTHING here answers to a selector the grid answers to. Both trees sit
 * in the DOM at every viewport, so a shared `data-*` attribute doubles every
 * count in eleven other e2e files. That is not hypothetical; it happened.
 *
 * IT IS NOT EVIDENCE ABOUT A PHONE. This is `renderToStaticMarkup` in a node
 * environment: no layout, no CSS, no viewport. Whether the week is READABLE at
 * 390px is `e2e/agenda-mobile-week.spec.ts`'s question, and whether it works on
 * the engine the clinic actually holds is nobody's — no CI job here runs WebKit.
 */

const MON = "2026-09-21"; // a Monday
const WED = "2026-09-23";

/** 09:00 Lisbon is 08:00Z in September (WEST, UTC+1). */
function iso(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${date}T${String(h - 1).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
}

function appt(over: Partial<AgendaAppointment> & { id: string }): AgendaAppointment {
  return {
    patientId: `p-${over.id}`,
    patientName: "Ana Ferreira",
    practitionerId: "t-1",
    practitionerName: "Rodica Popescu",
    colorKey: null,
    patientTwoId: null,
    patientTwoName: null,
    practitionerTwoId: null,
    practitionerTwoName: null,
    locationId: "loc-1",
    locationName: "Linda-a-Velha",
    serviceId: null,
    serviceName: null,
    room: null,
    startsAt: iso(WED, "09:00"),
    endsAt: iso(WED, "10:00"),
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
    createdAt: iso(WED, "00:00"),
    ...over,
  } as AgendaAppointment;
}

function render(over: Partial<Parameters<typeof AgendaWeekList>[0]> = {}) {
  return renderToStaticMarkup(
    <AgendaWeekList
      view="week"
      anchor={WED}
      appointments={[]}
      onSelectAppointment={() => {}}
      {...over}
    />,
  );
}

describe("AgendaWeekList markup", () => {
  it("answers to NO handle the grid answers to - every one is prefixed data-list-", () => {
    // THE ARM THAT WOULD HAVE SAVED A CI RUN. The first push of this card used
    // `data-appointment-id` on the row, and therapist-cancel-uncancel.spec.ts
    // failed in the required E2E gate with
    // `expect(locator).toHaveCount(1) ... Received: 2`. Eleven e2e files select
    // on that attribute; e2e/helpers/index.ts does so UNSCOPED. Both trees are
    // in the DOM at every viewport - the swap is CSS - so a shared attribute
    // doubles every count.
    const html = render({
      appointments: [appt({ id: "a1" })],
      blocks: [
        { id: "b-1", startsAt: iso(WED, "11:00"), endsAt: iso(WED, "12:30"), reason: "x", note: null },
      ],
    });

    // The grid's three forms, none of which may appear here.
    expect(html).not.toContain("data-day=");
    expect(html).not.toContain("data-appointment-id=");
    expect(html).not.toContain("data-block-id=");

    // CONTROLS, SAME RENDER: the `data-list-` forms ARE there, so the three
    // assertions above measured the PREFIX and are not passing because the
    // attributes were dropped altogether or the render came back empty.
    expect(html.match(/data-list-day="/g) ?? []).toHaveLength(6);
    expect(html).toContain("data-list-appointment-id=");
    expect(html).toContain("data-list-block-id=");
  });

  it("names the therapist in TEXT on every appointment row (W9-05)", () => {
    const html = render({
      appointments: [
        appt({ id: "a1" }),
        appt({ id: "a2", startsAt: iso(WED, "11:00"), endsAt: iso(WED, "12:00"), practitionerName: "Lurdes Matos" }),
      ],
    });
    expect(html).toContain("Rodica Popescu");
    expect(html).toContain("Lurdes Matos");
    // CONTROL, same render: both names appear exactly once, so the arm above is
    // not satisfied by one name rendered twice.
    expect(html.match(/Rodica Popescu/g) ?? []).toHaveLength(1);
    expect(html.match(/Lurdes Matos/g) ?? []).toHaveLength(1);
  });

  it("renders the WITHHELD label rather than an empty name when the patient is not disclosed", () => {
    const withheld = render({ appointments: [appt({ id: "w", patientName: null })] });
    expect(withheld).toContain(s["agenda.patientWithheld"]);
    expect(s["agenda.patientWithheld"].length).toBeGreaterThan(0); // not vacuous

    // CONTROL: a disclosed name renders the name and NOT the withheld label, so
    // the arm above measured the null case rather than a label on every row.
    const shown = render({ appointments: [appt({ id: "s" })] });
    expect(shown).toContain("Ana Ferreira");
    expect(shown).not.toContain(s["agenda.patientWithheld"]);
  });

  it("uses the per-DATE empty string and not the dormant per-PERIOD one", () => {
    const html = render();
    expect(html).toContain(s["agenda.dayNoAppointments"]);
    // `agenda.noAppointments` says "neste período", which is wrong under a
    // heading naming one date. It has zero call sites and stays that way.
    expect(html).not.toContain(s["agenda.noAppointments"]);
    expect(s["agenda.dayNoAppointments"]).not.toBe(s["agenda.noAppointments"]); // not vacuous
  });

  it("renders a block and the closure as their own rows, and only the closure is not a button", () => {
    const block: BlockSpan = {
      id: "b-1",
      startsAt: iso(WED, "11:00"),
      endsAt: iso(WED, "12:30"),
      reason: "formacao",
      note: "Formação NESA",
    };
    const html = render({
      blocks: [block],
      closure: { startMin: 13 * 60, endMin: 14 * 60, locationName: "Linda-a-Velha" },
    });
    expect(html).toContain("Formação NESA");
    expect(html).toContain(s["agenda.blockedTime"]);
    expect(html).toContain(s["agenda.clinicClosed"]);
    // The closure carries no action — the clinic being shut is not something a
    // reader can open — so its row must not be a button. Six of them, one a day.
    expect(html.match(/data-testid="agenda-week-list-closure"/g) ?? []).toHaveLength(6);
    expect(html).not.toMatch(/<button[^>]*data-testid="agenda-week-list-closure"/);
    // CONTROL: the block, which DOES route somewhere, is a button when a handler
    // is supplied and a plain element when it is not.
    const openable = render({ blocks: [block], onOpenBlock: () => {} });
    expect(openable).toMatch(/<button[^>]*data-testid="agenda-week-list-block"/);
    expect(render({ blocks: [block] })).not.toMatch(
      /<button[^>]*data-testid="agenda-week-list-block"/,
    );
  });
});

describe("agenda-view.tsx source shape", () => {
  // A claim about SOURCE TEXT, worth exactly what it costs and no more: it
  // cannot say the week renders, only that the mechanism that used to prevent
  // it is not back. It is here because the deletion is the fix.
  const src = readFileSync(new URL("./agenda-view.tsx", import.meta.url), "utf8");
  /** Comments explain the deletion and name the thing deleted, so a naive grep
   *  over the raw file would match its own history. Strip them first. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("is still the file this guard thinks it is", () => {
    // Vacuous-pass guard FIRST: an empty string, or a comment-stripper that ate
    // the file, passes every "does not contain" assertion below.
    expect(code.length).toBeGreaterThan(1_000);
    expect(code).toContain("SegmentedControl");
    expect(code).toContain("AgendaWeekList");
  });

  it("no longer collapses the phone to the Dia view", () => {
    expect(code).not.toContain("matchMedia");
    expect(code).not.toContain("effectiveView");
    expect(code).not.toContain("isMobile");
  });

  it("does not hide the Dia/Semana toggle behind a breakpoint", () => {
    // The exact class string the toggle's wrapper used to carry. Its presence
    // anywhere in this file means the toggle is unreachable on a phone again.
    expect(code).not.toContain("hidden flex-none lg:block");
  });
});
