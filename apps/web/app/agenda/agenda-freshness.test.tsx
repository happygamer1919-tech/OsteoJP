/* eslint-disable react/display-name -- inline stand-ins for a render test */
import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * LE-agenda-does-not-learn-of-portal-bookings — THE AGENDA SAYS HOW OLD IT IS.
 *
 * ==========================================================================
 * WHAT IS ACTUALLY ON TRIAL, because it is not the chip.
 * ==========================================================================
 * The lag is STRUCTURAL and is not fixed by this card. A portal booking is
 * written by `apps/api`; the agenda is rendered by `apps/web`; they are separate
 * Next deployments, so `revalidatePath` in one cannot invalidate the other. An
 * agenda left open at reception does not learn about a portal booking until
 * somebody navigates or reloads.
 *
 * WHAT SHIPPED IS THE REMOVAL OF A WRONG BELIEF: a screen with no stamp reads as
 * live, and this one is not. So the one property that matters is that the stamp
 * IS THE READ INSTANT AND NOT THE RENDER INSTANT.
 *
 * A `new Date()` in the client component would satisfy every visual check and
 * INVERT the feature: it would re-evaluate on every client render and always say
 * "now", so the stamp would be freshest exactly when the data was stalest. The
 * screen would lie about its own freshness with MORE confidence than it does
 * today, and nothing about the rendering would look wrong. That is §1.3 exactly,
 * and it is what the source guards below exist for.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("@osteojp/ui", () => ({
  DatePicker: () => createElement("div"),
  Select: ({ children }: { children?: ReactNode }) => createElement("select", null, children as ReactNode),
  SegmentedControl: () => createElement("div"),
  ToastProvider: ({ children }: { children?: ReactNode }) => createElement("div", null, children as ReactNode),
}));
vi.mock("./agenda-grid", () => ({ AgendaGrid: () => createElement("div") }));
vi.mock("./appointment-drawer", () => ({ AppointmentDrawer: () => null }));
vi.mock("./block-time-dialog", () => ({ BlockTimeDialog: () => null }));

import { AgendaView } from "./agenda-view";
import { s } from "@/lib/i18n";

const READ_AT = new Date("2026-08-20T13:32:00.000Z"); // 14:32 Lisbon (WEST, UTC+1)

function render(over: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(AgendaView, {
      view: "day",
      anchor: "2026-08-20",
      filters: { practitionerId: null, locationId: null },
      lockTherapist: false,
      viewer: { role: "reception", userId: "u-1" },
      options: { therapists: [], locations: [] },
      appointments: [],
      blocks: [],
      lockedPatient: null,
      prefill: null,
      canHardDelete: false,
      canBlockTime: false,
      renderedAt: "14:32",
      renderedAtIso: READ_AT.toISOString(),
      ...over,
    } as never),
  );
}

describe("the agenda toolbar states how old its data is", () => {
  it("renders the read instant it was given, labelled", () => {
    const out = render();
    expect(out).toContain(s["agenda.lastUpdated"]);
    expect(out).toContain("14:32");
  });

  it("carries the machine-readable instant on a <time> element", () => {
    // The visible text is Lisbon wall-clock with no date and no zone. Without
    // dateTime, an assistive technology or a screenshot reader has "14:32" and
    // no way to know which 14:32.
    const out = render();
    expect(out).toMatch(/<time[^>]+datetime="2026-08-20T13:32:00\.000Z"/i);
  });

  it("renders the stamp it is GIVEN, never a time it derived itself", () => {
    // THE LOAD-BEARING ASSERTION. If the component ever computed the stamp, this
    // would render the current clock instead of the fixture and go red.
    const out = render({ renderedAt: "09:05", renderedAtIso: "2026-08-20T08:05:00.000Z" });
    expect(out).toContain("09:05");
    expect(out).not.toContain("14:32");
  });

  it("offers a refresh control, which is the prompt that was missing", () => {
    // The data is never stale ON READ - the page re-queries every request - it is
    // that nothing PROMPTS a read. This button is that prompt.
    const out = render();
    expect(out).toContain('data-testid="agenda-refresh"');
    expect(out).toContain(s["agenda.refresh"]);
  });
});

/**
 * COMMENTS STRIPPED BEFORE THE SOURCE SCAN, and the reason is not tidiness: the
 * FIRST version of the guard below went red on its own explanation. The prop's
 * doc comment says "IT IS A PROP AND NOT A `new Date()` IN THIS FILE", and a
 * raw text scan cannot tell a prohibition from an instance of the thing it
 * prohibits. Same move `ACC-fixture-forbidden-state-sweep` made for the same
 * reason: a shape-match counts the APPEARANCE OF A STRING, not the thing the
 * string sometimes indicates.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the read instant comes from the server, and the source says so", () => {
  const view = readFileSync(new URL("./agenda-view.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("the comment stripper does not swallow the code it is meant to leave", () => {
    // A stripper that returned "" would make the next assertion pass over
    // nothing - the vacuous shape. Two positive controls: real code survives,
    // and a known comment does not.
    expect(code(view)).toContain("export function AgendaView");
    expect(code(view)).not.toContain("IT IS A PROP AND NOT A");
  });

  it("the client component never constructs a Date for the stamp", () => {
    // A `new Date()` here re-evaluates on every client render and always reads
    // "now" - the stamp would be freshest exactly when the data was stalest.
    // This is a source guard because the defect is INVISIBLE in a render: the
    // output looks correct, and is correct, at the moment the test runs.
    expect(code(view)).not.toMatch(/new Date\(\)/);
  });

  it("the server page stamps the instant and passes it in", () => {
    expect(page).toMatch(/const readAt = new Date\(\)/);
    expect(page).toContain("renderedAt={formatTimeOfDay(readAt)}");
    expect(page).toContain("renderedAtIso={readAt.toISOString()}");
  });

  it("the instant is taken BEFORE the appointments are read, not after", () => {
    // A stamp taken after the queries describes a moment the data does not come
    // from. The gap is milliseconds and the principle is the whole card: the
    // stamp travels with the data it describes.
    const stampAt = page.indexOf("const readAt = new Date()");
    const queryAt = page.indexOf("listAppointments(");
    expect(stampAt).toBeGreaterThan(-1);
    expect(queryAt).toBeGreaterThan(-1);
    expect(stampAt).toBeLessThan(queryAt);
  });
});
