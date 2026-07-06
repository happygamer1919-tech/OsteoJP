/* eslint-disable react/display-name -- lightweight inline @osteojp/ui stand-ins for a render test; display names add nothing here */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgendaAppointment, AgendaOptions } from "@/lib/scheduling/types";

// W3-01 — the lifecycle "Estado" selector must NOT render in the creation flow
// ("Nova marcação"); it belongs to edit only, where marking a visit
// completed/cancelled/no_show is the point. The confirmation axis (0024) is
// orthogonal and untouched. This test renders the drawer in each mode and pins
// which controls appear.
//
// @osteojp/ui is stubbed with lightweight stand-ins so the test isolates the
// drawer's OWN conditional rendering (not the real Drawer's dialog/animation
// mechanics). `Select` renders its <option> children, so the lifecycle option
// labels ("Falta", "Concluída") appear in the markup exactly when the Estado
// Select is rendered. Server actions are stubbed (only called on submit).

vi.mock("server-only", () => ({}));
vi.mock("@/lib/scheduling/actions", () => ({
  createAppointment: vi.fn(),
  batchScheduleAppointments: vi.fn(),
  cancelAppointment: vi.fn(),
  getTherapistServices: vi.fn(async () => ({ ok: true, data: [] })),
  getTherapistDayAvailability: vi.fn(),
  rescheduleAppointment: vi.fn(),
  updateAppointment: vi.fn(),
  cloneAppointment: vi.fn(),
}));
vi.mock("@/lib/patients/actions", () => ({
  searchPatientsAction: vi.fn(),
  getPatientContraindications: vi.fn(),
}));
vi.mock("./availability-panel", () => ({ AvailabilityPanel: () => null }));
vi.mock("./confirmation-indicator", () => ({ ConfirmationIndicator: () => null }));
vi.mock("@osteojp/ui", () => {
  const passthrough = (tag: string) => ({ children }: { children?: ReactNode }) =>
    createElement(tag, null, children as ReactNode);
  return {
    Banner: passthrough("div"),
    StatusChip: passthrough("span"),
    Drawer: ({ children, title }: { children?: ReactNode; title?: ReactNode }) =>
      createElement("div", null, title as ReactNode, children as ReactNode),
    Field: ({ label, children }: { label?: ReactNode; children?: ReactNode }) =>
      createElement("label", null, label as ReactNode, children as ReactNode),
    Select: ({ children }: { children?: ReactNode }) =>
      createElement("select", null, children as ReactNode),
    Input: () => createElement("input"),
    Textarea: () => createElement("textarea"),
    Checkbox: () => createElement("input", { type: "checkbox" }),
    Combobox: () => createElement("div"),
    useToast: () => vi.fn(),
  };
});

import { AppointmentDrawer, type ModalState } from "./appointment-drawer";

const options: AgendaOptions = { therapists: [], locations: [], services: [] };

const editAppt: AgendaAppointment = {
  id: "appt-1",
  patientId: "patient-1",
  patientName: "Ana Silva",
  practitionerId: "therapist-1",
  practitionerName: "Dr. Costa",
  locationId: "loc-1",
  locationName: "Linda-a-Velha",
  serviceId: "svc-1",
  serviceName: "Osteopatia",
  room: null,
  startsAt: "2026-08-06T09:00:00.000Z",
  endsAt: "2026-08-06T10:00:00.000Z",
  status: "scheduled",
  notes: null,
  recurrenceRule: null,
  recurrenceParentId: null,
  confirmationState: "pending",
  confirmationReceivedAt: null,
  confirmationChannel: null,
  hasNote: false,
};

function render(state: ModalState): string {
  return renderToStaticMarkup(
    createElement(AppointmentDrawer, {
      state,
      options,
      anchor: "2026-08-06",
      onClose: vi.fn(),
      onDone: vi.fn(),
    }),
  );
}

// "Falta" (statusNoShow) and "Concluída" (statusCompleted) are unique to the
// lifecycle Estado Select's options — they appear in the markup iff it renders.
describe("AppointmentDrawer — Estado selector removed from creation (W3-01)", () => {
  it("does NOT render the lifecycle Estado selector in create mode", () => {
    const html = render({ mode: "create" });
    expect(html).not.toContain("Falta");
    expect(html).not.toContain("Concluída");
  });

  it("still renders the Estado selector in edit mode (lifecycle transitions)", () => {
    const html = render({ mode: "edit", appt: editAppt });
    expect(html).toContain("Falta");
    expect(html).toContain("Concluída");
  });

  it("keeps the orthogonal confirmation axis in edit mode (not conflated)", () => {
    const html = render({ mode: "edit", appt: editAppt });
    expect(html).toContain("Confirmação");
  });

  it("does NOT render the confirmation axis in create mode either", () => {
    const html = render({ mode: "create" });
    expect(html).not.toContain("Confirmação");
  });
});
