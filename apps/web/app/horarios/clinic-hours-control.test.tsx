import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * HOR-01 - the Horarios card says which schedule is in force, and the
 * "Usar horario da clinica" control asks before it acts.
 *
 * The label strings are the Portuguese ones from packages/i18n, read through
 * the same `s` the page uses, so a renamed key fails here rather than rendering
 * an empty chip.
 */
vi.mock("@osteojp/ui", () => ({
  Button: ({ children, ...rest }: { children?: ReactNode }) => createElement("button", rest, children),
  useAnimatedDialog: () => ({ ref: { current: null }, shown: false }),
}));

const { ScheduleKindLabel, UseClinicHoursButton } = await import("./ClinicHoursControl");
const { s } = await import("@/lib/i18n");

const labels = {
  kindOwn: s["schedule.kindOwn"],
  kindOwnHint: s["schedule.kindOwnHint"],
  kindClinicDefault: s["schedule.kindClinicDefault"],
  kindClinicDefaultHint: s["schedule.kindClinicDefaultHint"],
  kindNone: s["schedule.kindNone"],
  kindNoneHint: s["schedule.kindNoneHint"],
  useClinicHours: s["schedule.useClinicHours"],
  title: s["schedule.useClinicHoursTitle"],
  body: s["schedule.useClinicHoursBody"],
  keep: s["schedule.useClinicHoursKeep"],
  confirm: s["schedule.useClinicHoursConfirm"],
  cancel: s["common.cancel"],
};

describe("ScheduleKindLabel", () => {
  it("names each kind in Portuguese", () => {
    expect(renderToStaticMarkup(createElement(ScheduleKindLabel, { kind: "clinic_default", labels }))).toContain(
      "Horário da clínica (padrão)",
    );
    expect(renderToStaticMarkup(createElement(ScheduleKindLabel, { kind: "own", labels }))).toContain(
      "Horário próprio",
    );
    expect(renderToStaticMarkup(createElement(ScheduleKindLabel, { kind: "none", labels }))).toContain(
      'data-kind="none"',
    );
  });
});

describe("UseClinicHoursButton", () => {
  const html = renderToStaticMarkup(
    createElement(UseClinicHoursButton, {
      therapistId: "t-1",
      therapistName: "Ana",
      labels,
      action: async () => {},
    }),
  );

  it("shows the action, and the write sits behind a separate confirm", () => {
    expect(html).toContain("Usar horário da clínica");
    expect(html).toContain('data-testid="use-clinic-hours-confirm"');
    // The confirm says nothing is deleted.
    expect(html).toContain(s["schedule.useClinicHoursKeep"]);
  });

  it("posts the therapist's id and nothing else", () => {
    expect(html).toContain('name="userId"');
    expect(html).toContain('value="t-1"');
  });
});
