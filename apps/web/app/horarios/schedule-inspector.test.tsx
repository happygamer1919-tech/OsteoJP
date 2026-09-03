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
  // SCHED-10: the inline editor's controls.
  Button: ({ children }: { children?: ReactNode }) => createElement("button", null, children),
  TimeField: () => createElement("div"),
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

/**
 * SCHED-10 - the inline edit, and specifically what the READ-ONLY inspector must
 * keep looking like when nobody can edit.
 *
 * THE AFFORDANCE IS OPT-IN, on purpose: the component takes `onSaveDay` and
 * `locations`, and renders no edit control without BOTH. A surface that mounted
 * the inspector to answer a question (a future therapist self-view, which
 * SCHED-09's header says this shape exists for) would otherwise grow an editor
 * nobody asked it for.
 */
describe("SCHED-10 - the edit affordance", () => {
  const withEdit = (days: InspectedDay[]) =>
    renderToStaticMarkup(
      createElement(ScheduleInspector, {
        days,
        therapists: THERAPISTS,
        therapistId: "t1",
        period: "week",
        locations: [{ id: "loc-1", name: "Linda-a-Velha" }],
        onTherapistChange: vi.fn(),
        onPeriodChange: vi.fn(),
        onSaveDay: vi.fn(async () => ({ ok: true })),
      }),
    );

  it("renders NO edit control without a save handler", () => {
    expect(render([day()])).not.toContain("inspector-edit-");
  });

  it("renders no edit control when there is no clinic to move a day to", () => {
    const html = renderToStaticMarkup(
      createElement(ScheduleInspector, {
        days: [day()],
        therapists: THERAPISTS,
        therapistId: "t1",
        period: "week",
        locations: [],
        onTherapistChange: vi.fn(),
        onPeriodChange: vi.fn(),
        onSaveDay: vi.fn(async () => ({ ok: true })),
      }),
    );
    expect(html).not.toContain("inspector-edit-");
  });

  it("renders ONE edit control per day, on the day's first line", () => {
    const html = withEdit([
      day({
        windows: [
          { start: "08:00", end: "13:00", locationId: "loc-1", locationName: "LV", rule: "base" },
          { start: "14:00", end: "19:00", locationId: "loc-1", locationName: "LV", rule: "base" },
        ],
      }),
    ]);
    const matches = html.match(/data-testid="inspector-edit-2026-09-07"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("offers the edit on a day the therapist does NOT work, which is the day most worth editing", () => {
    expect(withEdit([day({ windows: [] })])).toContain('data-testid="inspector-edit-2026-09-07"');
  });

  it("does not open an editor before anybody clicks", () => {
    expect(withEdit([day()])).not.toContain('data-testid="inspector-editor"');
  });

  it("offers no clear-the-day control anywhere, because the write path refuses one", () => {
    // applyDayByDaySchedule refuses an empty window and names blocked time as
    // the tool for an absence. A checkbox here would put that refusal behind a
    // control, which is how the first draft of this editor failed at the server
    // with a generic error.
    expect(withEdit([day()])).not.toContain("inspector-edit-working");
  });
});
