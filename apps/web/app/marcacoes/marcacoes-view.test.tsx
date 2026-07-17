/* eslint-disable react/display-name -- lightweight inline @osteojp/ui stand-ins for a render test */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgendaAppointment, AgendaOptions } from "@/lib/scheduling/types";

// W6-01b: the Marcações "Serviço" filter must be DATA-DRIVEN from the tenant's
// real services (via listServices, inactive included), not the old hardcoded
// 5-entry colour-category list. This renders the view and pins:
//   - the filter <option>s are the DB-sourced service names (incl. an inactive
//     service like NESA), and the old hardcoded labels are gone;
//   - filtering by a service id narrows to appointments with that serviceId;
//   - the colour tint (name-keyed) still renders on the cards.
//
// @osteojp/ui is stubbed with className-forwarding stand-ins so Select renders
// its <option> children and the ServiceChip tint class lands in the markup.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@osteojp/ui", () => {
  const withClass =
    (tag: string) =>
    ({ children, className }: { children?: ReactNode; className?: string }) =>
      createElement(tag, { className }, children as ReactNode);
  return {
    DatePicker: () => createElement("div", null, "date"),
    EmptyState: withClass("div"),
    GlassCard: withClass("div"),
    GlassPanel: withClass("div"),
    Input: () => createElement("input"),
    Select: ({ children, ...rest }: { children?: ReactNode }) =>
      createElement("select", rest, children as ReactNode),
    StatusBadge: withClass("span"),
    StatusChip: withClass("span"),
  };
});

import { MarcacoesView, type ServiceFilterOption } from "./marcacoes-view";

const SERVICES: ServiceFilterOption[] = [
  { id: "svc-fisio", name: "Fisioterapia" },
  { id: "svc-nesa", name: "NESA" }, // inactive in the DB, still offered as a filter
  { id: "svc-osteo", name: "Osteopatia" },
];

function mkAppt(over: Partial<AgendaAppointment>): AgendaAppointment {
  return {
    id: "a1",
    patientId: "p1",
    patientName: "Paciente Um",
    practitionerId: "t1",
    practitionerName: "Terapeuta",
    patientTwoId: null,
    patientTwoName: null,
    practitionerTwoId: null,
    practitionerTwoName: null,
    locationId: "loc1",
    locationName: "Linda-a-Velha",
    serviceId: "svc-osteo",
    serviceName: "Osteopatia",
    room: null,
    startsAt: "2026-07-20T09:00:00.000Z",
    endsAt: "2026-07-20T10:00:00.000Z",
    status: "scheduled",
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
    ...over,
  };
}

const OPTIONS: AgendaOptions = { therapists: [], locations: [], services: [], packs: [] };

const baseFilters = {
  from: "2026-07-20",
  to: "2026-07-24",
  practitionerId: null,
  locationId: null,
  status: null,
  service: null,
};

function render(node: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(node);
}

describe("MarcacoesView Serviço filter (W6-01b data-driven)", () => {
  it("lists the DB-sourced services (incl. inactive NESA) and not the old hardcoded labels", () => {
    const html = render(
      <MarcacoesView
        filters={baseFilters}
        lockTherapist={false}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        appointments={[]}
      />,
    );
    // DB-sourced option list, inactive included.
    expect(html).toContain('value="svc-fisio"');
    expect(html).toContain('value="svc-nesa"');
    expect(html).toContain("NESA");
    expect(html).toContain('value="svc-osteo"');
    // The old hardcoded accent labels / "other" bucket are gone from the filter.
    expect(html).not.toContain("Massagem Relaxamento");
    expect(html).not.toContain("Outros serviços");
    expect(html).not.toContain('value="other"');
  });

  it("filters appointments by the selected service id (not a colour category)", () => {
    const appts = [
      mkAppt({ id: "a-osteo", patientName: "Ana Osteo", serviceId: "svc-osteo", serviceName: "Osteopatia" }),
      mkAppt({ id: "a-fisio", patientName: "Rui Fisio", serviceId: "svc-fisio", serviceName: "Fisioterapia" }),
    ];
    const html = render(
      <MarcacoesView
        filters={{ ...baseFilters, service: "svc-osteo" }}
        lockTherapist={false}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        appointments={appts}
      />,
    );
    expect(html).toContain("Ana Osteo");
    expect(html).not.toContain("Rui Fisio");
  });

  it("preserves the name-keyed colour tint on the cards (Osteopatia -> burgundy)", () => {
    const html = render(
      <MarcacoesView
        filters={baseFilters}
        lockTherapist={false}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        appointments={[mkAppt({ serviceName: "Osteopatia", serviceId: "svc-osteo" })]}
      />,
    );
    expect(html).toContain("bg-v2-burgundy-100");
  });
});

describe("W9-06 items 9 + 10 - created-by provenance + note hover on marcacoes rows", () => {
  function renderRow(over: Partial<AgendaAppointment>) {
    return render(
      <MarcacoesView
        filters={baseFilters}
        lockTherapist={false}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        appointments={[mkAppt(over)]}
      />,
    );
  }

  it("item 10: shows the creator's name when created by staff", () => {
    const html = renderRow({ createdBy: "u-recep", createdByName: "Rita Rececao" });
    expect(html).toContain("Rita Rececao");
  });

  it("item 10: a portal booking (createdBy null) shows the owner-ruled label, never blank", () => {
    const html = renderRow({ createdBy: null, createdByName: null });
    // Owner ruling 2026-07-17: pt "Reserva online (portal)".
    expect(html).toContain("Reserva online (portal)");
  });

  it("item 9: renders the note content in a hover card when the marcacao has a note", () => {
    const html = renderRow({ notes: "Trazer exames anteriores" });
    expect(html).toContain("Trazer exames anteriores");
    expect(html).toContain('role="tooltip"');
  });

  it("item 9: renders no note affordance for a note-less marcacao", () => {
    const html = renderRow({ notes: null });
    expect(html).not.toContain('role="tooltip"');
  });
});
