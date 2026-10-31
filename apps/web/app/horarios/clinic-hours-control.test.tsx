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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

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

const { clinicDefaultConfirmClinics } = await import("@/lib/admin/clinic-default-message");

describe("UseClinicHoursButton", () => {
  const html = renderToStaticMarkup(
    createElement(UseClinicHoursButton, {
      therapistId: "t-1",
      therapistName: "Ana",
      labels,
      confirmClinics: clinicDefaultConfirmClinics([
        { locationId: "a", name: "Castelo Branco" },
        { locationId: "b", name: "Linda-a-Velha" },
      ]),
      action: async () => ({ ok: true as const }),
    }),
  );

  it("shows the action, and the write sits behind a separate confirm", () => {
    expect(html).toContain("Usar horário da clínica");
    expect(html).toContain('data-testid="use-clinic-hours-confirm"');
    // The confirm says nothing is deleted.
    expect(html).toContain(s["schedule.useClinicHoursKeep"]);
  });

  it("the confirm names every clinic whose rows will be switched off", () => {
    expect(html).toContain("O horário próprio será desativado em: Castelo Branco, Linda-a-Velha.");
  });
});
