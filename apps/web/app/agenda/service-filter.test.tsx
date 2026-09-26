import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AGENDA-FILTER-SERVICE - the service chips, as MARKUP and as presses, and what
 * agenda-view.tsx hands each surface once a service is selected.
 *
 * HOW A PRESS IS TESTED WITHOUT A DOM. This suite has no jsdom (vitest runs in
 * node, renders through react-dom/server). The toggle and the panel are
 * hook-free on purpose, so they are called here as functions and the returned
 * element tree is searched for the button and its onClick is invoked.
 *
 * HOW A STORED SELECTION REACHES AGENDA-VIEW IN A SERVER RENDER. agenda-view
 * reads the device's selection with useSyncExternalStore, whose server snapshot
 * is `serverStoredServiceFilter` (always null in the app). A server render uses
 * that snapshot, so this file replaces that ONE export with a value it controls
 * and everything else in lib/scheduling/agenda-service-filter.ts stays real:
 * the parse, the cleaning against the chips, and the filter itself.
 *
 * IT IS NOT EVIDENCE ABOUT A SCREEN. Whether the toolbar fits 390px and a
 * filtered booking is really gone from Dia and Semana on desktop and phone is
 * e2e/agenda-service-filter.spec.ts's question.
 */

const seen = vi.hoisted(() => ({
  stored: null as string | null,
  grid: [] as { appointments: { id: string }[]; blocks: unknown }[],
  list: [] as { appointments: { id: string }[]; blocks: unknown }[],
  compact: [] as { appointments: { id: string }[]; blocks: unknown }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
vi.mock("@osteojp/ui", async () => {
  const { createElement: h } = await import("react");
  return {
    DatePicker: () => h("div"),
    Select: ({ children }: { children?: ReactNode }) => h("select", null, children as ReactNode),
    SegmentedControl: () => h("div", { "data-stub": "segmented" }),
    ToastProvider: ({ children }: { children?: ReactNode }) => h("div", null, children as ReactNode),
  };
});
vi.mock("./agenda-grid", () => ({
  AgendaGrid: (p: { appointments: { id: string }[]; blocks: unknown }) => {
    seen.grid.push(p);
    return null;
  },
}));
vi.mock("./agenda-week-list", () => ({
  AgendaWeekList: (p: { appointments: { id: string }[]; blocks: unknown }) => {
    seen.list.push(p);
    return null;
  },
}));
vi.mock("./agenda-week-compact", () => ({
  AgendaWeekCompact: (p: { appointments: { id: string }[]; blocks: unknown }) => {
    seen.compact.push(p);
    return null;
  },
}));
vi.mock("./appointment-drawer", () => ({ AppointmentDrawer: () => null }));
vi.mock("./block-time-dialog", () => ({ BlockTimeDialog: () => null }));
vi.mock("@/lib/scheduling/agenda-service-filter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scheduling/agenda-service-filter")>()),
  serverStoredServiceFilter: () => seen.stored,
}));

import { AgendaView } from "./agenda-view";
import { ServiceFilterPanel, ServiceFilterToggle, serviceFilterCountLabel } from "./service-filter";
import { s } from "@/lib/i18n";

const OSTEO = { id: "svc-osteo", label: "Osteopatia" };
const NESA = { id: "svc-nesa", label: "NESA" };
const CHIPS = [NESA, OSTEO];

const DAY = "2026-09-23"; // a Wednesday
const OTHER_DAY = "2026-09-25"; // the same week, not the day view's day

function iso(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  // Lisbon is UTC+1 in September.
  return `${date}T${String(h! - 1).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
}

function appt(id: string, serviceId: string | null, date = DAY, at = "10:00") {
  return {
    id,
    patientId: `p-${id}`,
    patientName: "Paciente Sintetico",
    practitionerId: "t-1",
    practitionerName: "Terapeuta Sintetico",
    colorKey: null,
    patientTwoId: null,
    patientTwoName: null,
    practitionerTwoId: null,
    practitionerTwoName: null,
    locationId: "loc-1",
    locationName: "Clinica",
    serviceId,
    serviceName: serviceId ? "x" : null,
    room: null,
    startsAt: iso(date, at),
    endsAt: iso(date, at.replace(/:00$/, ":45")),
    status: "scheduled",
    notes: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    confirmationState: "pending",
    confirmationChannel: null,
    confirmationReceivedAt: null,
    hasNote: false,
    createdBy: null,
    createdByName: null,
    createdAt: iso(DAY, "08:00"),
  };
}

const APPTS = [
  appt("a-osteo", OSTEO.id, DAY, "09:00"),
  appt("a-nesa", NESA.id, DAY, "10:00"),
  appt("a-none", null, DAY, "11:00"),
  appt("a-nesa-fri", NESA.id, OTHER_DAY, "12:00"),
];
const BLOCKS = [{ id: "b-1", startsAt: iso(DAY, "14:00"), endsAt: iso(DAY, "15:00"), reason: "other", note: "x" }];

function render(over: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(AgendaView, {
      view: "week",
      anchor: DAY,
      filters: { practitionerId: null, locationId: null },
      lockTherapist: false,
      viewer: { role: "reception", userId: "u-1" },
      options: { therapists: [], locations: [], services: [], packs: [], bookableLocations: [] },
      appointments: APPTS,
      serviceChips: CHIPS,
      blocks: BLOCKS,
      dayWindow: { startMin: 480, endMin: 1200 },
      closure: null,
      lockedPatient: null,
      prefill: { serviceId: null, locationId: null },
      canHardDelete: false,
      canBlockTime: false,
      renderedAt: "14:32",
      renderedAtIso: "2026-09-23T13:32:00.000Z",
      ...over,
    } as never),
  );
}

const idsOf = (p: { appointments: { id: string }[] }) => p.appointments.map((a) => a.id);

beforeEach(() => {
  seen.stored = null;
  seen.grid.length = 0;
  seen.list.length = 0;
  seen.compact.length = 0;
});

/** Every element in a returned tree, depth first. Fragments and arrays included. */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  const out: ReactElement<Record<string, unknown>>[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    const el = n as ReactElement<Record<string, unknown>>;
    out.push(el);
    walk(el.props.children as ReactNode);
  };
  walk(node);
  return out;
}

describe("the toggle: its count badge", () => {
  it("shows no badge when nothing is selected (empty = all)", () => {
    const out = renderToStaticMarkup(
      <ServiceFilterToggle count={0} expanded={false} onToggle={() => {}} testId="t" className="inline-flex" />,
    );
    expect(out).toContain(s["agenda.filterServices"]);
    expect(out).not.toContain('data-testid="t-count"');
    expect(out).toContain('aria-expanded="false"');
  });

  it("shows how many services are selected, in digits for the eye and words for a screen reader", () => {
    const out = renderToStaticMarkup(
      <ServiceFilterToggle count={2} expanded onToggle={() => {}} testId="t" className="inline-flex" />,
    );
    expect(out).toMatch(/<span aria-hidden="true" data-testid="t-count"[^>]*>2<\/span>/);
    expect(out).toContain(serviceFilterCountLabel(2));
    expect(serviceFilterCountLabel(2)).toContain("2");
    expect(serviceFilterCountLabel(1)).toBe(s["agenda.filterServicesSelectedOne"]);
    expect(out).toContain('aria-expanded="true"');
    expect(out).toContain('aria-controls="agenda-service-filter-panel"');
  });

  it("a press calls onToggle", () => {
    const onToggle = vi.fn();
    const btn = ServiceFilterToggle({ count: 0, expanded: false, onToggle, testId: "t", className: "" });
    (btn.props as { onClick: () => void }).onClick();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("the panel: toggling chips", () => {
  it("one chip per offered service, in the order given, labelled with the service's own name", () => {
    const out = renderToStaticMarkup(
      <ServiceFilterPanel services={CHIPS} selected={[]} onToggle={() => {}} onClear={() => {}} />,
    );
    const chips = [...out.matchAll(/data-agenda-service-chip="([^"]+)"/g)].map((m) => m[1]);
    expect(chips).toEqual([NESA.id, OSTEO.id]);
    expect(out.indexOf(">NESA<")).toBeLessThan(out.indexOf(">Osteopatia<"));
    expect(out).toContain('role="group"');
    expect(out).toContain(`aria-label="${s["agenda.filterServicesGroup"]}"`);
  });

  it("'Todos os serviços' is pressed when nothing is selected, and the selected chips when something is", () => {
    const none = renderToStaticMarkup(
      <ServiceFilterPanel services={CHIPS} selected={[]} onToggle={() => {}} onClear={() => {}} />,
    );
    expect(none).toMatch(/aria-pressed="true" data-agenda-service-chip-all=""/);
    expect(none).not.toMatch(/aria-pressed="true" data-agenda-service-chip="/);

    const nesa = renderToStaticMarkup(
      <ServiceFilterPanel services={CHIPS} selected={[NESA.id]} onToggle={() => {}} onClear={() => {}} />,
    );
    expect(nesa).toMatch(/aria-pressed="false" data-agenda-service-chip-all=""/);
    expect(nesa).toMatch(new RegExp(`aria-pressed="true" data-agenda-service-chip="${NESA.id}"`));
    expect(nesa).toMatch(new RegExp(`aria-pressed="false" data-agenda-service-chip="${OSTEO.id}"`));
  });

  it("pressing a chip toggles THAT service; pressing 'Todos' clears", () => {
    const onToggle = vi.fn();
    const onClear = vi.fn();
    const tree = elements(ServiceFilterPanel({ services: CHIPS, selected: [NESA.id], onToggle, onClear }));
    const buttons = tree.filter((e) => e.type === "button");
    expect(buttons).toHaveLength(3);
    const byChip = (id: string) => buttons.find((b) => b.props["data-agenda-service-chip"] === id)!;
    (byChip(OSTEO.id).props.onClick as () => void)();
    expect(onToggle).toHaveBeenLastCalledWith(OSTEO.id);
    (byChip(NESA.id).props.onClick as () => void)();
    expect(onToggle).toHaveBeenLastCalledWith(NESA.id);
    const all = buttons.find((b) => "data-agenda-service-chip-all" in b.props)!;
    (all.props.onClick as () => void)();
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("wraps inside the toolbar rather than widening it: flex-wrap, and each chip may shrink", () => {
    const out = renderToStaticMarkup(
      <ServiceFilterPanel services={CHIPS} selected={[]} onToggle={() => {}} onClear={() => {}} />,
    );
    const panel = out.match(/<div[^>]*data-testid="agenda-service-filter-panel"[^>]*>/)![0];
    expect(panel).toMatch(/\bflex-wrap\b/);
    expect(out).toMatch(/\bmax-w-full\b/);
    expect(out).toMatch(/\btruncate\b/);
  });
});

describe("agenda-view hands Dia AND Semana the filtered set", () => {
  it("CONTROL: with nothing stored, every surface gets every booking and no badge shows", () => {
    const out = render({ view: "week" });
    expect(seen.grid.map(idsOf)).toEqual([APPTS.map((a) => a.id)]);
    expect(seen.list.map(idsOf)).toEqual([APPTS.map((a) => a.id)]);
    expect(seen.compact.map(idsOf)).toEqual([APPTS.map((a) => a.id)]);
    expect(out).not.toContain('data-testid="agenda-service-filter-toggle-count"');
  });

  it("SEMANA with NESA stored: the grid, the phone list and the phone week grid all lose the osteopatia and no-service rows", () => {
    seen.stored = JSON.stringify([NESA.id]);
    const out = render({ view: "week" });
    for (const [name, calls] of [
      ["grid", seen.grid],
      ["list", seen.list],
      ["compact", seen.compact],
    ] as const) {
      expect(calls.map(idsOf), name).toEqual([["a-nesa", "a-nesa-fri"]]);
    }
    // The badge, on both copies of the toggle, says one service.
    expect(out).toMatch(/data-testid="agenda-service-filter-toggle-count"[^>]*>1</);
    expect(out).toMatch(/data-testid="agenda-service-filter-toggle-phone-count"[^>]*>1</);
    // The range chip counts what is shown: two NESA rows in the week.
    const chip = out.match(/data-testid="agenda-range-chip"[\s\S]*?<\/span><\/span>/)![0];
    expect(chip).toContain(`2 ${s["agenda.apptCountMany"]}`);
  });

  it("DIA with NESA stored: the grid and the phone list get the filtered set; the phone week grid is not mounted", () => {
    seen.stored = JSON.stringify([NESA.id]);
    const out = render({ view: "day" });
    expect(seen.grid.map(idsOf)).toEqual([["a-nesa", "a-nesa-fri"]]);
    expect(seen.list.map(idsOf)).toEqual([["a-nesa", "a-nesa-fri"]]);
    expect(seen.compact).toHaveLength(0);
    // Only DAY's NESA row is inside the day view's range.
    const chip = out.match(/data-testid="agenda-range-chip"[\s\S]*?<\/span><\/span>/)![0];
    expect(chip).toContain(`1 ${s["agenda.apptCountOne"]}`);
  });

  it("time-off blocks are never filtered: every surface gets the same blocks prop with a service selected", () => {
    seen.stored = JSON.stringify([OSTEO.id]);
    render({ view: "week" });
    expect(seen.grid[0]!.blocks).toBe(BLOCKS);
    expect(seen.list[0]!.blocks).toBe(BLOCKS);
    expect(seen.compact[0]!.blocks).toBe(BLOCKS);
  });

  it("a stored id no longer offered is dropped: it filters nothing and counts on no badge", () => {
    seen.stored = JSON.stringify(["svc-gone"]);
    const out = render({ view: "week" });
    expect(seen.grid.map(idsOf)).toEqual([APPTS.map((a) => a.id)]);
    expect(out).not.toContain("agenda-service-filter-toggle-count");
    // Mixed: the offered one survives alone.
    seen.grid.length = 0;
    seen.stored = JSON.stringify(["svc-gone", OSTEO.id]);
    const mixed = render({ view: "week" });
    expect(seen.grid.map(idsOf)).toEqual([["a-osteo"]]);
    expect(mixed).toMatch(/data-testid="agenda-service-filter-toggle-count"[^>]*>1</);
  });

  it("malformed storage renders the agenda unfiltered, not an error", () => {
    seen.stored = "[not json";
    expect(() => render({ view: "week" })).not.toThrow();
    expect(seen.grid.map(idsOf)).toEqual([APPTS.map((a) => a.id)]);
  });

  it("no chips offered: no toggle at all, and nothing is filtered whatever is stored", () => {
    seen.stored = JSON.stringify([NESA.id]);
    const out = render({ view: "week", serviceChips: [] });
    expect(out).not.toContain("agenda-service-filter-toggle");
    expect(seen.grid.map(idsOf)).toEqual([APPTS.map((a) => a.id)]);
  });

  it("the two copies of the toggle show at complementary widths, and the panel is closed on load", () => {
    const out = render({ view: "week" });
    const desk = out.match(/<button[^>]*data-testid="agenda-service-filter-toggle"[^>]*>/)![0];
    const phone = out.match(/<button[^>]*data-testid="agenda-service-filter-toggle-phone"[^>]*>/)![0];
    const cls = (tag: string) => tag.match(/class="([^"]*)"/)![1]!.split(/\s+/);
    expect(cls(desk)).toEqual(expect.arrayContaining(["hidden", "md:inline-flex"]));
    expect(cls(phone)).toEqual(expect.arrayContaining(["inline-flex", "md:hidden"]));
    // Neither copy carries a display class that would show it on the other side.
    expect(cls(desk)).not.toContain("inline-flex");
    expect(cls(phone)).not.toContain("hidden");
    expect(out).not.toContain('data-testid="agenda-service-filter-panel"');
  });
});

/** Comments stripped, so the guard reads code and not its own explanation. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("source guards on agenda-view.tsx", () => {
  const view = code(readFileSync(new URL("./agenda-view.tsx", import.meta.url), "utf8"));

  it("every surface draws from the filtered list; none from the raw prop", () => {
    expect(view.match(/appointments=\{shownAppointments\}/g)).toHaveLength(3);
    expect(view).not.toMatch(/appointments=\{appointments\}/);
    // CONTROL: the three surfaces are all still mounted.
    for (const c of ["<AgendaGrid", "<AgendaWeekList", "<AgendaWeekCompact"]) expect(view).toContain(c);
  });

  it("blocks are passed through unfiltered to all three surfaces", () => {
    expect(view.match(/blocks=\{blocks\}/g)).toHaveLength(3);
  });

  it("the stored selection is read without a setState in an effect", () => {
    expect(view).toMatch(/useSyncExternalStore\(\s*subscribeNothing,\s*clientStoredServiceFilter,\s*serverStoredServiceFilter,?\s*\)/);
  });
});
