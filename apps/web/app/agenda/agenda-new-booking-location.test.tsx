import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AGENDA-NEW-LOC-01 - what the agenda hands the create drawer when Nova marcação
 * is opened BY HAND, from the toolbar button or from an empty slot.
 *
 * HOW A PRESS IS TESTED WITHOUT A DOM. This suite runs in node and renders
 * through react-dom/server, where a setState after the render is a no-op. So:
 *   - a Harness component calls AgendaView as a function inside its own render
 *     (the hooks run in the Harness's slot, legally) and keeps the element tree
 *     it returns; the Nova marcação button and the grid's onSelectSlot are read
 *     off that tree and invoked afterwards;
 *   - `useState` is wrapped so every setter call is RECORDED before it reaches
 *     React. The modal state the agenda would open is the recorded value whose
 *     `mode` is "create". Everything else about React is the real module.
 *
 * What the drawer then DOES with that state (Localização painted, the NESA it
 * offers, people not scoped) is appointment-drawer.test.tsx's question.
 */

const seen = vi.hoisted(() => ({ sets: [] as unknown[] }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const useState = ((init: unknown) => {
    const [value, set] = actual.useState(init);
    const recordingSet = (next: unknown) => {
      seen.sets.push(next);
      (set as (v: unknown) => void)(next);
    };
    return [value, recordingSet];
  }) as typeof actual.useState;
  return { ...actual, default: { ...actual, useState }, useState };
});
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
vi.mock("@osteojp/ui", async () => {
  const { createElement: h } = await import("react");
  return {
    DatePicker: () => h("div"),
    Select: ({ children }: { children?: ReactNode }) => h("select", null, children as ReactNode),
    SegmentedControl: () => h("div"),
    ToastProvider: ({ children }: { children?: ReactNode }) => h("div", null, children as ReactNode),
  };
});
vi.mock("./agenda-grid", () => ({ AgendaGrid: () => null }));
vi.mock("./agenda-week-list", () => ({ AgendaWeekList: () => null }));
vi.mock("./agenda-week-compact", () => ({ AgendaWeekCompact: () => null }));
vi.mock("./appointment-drawer", () => ({ AppointmentDrawer: () => null }));
vi.mock("./block-time-dialog", () => ({ BlockTimeDialog: () => null }));

import { AgendaGrid } from "./agenda-grid";
import { AgendaView } from "./agenda-view";
import { s } from "@/lib/i18n";

const CB = "loc-cb";
const LV = "loc-lv";
const clinic = (id: string, label: string) => ({
  id,
  label,
  opensAt: "08:00:00",
  closesAt: "20:00:00",
  middayClosedFrom: null,
  middayClosedTo: null,
});
/** CB listed FIRST, as production lists it: the fallback the owner reported. */
const BOTH_CLINICS = {
  therapists: [],
  locations: [clinic(CB, "OsteoJP (CB)"), clinic(LV, "OsteoJP (LV)")],
  bookableLocations: [
    { id: CB, label: "OsteoJP (CB)" },
    { id: LV, label: "OsteoJP (LV)" },
  ],
  services: [],
  packs: [],
};
const GUEST_PREFILL = { serviceId: "svc-osteo", locationId: CB };

/** Every element in a returned tree, depth first. */
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
const textOf = (node: ReactNode): string =>
  Array.isArray(node)
    ? node.map(textOf).join("")
    : typeof node === "string" || typeof node === "number"
      ? String(node)
      : isValidElement(node)
        ? textOf((node.props as { children?: ReactNode }).children)
        : "";

/** Render the agenda once and hand back its own element tree. */
function agendaTree(over: Record<string, unknown> = {}): ReactElement<Record<string, unknown>>[] {
  let tree: ReactNode = null;
  const props = {
    view: "week",
    anchor: "2026-11-09",
    filters: { practitionerId: null, locationId: null },
    lockTherapist: false,
    viewer: { role: "reception", userId: "recep-1" },
    options: BOTH_CLINICS,
    appointments: [],
    blocks: [],
    dayWindow: { startMin: 480, endMin: 1200 },
    closure: null,
    lockedPatient: null,
    prefill: { serviceId: null, locationId: null },
    canHardDelete: false,
    canBlockTime: false,
    renderedAt: "10:00",
    renderedAtIso: "2026-11-09T10:00:00.000Z",
    ...over,
  };
  function Harness() {
    tree = (AgendaView as (p: unknown) => ReactNode)(props);
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  return elements(tree);
}

function pressNovaMarcacao(over: Record<string, unknown> = {}): unknown {
  const button = agendaTree(over).find(
    (el) => el.type === "button" && textOf(el.props.children as ReactNode).includes(s["agenda.newAppointment"]),
  );
  expect(button, "the Nova marcação button is on the toolbar").toBeDefined();
  seen.sets.length = 0;
  (button!.props.onClick as () => void)();
  return openedState();
}

function clickSlot(over: Record<string, unknown> = {}): unknown {
  const grid = agendaTree(over).find((el) => el.type === AgendaGrid);
  expect(grid, "the desktop grid is mounted").toBeDefined();
  seen.sets.length = 0;
  (grid!.props.onSelectSlot as (date: string, time: string) => void)("2026-11-10", "15:30");
  return openedState();
}

/** The one create-modal value the press recorded. */
function openedState(): unknown {
  const creates = seen.sets.filter(
    (v) => !!v && typeof v === "object" && (v as { mode?: unknown }).mode === "create",
  );
  expect(creates).toHaveLength(1);
  return creates[0];
}

beforeEach(() => {
  seen.sets.length = 0;
});

describe("Nova marcação starts at the clinic the agenda is filtered to (AGENDA-NEW-LOC-01)", () => {
  it("the agenda on LV: the button opens the create form with Localização LV", () => {
    expect(pressNovaMarcacao({ filters: { practitionerId: null, locationId: LV } })).toEqual({
      mode: "create",
      prefill: { serviceId: null, locationId: LV },
    });
  });

  it("the agenda on LV: an empty slot opens the create form at that slot with Localização LV", () => {
    expect(clickSlot({ filters: { practitionerId: null, locationId: LV } })).toEqual({
      mode: "create",
      slot: { date: "2026-11-10", time: "15:30" },
      prefill: { serviceId: null, locationId: LV },
    });
  });

  it("the agenda on CB: CB, from the button and from a slot", () => {
    const filters = { practitionerId: null, locationId: CB };
    expect(pressNovaMarcacao({ filters })).toEqual({ mode: "create", prefill: { serviceId: null, locationId: CB } });
    expect(clickSlot({ filters })).toMatchObject({ prefill: { serviceId: null, locationId: CB } });
  });

  it("Todas as localizações: no prefill, so the drawer keeps the first bookable clinic", () => {
    expect(pressNovaMarcacao()).toEqual({ mode: "create" });
    expect(clickSlot()).toEqual({ mode: "create", slot: { date: "2026-11-10", time: "15:30" } });
  });

  it("a filter clinic this viewer cannot book into: no prefill, the first-bookable default", () => {
    const options = { ...BOTH_CLINICS, bookableLocations: [{ id: CB, label: "OsteoJP (CB)" }] };
    const filters = { practitionerId: null, locationId: LV };
    expect(pressNovaMarcacao({ options, filters })).toEqual({ mode: "create" });
    expect(clickSlot({ options, filters })).toEqual({ mode: "create", slot: { date: "2026-11-10", time: "15:30" } });
  });

  it("the page's guest prefill does not leak into a hand-opened create", () => {
    // The deep link's prefill is for the ONE drawer the deep link opens. A later
    // press of the button is an ordinary booking and follows the toolbar.
    const filters = { practitionerId: null, locationId: LV };
    expect(pressNovaMarcacao({ filters, prefill: GUEST_PREFILL })).toEqual({
      mode: "create",
      prefill: { serviceId: null, locationId: LV },
    });
  });

});

/** Comments stripped, so the guard reads code and not its own explanation. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the deep link keeps its own clinic (source guard, AGENDA-NEW-LOC-01)", () => {
  // The deep-link drawer opens from an effect, which a server render never
  // runs, so this one is read off the source. What it pins: the deep link
  // still hands the page's guest prefill straight to the drawer, and the
  // toolbar clinic is consulted in exactly one place, the hand-opened door.
  const view = code(readFileSync(new URL("./agenda-view.tsx", import.meta.url), "utf8"));

  it("the comment stripper leaves the code it is meant to leave (control)", () => {
    expect(view).toContain("export function AgendaView");
    expect(view).not.toContain("A HAND-OPENED NOVA MARCACAO STARTS AT THE CLINIC");
  });

  it("the deep link passes the guest request's own prefill, untouched", () => {
    expect(view).toMatch(/lockedPatient,\s*prefill: prefill\.serviceId \|\| prefill\.locationId \? prefill : undefined,/);
  });

  it("the toolbar clinic is read once, and only by the hand-opened door", () => {
    expect(view.match(/newBookingPrefill\(/g)).toHaveLength(1);
    expect(view).toMatch(/newBookingPrefill\(filters\.locationId, options\.bookableLocations\)/);
    // Every other create is the deep link: one `mode: "create"` there, one in openCreate.
    expect(view.match(/mode: "create"/g)).toHaveLength(2);
  });
});
