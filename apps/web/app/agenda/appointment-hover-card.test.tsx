import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppointmentHoverCard, AppointmentHoverPanel } from "./appointment-hover-card";
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

// W12-33 defect B: the popup reconciles its DISPLAY with the estados model. The
// separate confirmation line adds signal ONLY when it is non-redundant with the
// estado (Agendada + pending). It is NEVER shown alongside Confirmada or a
// terminal estado - the owner screenshot showed "Confirmada" and "Confirmação
// pendente" at the same time.
describe("W12-33 defect B - confirmation line reconciled with the estado", () => {
  const PENDING = "Confirmação pendente"; // appointment.confirmationPending (pt)
  const RECEIVED = "Confirmação recebida"; // appointment.confirmationConfirmed (pt)

  it("does NOT render a confirmation-pending line when the estado is Confirmada", () => {
    // the exact reported case: staff-confirmed (estado Confirmada) while the
    // patient confirmation axis is still pending.
    const html = render(appt({ status: "confirmed", confirmationState: "pending" }));
    expect(html).toContain('data-estado="confirmada"');
    expect(html).toContain("Confirmada"); // estado label present
    expect(html).not.toContain(PENDING); // contradictory line suppressed
  });

  it("does NOT restate the confirmation line when Confirmada by the patient axis", () => {
    const html = render(appt({ status: "scheduled", confirmationState: "confirmed" }));
    expect(html).toContain('data-estado="confirmada"');
    expect(html).not.toContain(RECEIVED); // redundant line suppressed
    expect(html).not.toContain(PENDING);
  });

  it("DOES show the confirmation line for Agendada + pending (non-redundant signal)", () => {
    const html = render(appt({ status: "scheduled", confirmationState: "pending" }));
    expect(html).toContain('data-estado="agendada"');
    expect(html).toContain(PENDING);
  });

  it("suppresses the confirmation line for every terminal estado", () => {
    for (const status of ["completed", "cancelled", "no_show"] as const) {
      const html = render(appt({ status, confirmationState: "pending" }));
      expect(html).not.toContain(PENDING);
      expect(html).not.toContain(RECEIVED);
    }
  });
});

// W12-33 defect A: the popup must sit ABOVE neighbouring rows with a SOLID
// background. The portal-based HoverPopover container carries the isolating +
// high-z + opaque-surface classes; on the server the panel is rendered inline
// (hidden) with the SAME container classes, so the static markup proves it.
describe("W12-33 defect A - popup isolation + solid background", () => {
  const shell = (a: AgendaAppointment) => renderToStaticMarkup(<AppointmentHoverCard appt={a} />);

  it("renders the popup container with an isolating stacking context, high z, and an opaque surface", () => {
    const html = shell(appt());
    // the popup container is the role="tooltip" element wrapping the panel.
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('data-testid="appointment-hover-panel"');
    expect(html).toContain("isolate"); // owns its stacking context
    expect(html).toContain("z-50"); // above agenda grid / card / row content
    expect(html).toContain("bg-v2-surface"); // SOLID opaque surface (#FFFFFF, AA)
    // never a translucent surface token on the popup.
    expect(html).not.toContain("bg-v2-glass");
    expect(html).not.toMatch(/bg-\S+\/\d/); // no `/opacity` alpha on the background
  });
});
