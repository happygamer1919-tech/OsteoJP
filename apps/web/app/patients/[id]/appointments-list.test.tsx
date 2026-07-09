import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgendaAppointment } from "@/lib/scheduling/types";

// AppointmentsList is a client component (router + clone action + toast). Stub
// the router and server action so it renders in a node test without an
// app-router context or a DB connection.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/scheduling/actions", () => ({
  cloneAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  updateAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
}));

import { AppointmentsList } from "./appointments-list";

const base: AgendaAppointment = {
  id: "00000000-0000-0000-0000-000000000001",
  patientId: "00000000-0000-0000-0000-0000000000a1",
  patientName: "Ana Paciente",
  practitionerId: "00000000-0000-0000-0000-0000000000b1",
  practitionerName: "Dr. Terapeuta",
  patientTwoId: null,
  patientTwoName: null,
  practitionerTwoId: null,
  practitionerTwoName: null,
  locationId: "00000000-0000-0000-0000-0000000000c1",
  locationName: "OsteoJP (LV)",
  serviceId: null,
  serviceName: null,
  room: null,
  startsAt: "2026-01-10T09:00:00.000Z",
  endsAt: "2026-01-10T10:00:00.000Z",
  status: "completed",
  notes: null,
  recurrenceRule: null,
  recurrenceParentId: null,
  confirmationState: "pending",
  confirmationReceivedAt: null,
  confirmationChannel: null,
  hasNote: false,
};

function render(
  appt: AgendaAppointment,
  caps: { canEdit?: boolean; canCancel?: boolean } = {},
): string {
  return renderToStaticMarkup(
    createElement(AppointmentsList, {
      appointments: [appt],
      canEdit: caps.canEdit ?? true,
      canCancel: caps.canCancel ?? true,
    }),
  );
}

const count = (html: string, needle: string): number => html.split(needle).length - 1;

describe("AppointmentsList — no-note indicator (W2-04)", () => {
  it("shows 'Sem nota' for a completed appointment with no note", () => {
    expect(count(render({ ...base, status: "completed", hasNote: false }), "Sem nota")).toBe(1);
  });

  it("hides 'Sem nota' for a completed appointment that has a note", () => {
    expect(count(render({ ...base, status: "completed", hasNote: true }), "Sem nota")).toBe(0);
  });

  it("hides 'Sem nota' for a non-completed appointment (even without a note)", () => {
    expect(count(render({ ...base, status: "scheduled", hasNote: false }), "Sem nota")).toBe(0);
  });
});

describe("AppointmentsList — per-row edit actions (W5-09)", () => {
  it("offers Reagendar / Gerir marcação / Cancelar for an open (scheduled) row", () => {
    const html = render({ ...base, status: "scheduled" });
    expect(count(html, "Gerir marcação")).toBe(1);
    expect(count(html, "Reagendar")).toBe(1);
    expect(count(html, "Cancelar marcação")).toBe(1);
  });

  it("Estado control offers ONLY lifecycle-legal targets — never Cancelada, never a confirmation value", () => {
    const html = render({ ...base, status: "scheduled" });
    // Legal onward targets from scheduled: Confirmada, Concluída, Falta.
    expect(count(html, "<option")).toBeGreaterThan(0);
    expect(html).toContain(">Confirmada<");
    expect(html).toContain(">Concluída<");
    expect(html).toContain(">Falta<");
    // Cancelling is a delete-cap action, NOT an Estado option.
    expect(html).not.toContain(">Cancelada<");
  });

  it("does not offer edit actions on a terminal (completed) row", () => {
    const html = render({ ...base, status: "completed" });
    expect(count(html, "Gerir marcação")).toBe(0);
    expect(count(html, "Reagendar")).toBe(0);
  });

  it("does not offer edit actions on a cancelled row", () => {
    const html = render({ ...base, status: "cancelled" });
    expect(count(html, "Gerir marcação")).toBe(0);
  });

  it("hides the Cancelar control when the viewer lacks appointments:delete (reused gate)", () => {
    const html = render({ ...base, status: "scheduled" }, { canEdit: true, canCancel: false });
    // Reschedule + Estado still offered (write); Cancel is not.
    expect(count(html, "Reagendar")).toBe(1);
    expect(count(html, "Cancelar marcação")).toBe(0);
  });

  it("hides every edit action when the viewer lacks appointments:write and :delete", () => {
    const html = render({ ...base, status: "scheduled" }, { canEdit: false, canCancel: false });
    expect(count(html, "Gerir marcação")).toBe(0);
  });
});
