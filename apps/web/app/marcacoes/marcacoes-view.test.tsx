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
    // W12-00: the view now wraps its output in ToastProvider (for the reused
    // AppointmentDrawer's toasts). In this static render it is a passthrough.
    ToastProvider: withClass("div"),
    // ITEM 4: a deep link OPENS the AppointmentDrawer on first render, so the
    // drawer's own hooks are now reachable from this suite for the first time.
    // Needed only because the feature works; a no-op here.
    useToast: () => ({ show: () => {}, succeed: () => {}, fail: () => {} }),
  };
});

// ITEM 4: a deep link now OPENS the shared AppointmentDrawer on first render,
// which drags its whole dependency tree (Drawer, useToast, the server actions)
// into a suite that is about the LIST. The drawer has its own suite
// (app/agenda/appointment-drawer.test.tsx); here it is stubbed to a marker, the
// same way that suite stubs ./availability-panel. What these tests assert is the
// row markup, and the marker also lets "the drawer opened" be asserted directly.
vi.mock("../agenda/appointment-drawer", () => ({
  // The prop is `state`, not `modal` - read from marcacoes-view.tsx rather than
  // assumed, after the first draft of this stub guessed wrong and reported an
  // empty data-appt on a drawer that was in fact open.
  AppointmentDrawer: ({ state }: { state?: { appt?: { id?: string } } | null }) =>
    state
      ? createElement("div", { "data-testid": "drawer-open", "data-appt": state.appt?.id ?? "" })
      : null,
}));

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
    colorKey: null,
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

const OPTIONS: AgendaOptions = { therapists: [], locations: [], bookableLocations: [], services: [], packs: [] };
// PL-10: MarcacoesView forwards `viewer` to the shared drawer. This view only
// opens the drawer in EDIT mode, so the therapist self-lock never fires here; a
// non-therapist viewer keeps these render assertions on the unchanged surface.
const VIEWER = { role: "reception" as const, userId: "recep-1" };

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
        viewer={VIEWER}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        canHardDelete={false}
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
        viewer={VIEWER}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        canHardDelete={false}
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
        viewer={VIEWER}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        canHardDelete={false}
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
        viewer={VIEWER}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        canHardDelete={false}
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

  // W10-05: the note-only hover was REPLACED by the shared unified popup
  // (AppointmentHoverPanel), which renders on EVERY row (not only when a note
  // exists). The note preview section (hover-note) is what is note-gated now.
  it("W10-05: renders the shared unified popup with the note preview when a note exists", () => {
    const html = renderRow({ notes: "Trazer exames anteriores" });
    expect(html).toContain('data-testid="appointment-hover-panel"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('data-testid="hover-note"');
    expect(html).toContain("Trazer exames anteriores");
  });

  it("W10-05: renders the shared unified popup on a note-less row, without the note preview", () => {
    const html = renderRow({ notes: null });
    // the mini-dashboard renders on every row now
    expect(html).toContain('data-testid="appointment-hover-panel"');
    expect(html).toContain('role="tooltip"');
    // but there is no note-preview section
    expect(html).not.toContain('data-testid="hover-note"');
  });
});

describe("W12-00 - marcacoes row exposes an open/edit control", () => {
  function renderRow(over: Partial<AgendaAppointment>) {
    return render(
      <MarcacoesView
        filters={baseFilters}
        lockTherapist={false}
        viewer={VIEWER}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        canHardDelete={false}
        appointments={[mkAppt(over)]}
      />,
    );
  }

  it("renders a native, keyboard-focusable button per row, labelled with the patient (not an inert card)", () => {
    const html = renderRow({ patientName: "Paciente Um" });
    // A real <button> (native Enter/Space + tab focus), not the whole GlassCard
    // (which would nest the hover trigger's role="button").
    expect(html).toMatch(/<button[^>]*aria-label="Abrir marcação: Paciente Um"/);
    // The visible label is text, never colour/icon alone (colour-not-only rule).
    expect(html).toContain("Abrir marcação");
    // The control is NOT tab-removed.
    expect(html).not.toMatch(/<button[^>]*aria-label="Abrir marcação: Paciente Um"[^>]*tabindex="-1"/);
  });

  it("labels each row's control with its own patient so screen readers disambiguate", () => {
    const html = render(
      <MarcacoesView
        filters={baseFilters}
        lockTherapist={false}
        viewer={VIEWER}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        canHardDelete={false}
        appointments={[
          mkAppt({ id: "r1", patientName: "Ana Costa" }),
          mkAppt({ id: "r2", patientName: "Rui Alves", startsAt: "2026-07-20T11:00:00.000Z", endsAt: "2026-07-20T12:00:00.000Z" }),
        ]}
      />,
    );
    expect(html).toContain('aria-label="Abrir marcação: Ana Costa"');
    expect(html).toContain('aria-label="Abrir marcação: Rui Alves"');
  });
});

// ============================================================================
// STAFF-04 — the patient name is never truncated.
// ============================================================================
// Reported from reception: the list rendered "Abilio J...". The row was ONE flex
// line and every field competed for its width, so the name lost. It carried
// `truncate`, which is a promise that something will be cut.
//
// The row is now two lines — identity, then attributes — so the name can be any
// length without moving anything else. NOTHING WAS DROPPED.
describe("STAFF-04 — the full patient name is always visible", () => {
  const LONG = "Abílio Joaquim Vasconcelos de Sousa Marques";

  const renderRow = (overrides: Parameters<typeof mkAppt>[0]) =>
    render(
      <MarcacoesView
        filters={baseFilters}
        lockTherapist={false}
        viewer={VIEWER}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        canHardDelete={false}
        appointments={[mkAppt(overrides)]}
      />,
    );

  it("renders the patient name in FULL, with no truncate class on it", () => {
    // The regression, both halves. The text must be complete AND the element
    // must not carry the class that promises to cut it — a name that happens to
    // fit today would satisfy a text-only assertion while the defect stayed.
    const html = renderRow({ id: "a", patientName: LONG });
    expect(html).toContain(LONG);
    const nameSpan = /<span[^>]*data-testid="marcacoes-patient-name"[^>]*>/.exec(html)?.[0] ?? "";
    expect(nameSpan, "the name element must exist").not.toBe("");
    expect(nameSpan, "`truncate` is a promise to cut the name").not.toContain("truncate");
    expect(nameSpan, "it must wrap instead").toContain("break-words");
  });

  it("drops NO field that was on the row before", () => {
    // The requirement was explicit: full name always visible, no existing field
    // dropped. Asserted one by one rather than as a count, so a future edit that
    // removes one is named rather than merely off-by-one.
    const html = renderRow({
      id: "a",
      patientName: LONG,
      serviceName: "Osteopatia",
      locationName: "OsteoJP (LV)",
      practitionerName: "Catarina Vieira",
      createdByName: "Carlos Barrelas",
    });
    for (const field of ["Osteopatia", "OsteoJP (LV)", "Catarina Vieira", "Carlos Barrelas"]) {
      expect(html, `${field} must still be on the row`).toContain(field);
    }
    // And the row's affordances, which are the only way into a marcação here.
    expect(html).toContain('data-testid="marcacoes-notes-button"');
  });

  it("keeps the time on the SAME line as the name, not below it", () => {
    // Time and name are what reception scans. If the split had put them on
    // different lines the change would have cost more than it bought.
    const html = renderRow({ id: "a", patientName: LONG });
    const nameIdx = html.indexOf("marcacoes-patient-name");
    const line2Idx = html.indexOf("sm:pl-28");
    expect(nameIdx).toBeGreaterThan(-1);
    expect(line2Idx, "the attribute line must exist").toBeGreaterThan(-1);
    expect(nameIdx, "the name belongs on the FIRST line").toBeLessThan(line2Idx);
  });
});

/**
 * ITEM 4 - the notification deep link, render half.
 *
 * The scroll-and-open behaviour is an effect and does not run under
 * renderToStaticMarkup; what IS pinned here is everything the effect depends on
 * (the row anchor it queries for), the highlight, and the not-found state -
 * which is the arm that fails BLANK if it regresses, and therefore the one most
 * worth a test. The window arithmetic has its own suite in
 * lib/scheduling/deep-link-window.test.ts.
 */
describe("ITEM 4 - marcacoes deep link", () => {
  // DISTINCT, NON-OVERLAPPING windows on purpose. mkAppt's defaults share one
  // practitioner AND one time, so two of them conflict with each other and the
  // conflict ring would mask the highlight - which is exactly what the last
  // assertion in this block deliberately tests for.
  const appts = [
    mkAppt({
      id: "a-one",
      patientName: "Alfredo Linked",
      startsAt: "2026-08-10T09:00:00.000Z",
      endsAt: "2026-08-10T09:55:00.000Z",
    }),
    mkAppt({
      id: "a-two",
      patientName: "Ana Other",
      startsAt: "2026-08-10T11:00:00.000Z",
      endsAt: "2026-08-10T11:55:00.000Z",
    }),
  ];

  const renderWith = (over: Record<string, unknown>) =>
    render(
      <MarcacoesView
        filters={baseFilters}
        lockTherapist={false}
        viewer={VIEWER}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        canHardDelete={false}
        appointments={appts}
        {...over}
      />,
    );

  it("every row carries the anchor the deep-link scroll targets", () => {
    // The effect does document.querySelector on this attribute. If the attribute
    // is renamed or dropped, the scroll silently stops working and nothing else
    // in the suite would notice.
    const html = renderWith({});
    expect(html).toContain('data-appointment-id="a-one"');
    expect(html).toContain('data-appointment-id="a-two"');
  });

  it("the linked row is highlighted, and only that row", () => {
    const html = renderWith({ focusAppointmentId: "a-one" });
    const rings = html.match(/ring-2 ring-v2-green-500/g) ?? [];
    expect(rings).toHaveLength(1);
  });

  it("the linked appointment OPENS in the drawer on first render", () => {
    // The behaviour the notification actually promised. It comes from the
    // useState INITIALISER rather than an effect, so it is observable in a
    // static render - which is why this can be asserted here at all.
    const html = renderWith({ focusAppointmentId: "a-one" });
    expect(html).toContain('data-testid="drawer-open"');
    expect(html).toContain('data-appt="a-one"');
  });

  it("NEGATIVE ARM: an id that matches no row opens nothing rather than a blank drawer", () => {
    const html = renderWith({ focusAppointmentId: "not-in-this-window" });
    expect(html).not.toContain('data-testid="drawer-open"');
  });

  it("a link that resolved to NOTHING says so", () => {
    const html = renderWith({ deepLinkMissing: true });
    expect(html).toContain("marcacoes-deeplink-missing");
    // The list is still rendered underneath: the failure is announced, not
    // substituted for the page.
    expect(html).toContain("Alfredo Linked");
  });

  it("NEGATIVE ARM: no link followed means no banner and no highlight", () => {
    const html = renderWith({});
    expect(html).not.toContain("marcacoes-deeplink-missing");
    expect(html).not.toContain("ring-2 ring-v2-green-500");
  });

  it("NEGATIVE ARM: a conflict ring still wins over the deep-link ring", () => {
    // Two overlapping appointments for one practitioner: both are flagged. The
    // conflict is a warning about the DATA; the highlight is only navigation,
    // and losing the warning to it would be a real regression.
    const clashing = [
      mkAppt({ id: "c-1", patientName: "Clash One", startsAt: "2026-08-10T09:00:00.000Z", endsAt: "2026-08-10T10:00:00.000Z" }),
      mkAppt({ id: "c-2", patientName: "Clash Two", startsAt: "2026-08-10T09:30:00.000Z", endsAt: "2026-08-10T10:30:00.000Z" }),
    ];
    const html = render(
      <MarcacoesView
        filters={baseFilters}
        lockTherapist={false}
        viewer={VIEWER}
        options={OPTIONS}
        serviceFilterOptions={SERVICES}
        canHardDelete={false}
        appointments={clashing}
        focusAppointmentId="c-1"
      />,
    );
    expect(html).toContain("ring-1 ring-warning");
    expect(html).not.toContain("ring-2 ring-v2-green-500");
  });
});
