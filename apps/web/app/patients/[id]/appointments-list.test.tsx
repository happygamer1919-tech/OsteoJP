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
vi.mock("@/lib/scheduling/actions", () => ({ cloneAppointment: vi.fn() }));

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

function render(appt: AgendaAppointment): string {
  return renderToStaticMarkup(createElement(AppointmentsList, { appointments: [appt] }));
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
