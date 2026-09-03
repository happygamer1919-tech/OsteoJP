/* eslint-disable react/display-name -- inline @osteojp/ui stand-ins for a render test */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InspectedDay } from "@/lib/scheduling/schedule-inspection";

/**
 * SCHED-09 — what the inspector SAYS, given what the resolver returned.
 *
 * The resolver's own correctness is proven in schedule-rule.test.ts against
 * `buildDay`. These tests are about the screen: that a day with no windows is a
 * ROW rather than an omission, that the three labels render, and that the
 * middle label admits what it cannot distinguish.
 */
vi.mock("@osteojp/ui", () => ({
  GlassPanel: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
  Select: ({ children, value }: { children?: ReactNode; value?: string }) =>
    createElement("select", { "data-value": value }, children),
  StatusChip: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
}));

const { ScheduleInspector } = await import("./ScheduleInspector");
const { s } = await import("@/lib/i18n");

const THERAPISTS = [{ id: "t1", label: "JP" }];

const render = (days: InspectedDay[]) =>
  renderToStaticMarkup(
    createElement(ScheduleInspector, {
      days,
      therapists: THERAPISTS,
      therapistId: "t1",
      period: "week",
      onTherapistChange: vi.fn(),
      onPeriodChange: vi.fn(),
    }),
  );

const day = (over: Partial<InspectedDay> = {}): InspectedDay => ({
  date: "2026-09-07",
  weekday: 1,
  windows: [],
  exceptions: [],
  ...over,
});

describe("SCHED-09 — the inspector renders the resolver's answer", () => {
  it("shows a window with its hours, clinic and label", () => {
    const html = render([
      day({ windows: [{ start: "08:00", end: "13:00", locationId: "cb", locationName: "Castelo Branco", rule: "base" }] }),
    ]);
    expect(html).toContain("08:00–13:00");
    expect(html).toContain("Castelo Branco");
    expect(html).toContain(s["inspector.ruleBase"]);
  });

  it("a day with NO windows is a row saying 'não trabalha', not a missing row", () => {
    // "Not working" and "not shown" are different facts. A table that omits the
    // second teaches nobody anything, and an inspector exists to be believed.
    const html = render([day()]);
    expect(html).toContain(s["inspector.noWork"]);
    expect(html).toContain('data-testid="inspector-row-2026-09-07"');
  });

  it("renders the dia definido label WITH the admission that it cannot separate the two modes", () => {
    // The hint is the honest part: alternadas and dia a dia write identical
    // rows, and the screen says so rather than implying it knows which.
    const html = render([
      day({ windows: [{ start: "09:00", end: "17:00", locationId: "lv", locationName: "Linda-a-Velha", rule: "dia_definido" }] }),
    ]);
    expect(html).toContain(s["inspector.ruleDiaDefinido"]);
    expect(html).toContain(s["inspector.ruleDiaDefinidoHint"]);
  });

  it("time_off renders as excecao, in its own row, never as working time", () => {
    const html = render([day({ exceptions: [{ start: "10:00", end: "12:00", reason: "vacation" }] })]);
    expect(html).toContain(s["inspector.ruleExcecao"]);
    expect(html).toContain("10:00–12:00");
    expect(html).toContain("vacation");
  });

  it("TWO windows on one day both render - the merge that hides them is upstream", () => {
    const html = render([
      day({ windows: [
        { start: "08:00", end: "13:00", locationId: "cb", locationName: "Castelo Branco", rule: "base" },
        { start: "14:00", end: "19:00", locationId: "cb", locationName: "Castelo Branco", rule: "base" },
      ] }),
    ]);
    expect(html).toContain("08:00–13:00");
    expect(html).toContain("14:00–19:00");
  });

  it("says so plainly when there is no therapist to inspect", () => {
    const html = renderToStaticMarkup(
      createElement(ScheduleInspector, {
        days: [], therapists: [], therapistId: "", period: "week",
        onTherapistChange: vi.fn(), onPeriodChange: vi.fn(),
      }),
    );
    expect(html).toContain(s["inspector.empty"]);
  });
});
