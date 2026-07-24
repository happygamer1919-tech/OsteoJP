import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppointmentHoverPanel } from "./appointment-hover-card";
import type { AgendaAppointment } from "@/lib/scheduling/types";

// W10-05: the ONE shared unified popup panel, rendered on both the agenda card
// and the Marcacoes row. Pure content, react-dom/server (node env, no jsdom).

const DAY = "2026-07-20";

function appt(over: Partial<AgendaAppointment> = {}): AgendaAppointment {
  return {
    id: "appt-1",
    patientId: "pat-1",
    patientName: "Maria Silva",
    practitionerId: "aaaaaaaa-0000-0000-0000-000000000001",
    practitionerName: "Tiago Reis",
    patientTwoId: null,
    patientTwoName: null,
    practitionerTwoId: null,
    practitionerTwoName: null,
    locationId: "loc-1",
    locationName: "Linda-a-Velha",
    serviceId: "svc-1",
    serviceName: "Osteopatia",
    room: null,
    startsAt: `${DAY}T08:00:00Z`,
    endsAt: `${DAY}T09:00:00Z`,
    status: "scheduled",
    notes: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    confirmationState: "confirmed",
    confirmationReceivedAt: `${DAY}T07:00:00Z`,
    confirmationChannel: null,
    hasNote: false,
    createdBy: "u-1",
    createdByName: "Rececao Teste",
    createdAt: `${DAY}T06:00:00Z`,
    ...over,
  } as AgendaAppointment;
}

const render = (a: AgendaAppointment) => renderToStaticMarkup(<AppointmentHoverPanel appt={a} />);

describe("AppointmentHoverPanel (W10-05 shared unified popup)", () => {
  it("renders the mini-dashboard with patient, time+duration, service, therapist, location", () => {
    const html = render(appt());
    expect(html).toContain('data-testid="appointment-hover-panel"');
    expect(html).toContain("Maria Silva"); // patient
    expect(html).toContain("Osteopatia"); // service
    expect(html).toContain("Tiago Reis"); // therapist
    expect(html).toContain("Linda-a-Velha"); // location
    // time + duration (60 min) restated as text
    expect(html).toContain("min");
  });

  it("shows the derived estado + provenance as TEXT (colour-not-only)", () => {
    // scheduled + pending -> Agendada
    const html = render(appt({ status: "scheduled", confirmationState: "pending" }));
    expect(html).toContain('data-testid="hover-state"');
    expect(html).toContain('data-estado="agendada"');
    expect(html).toContain("Agendada"); // estado label as visible text
    expect(html).toContain('data-testid="hover-created"');
    expect(html).toContain("Rececao Teste"); // created-by
    // confirmed -> Confirmada
    expect(render(appt({ status: "scheduled", confirmationState: "confirmed" }))).toContain(
      'data-estado="confirmada"',
    );
  });

  it("renders the note preview ONLY when a note exists", () => {
    expect(render(appt({ notes: "Trazer exames" }))).toContain('data-testid="hover-note"');
    expect(render(appt({ notes: "Trazer exames" }))).toContain("Trazer exames");
    expect(render(appt({ notes: null }))).not.toContain('data-testid="hover-note"');
    expect(render(appt({ notes: "   " }))).not.toContain('data-testid="hover-note"');
  });

  it("a NULL createdBy renders the portal label, never blank", () => {
    const html = render(appt({ createdBy: null, createdByName: null }));
    expect(html).toContain("Reserva online (portal)");
  });

  // W12-11 R10: Cancelada is a distinct red glyph, NOT a strikethrough; the
  // strikethrough belongs to Falta (no_show) only.
  it("a Cancelada appointment shows the red estado glyph, is NOT struck, and drops the confirmation label", () => {
    const html = render(appt({ status: "cancelled", confirmationState: "confirmed" }));
    expect(html).toContain('data-estado="cancelada"');
    expect(html).not.toContain("line-through");
    // terminal estado suppresses the separate confirmation indicator
    expect(html).not.toContain("Confirmação recebida");
  });

  it("a Falta (no_show) appointment strikes the patient name", () => {
    const html = render(appt({ status: "no_show" }));
    expect(html).toContain('data-estado="falta"');
    expect(html).toContain("line-through");
  });
});
