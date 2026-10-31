import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgendaAppointment } from "@/lib/scheduling/types";
import type { TherapistChangeStaff } from "@/lib/scheduling/therapist-change";

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
// PL-19: the row now offers the note thread, whose board reaches the patient
// note server actions. Stub the module (and the `server-only` guard it pulls
// in) so this stays a pure render test — the thread's own behaviour is covered
// by the notes-board tests, not here.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/patients/actions", () => ({
  getAppointmentNotesAction: vi.fn(async () => ({ notes: [] })),
  appendAppointmentNoteAction: vi.fn(),
  editAppointmentNoteAction: vi.fn(),
}));

// APPT-EDIT-01: Reagendar now mounts the agenda's edit panel. A static render
// never opens it (no click), so it is stubbed to keep the server graph out.
vi.mock("@/app/agenda/appointment-drawer", () => ({ AppointmentDrawer: () => null }));

import { AppointmentsList, type FichaEditDrawer } from "./appointments-list";

const EDIT_DRAWER: FichaEditDrawer = {
  options: { therapists: [], locations: [], bookableLocations: [], services: [], packs: [] },
  viewer: { role: "reception", userId: "00000000-0000-0000-0000-0000000000d1" },
  canHardDelete: false,
};

const base: AgendaAppointment = {
  id: "00000000-0000-0000-0000-000000000001",
  patientId: "00000000-0000-0000-0000-0000000000a1",
  patientName: "Ana Paciente",
  practitionerId: "00000000-0000-0000-0000-0000000000b1",
  practitionerName: "Dr. Terapeuta",
  colorKey: null,
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
  createdBy: null,
  createdByName: null,
  createdAt: "2026-07-01T09:00:00.000Z",
};

function render(
  appt: AgendaAppointment,
  caps: {
    canEdit?: boolean;
    canCancel?: boolean;
    ownCancelIds?: string[];
    therapistStaff?: TherapistChangeStaff | null;
    editDrawer?: FichaEditDrawer | null;
  } = {},
): string {
  return renderToStaticMarkup(
    createElement(AppointmentsList, {
      appointments: [appt],
      canEdit: caps.canEdit ?? true,
      canCancel: caps.canCancel ?? true,
      ownCancelIds: caps.ownCancelIds,
      therapistStaff: caps.therapistStaff,
      editDrawer: caps.editDrawer === undefined ? EDIT_DRAWER : caps.editDrawer,
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

  /**
   * AMENDED BY B6, AND THE OLD ASSERTION IS KEPT AS THE NARROWER ONE IT ALWAYS
   * MEANT. Before the 2026-09-10 ruling a terminal row offered NOTHING, and
   * these two cases asserted "no Gerir marcação at all". The ruling adds ONE
   * affordance to exactly those rows - Corrigir estado, reception and up - so
   * the disclosure now opens on a terminal row for a viewer who holds
   * appointments:delete.
   *
   * WHAT HAS NOT CHANGED, AND IS WHAT THESE CASES ARE REALLY FOR: no LIFECYCLE
   * edit is offered. No Reagendar, no Cancelar, and no Estado <Select>. That is
   * the property the originals were guarding, and it is now asserted directly
   * rather than through the absence of the container.
   */
  it("offers NO lifecycle edit on a terminal (completed) row — only the correction door", () => {
    const html = render({ ...base, status: "completed" });
    expect(count(html, "Reagendar")).toBe(0);
    expect(count(html, "Cancelar marcação")).toBe(0);
    // The ordinary Estado control is absent; the correction control is present.
    expect(count(html, 'data-testid="corrigir-estado"')).toBe(1);
    expect(count(html, "Corrigir estado")).toBeGreaterThan(0);
  });

  it("offers NO lifecycle edit on a cancelled row — only the correction door", () => {
    const html = render({ ...base, status: "cancelled" });
    expect(count(html, "Reagendar")).toBe(0);
    expect(count(html, 'data-testid="corrigir-estado"')).toBe(1);
  });

  it("a viewer WITHOUT appointments:delete gets no correction door on a terminal row", () => {
    // "Reception and up" is the capability, not a role list: a therapist holds
    // appointments:write and not :delete, so canCancel=false is that viewer.
    const html = render({ ...base, status: "cancelled" }, { canEdit: true, canCancel: false });
    expect(count(html, 'data-testid="corrigir-estado"')).toBe(0);
    expect(count(html, "Gerir marcação")).toBe(0);
  });

  it("hides the Cancelar control when the viewer lacks appointments:delete (reused gate)", () => {
    const html = render({ ...base, status: "scheduled" }, { canEdit: true, canCancel: false });
    // Reschedule + Estado still offered (write); Cancel is not.
    expect(count(html, "Reagendar")).toBe(1);
    expect(count(html, "Cancelar marcação")).toBe(0);
  });

  it("APPT-EDIT-01: no Reagendar when the page hands the list no edit panel data", () => {
    const html = render({ ...base, status: "scheduled" }, { editDrawer: null });
    expect(count(html, "Reagendar")).toBe(0);
    // The rest of the row's actions are unaffected.
    expect(count(html, "Cancelar marcação")).toBe(1);
  });

  it("hides every edit action when the viewer lacks appointments:write and :delete", () => {
    const html = render({ ...base, status: "scheduled" }, { canEdit: false, canCancel: false });
    expect(count(html, "Gerir marcação")).toBe(0);
  });
});

describe("AppointmentsList — a therapist on their own row (SCHED-30)", () => {
  // The therapist's shape: appointments:write, no appointments:delete, and the
  // server-decided ids of the rows they are on at their own clinics.
  const therapist = (id: string) => ({ canEdit: true, canCancel: false, ownCancelIds: [id] });

  it("offers Cancelar on their own open row", () => {
    const html = render({ ...base, status: "scheduled" }, therapist(base.id));
    expect(count(html, "Cancelar marcação")).toBe(1);
  });

  it("offers the Estado control on their own Cancelada row, with only the two ordinary targets", () => {
    const html = render({ ...base, status: "cancelled" }, therapist(base.id));
    expect(count(html, "Gerir marcação")).toBe(1);
    expect(html).toContain(">Agendada<");
    expect(html).toContain(">Confirmada<");
    expect(html).not.toContain(">Concluída<");
  });

  it("does NOT open Corrigir estado to them: that door stays appointments:delete", () => {
    const html = render({ ...base, status: "cancelled" }, therapist(base.id));
    expect(count(html, 'data-testid="corrigir-estado"')).toBe(0);
  });

  it("offers nothing new on a row that is not theirs", () => {
    const html = render({ ...base, status: "cancelled" }, therapist("some-other-appointment"));
    expect(count(html, "Gerir marcação")).toBe(0);
    const open = render({ ...base, status: "scheduled" }, therapist("some-other-appointment"));
    expect(count(open, "Cancelar marcação")).toBe(0);
  });
});

describe("AppointmentsList — note thread reachable from the ficha (PL-19)", () => {
  it("offers a Notas button on every row", () => {
    expect(count(render({ ...base, status: "scheduled" }), 'data-testid="ficha-notes-button"')).toBe(1);
  });

  // The whole point of the owner CR: the reason a visit was cancelled or missed
  // usually lives in its notes, so the thread must NOT be hidden behind the
  // lifecycle gate that removes the Gerir disclosure on terminal rows.
  it.each(["scheduled", "confirmed", "completed", "cancelled", "no_show"] as const)(
    "keeps the Notas button on a %s row",
    (status) => {
      expect(count(render({ ...base, status }), 'data-testid="ficha-notes-button"')).toBe(1);
    },
  );

  it("still offers Notas to a viewer with no write or delete capability", () => {
    const html = render({ ...base, status: "scheduled" }, { canEdit: false, canCancel: false });
    expect(count(html, 'data-testid="ficha-notes-button"')).toBe(1);
    expect(count(html, "Gerir marcação")).toBe(0);
  });
});

describe("AppointmentsList - the Terapeuta field of Gerir marcação (MARC-THERAPIST-01)", () => {
  const colleague = { id: "00000000-0000-0000-0000-0000000000b2", label: "Dra. Colega" };
  const second = { id: "00000000-0000-0000-0000-0000000000b3", label: "Dr. Segundo" };
  const staff: TherapistChangeStaff = {
    therapists: [{ id: base.practitionerId, label: base.practitionerName }, colleague, second],
    therapistLocationIds: {},
  };
  /** The field's own markup, cut out of the row so no other select is read. */
  const field = (html: string): string => {
    const from = html.indexOf('data-testid="alterar-terapeuta"');
    if (from === -1) return "";
    const to = html.indexOf("</button>", from);
    return html.slice(from, to);
  };

  it.each(["scheduled", "confirmed"] as const)(
    "a %s row has the field: a Terapeuta select and its own button",
    (status) => {
      const html = render({ ...base, status }, { therapistStaff: staff });
      const f = field(html);
      expect(count(html, 'data-testid="alterar-terapeuta"')).toBe(1);
      expect(f).toContain('aria-label="Terapeuta"');
      expect(f).toContain(">Alterar terapeuta");
      // Not "Aplicar": the Estado control beside it owns that name on this row.
      expect(f).not.toContain(">Aplicar<");
    },
  );

  it("lists the current Terapeuta, selected, and the colleagues", () => {
    const f = field(render({ ...base, status: "scheduled" }, { therapistStaff: staff }));
    expect(count(f, "<option")).toBe(3);
    expect(f).toMatch(new RegExp(`<option value="${base.practitionerId}" selected="">Dr. Terapeuta</option>`));
    expect(f).toContain(`<option value="${colleague.id}">Dra. Colega</option>`);
  });

  it("leaves the row's Terapeuta 2 out of the list", () => {
    const f = field(
      render(
        { ...base, status: "scheduled", practitionerTwoId: second.id, practitionerTwoName: second.label },
        { therapistStaff: staff },
      ),
    );
    expect(count(f, "<option")).toBe(2);
    expect(f).not.toContain(second.id);
  });

  it("the button is disabled until another therapist is picked", () => {
    const f = field(render({ ...base, status: "scheduled" }, { therapistStaff: staff }));
    const button = f.slice(f.lastIndexOf("<button"));
    expect(button).toContain("Alterar terapeuta");
    expect(button.slice(0, button.indexOf(">"))).toContain('disabled=""');
  });

  it.each(["completed", "cancelled", "no_show"] as const)("a %s row has no field", (status) => {
    expect(count(render({ ...base, status }, { therapistStaff: staff }), 'data-testid="alterar-terapeuta"')).toBe(0);
  });

  it("a viewer the page hands no staff lists to has no field, and keeps Reagendar", () => {
    for (const therapistStaff of [null, undefined]) {
      const html = render({ ...base, status: "scheduled" }, { therapistStaff });
      expect(count(html, 'data-testid="alterar-terapeuta"')).toBe(0);
      expect(count(html, "Reagendar")).toBe(1);
    }
  });

  it("a viewer without appointments:write has no field even with the lists", () => {
    const html = render({ ...base, status: "scheduled" }, { canEdit: false, canCancel: true, therapistStaff: staff });
    expect(count(html, 'data-testid="alterar-terapeuta"')).toBe(0);
  });
});
