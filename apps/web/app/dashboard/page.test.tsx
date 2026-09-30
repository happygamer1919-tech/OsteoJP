/**
 * page.test.tsx: DASH-THERAPIST-REVENUE, THE INICIO PAGE RENDERED PER ROLE.
 *
 * The guide writers found a therapist's Inicio showing the whole clinic's
 * Receita (mes): the page called getMonthlyRevenue for every role and the
 * invoices RLS is tenant-wide. This suite renders the REAL page component with
 * its reads stubbed and asserts what each role's HTML carries.
 *
 * THE STUB IS THE OLD, UNGUARDED FUNCTION ON PURPOSE. getMonthlyRevenue here
 * returns 124500 cents for ANY caller, which is what the database did for a
 * therapist. So the therapist case is a real negative: if the page's gate went
 * away, the euro amount and the Receita label would be in the markup and the
 * test would fail. The function's own refusal is proved separately, in
 * lib/invoices/queries.test.ts.
 *
 * Children that need a browser or the Next router (the date field, Notas
 * rapidas) are stubbed. Nothing they render is asserted here.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";
import { GlassKpiCard } from "@osteojp/ui";

import { lisbonDateTimeToUtc, lisbonMidnightUtc } from "@/lib/scheduling/time";
import type { AgendaAppointment } from "@/lib/scheduling/types";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "tenant-1", role: "therapist", userId: "user-1" } as {
    tenantId: string;
    role: string;
    userId: string;
  },
  getMonthlyRevenue: vi.fn(),
  listActiveLocations: vi.fn(),
  runScoped: vi.fn(),
  listAppointments: vi.fn(),
  /** T5b: the props the page handed the date field, one entry per render. */
  dateJump: [] as Array<{ date: string; location?: string | null }>,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirected");
  }),
  // T5b: the owner's clinic toggle is a client component that navigates.
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/auth/context", () => ({
  getRequestContext: async () => h.ctx,
  runScoped: h.runScoped,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { email: "ana.lima@osteojp.test" } } }) },
  }),
}));
vi.mock("@/lib/scheduling/data", () => ({ listAppointments: h.listAppointments }));
vi.mock("@/lib/invoices/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/invoices/queries")>()),
  getMonthlyRevenue: h.getMonthlyRevenue,
  listActiveLocations: h.listActiveLocations,
}));
vi.mock("./date-jump", () => ({
  DateJump: (p: { date: string; location?: string | null }) => {
    h.dateJump.push(p);
    return null;
  },
}));
vi.mock("./notas-rapidas", () => ({ NotasRapidas: () => null }));

import DashboardPage from "./page";
import { RevenueLocationToggle } from "./revenue-location";

const pt = getStrings("pt");

/** 124500 cents as the page formats it, NBSP and all. */
const AMOUNT = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(1245);

async function render(
  role: "owner" | "admin" | "therapist" | "reception",
  searchParams: Record<string, string> = {},
): Promise<string> {
  h.ctx = { tenantId: "tenant-1", role, userId: `user-${role}` };
  const page = await DashboardPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(page);
}

/** T5b: the tenant's two active clinics, as listActiveLocations returns them. */
const LV = { id: "00000000-0000-0000-0000-0000000000a1", name: "Linda-a-Velha" };
const CB = { id: "00000000-0000-0000-0000-0000000000c2", name: "Castelo Branco" };

/**
 * The KPI row: its grid class and the class of each tile inside it. The row
 * ends where the Acessos rapidos heading begins, the next section on the page.
 */
function kpiRow(html: string): { className: string; tiles: number; tileClasses: string[] } {
  const open = html.match(/<div data-testid="dashboard-kpis" class="([^"]*)">/);
  expect(open, "the KPI row carries data-testid=dashboard-kpis").not.toBeNull();
  const rest = html.slice(open!.index! + open![0].length);
  const end = rest.indexOf(pt["dashboard.acessosRapidos"]);
  expect(end).toBeGreaterThan(0);
  const tiles = [...rest.slice(0, end).matchAll(/<div class="(glass-card flex h-45[^"]*)"/g)].map((m) => m[1]!);
  return { className: open![1]!, tiles: tiles.length, tileClasses: tiles };
}

/**
 * The class GlassKpiCard gives a tile when the page passes it none, which is
 * how the page rendered every tile before DASH-THERAPIST-REVENUE.
 */
const TILE_BEFORE = "glass-card flex h-45 flex-col justify-between rounded-v2-kpi p-6";

beforeEach(() => {
  h.getMonthlyRevenue.mockReset();
  h.getMonthlyRevenue.mockResolvedValue(124500);
  h.listActiveLocations.mockReset();
  h.listActiveLocations.mockResolvedValue([CB, LV]);
  h.dateJump.length = 0;
  h.runScoped.mockReset();
  // The two runScoped reads: active patients (total, week) and new records (count).
  h.runScoped.mockResolvedValue([{ total: 7, week: 2, count: 3 }]);
  h.listAppointments.mockReset();
  h.listAppointments.mockResolvedValue([]);
});

describe("Inicio for a therapist (DASH-THERAPIST-REVENUE)", () => {
  it("never asks for the clinic's revenue", async () => {
    await render("therapist");
    expect(h.getMonthlyRevenue).not.toHaveBeenCalled();
  });

  it("carries no Receita label, no revenue amount and no euro sign", async () => {
    const html = await render("therapist");
    expect(html).not.toContain(pt["dashboard.kpiRevenue"]);
    expect(html).not.toContain("Receita");
    expect(html).not.toContain(AMOUNT);
    expect(html).not.toContain("€");
  });

  it("keeps Pacientes ativos, Marcacoes hoje, Novas fichas and the weekly chart", async () => {
    const html = await render("therapist");
    expect(html).toContain(pt["dashboard.kpiActivePatients"]);
    expect(html).toContain(pt["dashboard.kpiTodayAppointments"]);
    expect(html).toContain(pt["dashboard.kpiNewRecords"]);
    expect(html).toContain(pt["dashboard.weeklySummary"]);
    expect(html).toContain(`aria-label="${pt["dashboard.weeklyChartLabel"]}"`);
  });

  it("lays its three tiles out in three columns at xl, the third spanning the md row", async () => {
    const row = kpiRow(await render("therapist"));
    expect(row.tiles).toBe(3);
    expect(row.className).toBe("grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3");
    expect(row.tileClasses).toEqual([TILE_BEFORE, TILE_BEFORE, `${TILE_BEFORE} md:col-span-2 xl:col-span-1`]);
  });
});

describe.each(["owner", "admin", "reception"] as const)("Inicio for %s keeps the revenue tile", (role) => {
  it("asks for this month's revenue once and shows it", async () => {
    const html = await render(role);
    expect(h.getMonthlyRevenue).toHaveBeenCalledOnce();
    expect(html).toContain(pt["dashboard.kpiRevenue"]);
    expect(html).toContain(AMOUNT);
  });
});

/**
 * D2: owner, admin and reception see exactly the row they saw before the gate.
 * ROW_BEFORE is the class the page gave the KPI row for every role before
 * DASH-THERAPIST-REVENUE, and TILE_BEFORE the class of every tile. Reception
 * has three tiles, like the therapist, so a layout chosen by tile count alone
 * would move reception's row too (this card's first version did, and its
 * review caught it); this pins that it does not.
 */
const ROW_BEFORE = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4";

describe("the KPI row is unchanged for every role shown the revenue tile", () => {
  it.each([
    ["owner", 4],
    ["admin", 4],
    ["reception", 3],
  ] as const)("%s, %i tiles: the row class it had before, and every tile's class too", async (role, count) => {
    const row = kpiRow(await render(role));
    expect(row.tiles).toBe(count);
    expect(row.className).toBe(ROW_BEFORE);
    expect(row.tileClasses).toEqual(Array.from({ length: count }, () => TILE_BEFORE));
  });
});

/**
 * T5b, REVENUE PER CLINIC: the owner's toggle on the revenue tile, per role.
 *
 * The page renders the toggle for the owner only, turns the owner's
 * `?location=` into a clinic the toggle actually offers, and passes nothing of
 * the kind for any other role. The scoping itself is getMonthlyRevenue's
 * (lib/invoices/queries.test.ts and revenue.db.test.ts); these cases pin what
 * the page asks it for and what the page shows.
 */
const TOGGLE = 'data-testid="dashboard-revenue-location"';
const TOGGLE_LABEL = `aria-label="${pt["dashboard.revenueLocation"]}"`;

describe("the revenue tile's clinic toggle (T5b)", () => {
  it("is on the owner's revenue tile: every clinic by default, then each clinic", async () => {
    const html = await render("owner");
    expect(html).toContain(TOGGLE);
    expect(html).toContain(TOGGLE_LABEL);
    expect(html).toContain(`<option value="" selected="">${pt["dashboard.revenueAllLocations"]}</option>`);
    expect(html).toContain(`<option value="${LV.id}">${LV.name}</option>`);
    expect(html).toContain(`<option value="${CB.id}">${CB.name}</option>`);
    // Inside the revenue tile, after its figure: the one tile carrying it.
    const tile = html.slice(html.indexOf(pt["dashboard.kpiRevenue"]));
    expect(tile.indexOf(AMOUNT)).toBeGreaterThan(0);
    expect(tile.indexOf(TOGGLE)).toBeGreaterThan(tile.indexOf(AMOUNT));
    // Every clinic: no location asked for.
    expect(h.getMonthlyRevenue).toHaveBeenCalledOnce();
    expect(h.getMonthlyRevenue.mock.calls[0]![3]).toEqual({ locationId: null });
  });

  it("follows the owner's ?location= when it names one of the clinics it offers", async () => {
    const html = await render("owner", { location: LV.id });
    expect(h.getMonthlyRevenue.mock.calls[0]![3]).toEqual({ locationId: LV.id });
    expect(html).toContain(`<option value="${LV.id}" selected="">${LV.name}</option>`);
    expect(html).toContain(`<option value="">${pt["dashboard.revenueAllLocations"]}</option>`);
  });

  it("keeps the owner's chosen clinic on the day navigation links", async () => {
    const html = await render("owner", { location: CB.id, date: "2026-09-15" });
    expect(html).toContain(`href="/dashboard?date=2026-09-14&amp;location=${CB.id}"`);
    expect(html).toContain(`href="/dashboard?date=2026-09-16&amp;location=${CB.id}"`);
  });

  it("falls back to every clinic for an id the toggle does not offer, so control and figure agree", async () => {
    for (const bad of ["00000000-0000-0000-0000-00000000dead", "not-a-uuid"]) {
      h.getMonthlyRevenue.mockClear();
      const html = await render("owner", { location: bad });
      expect(h.getMonthlyRevenue.mock.calls[0]![3]).toEqual({ locationId: null });
      expect(html).toContain(`<option value="" selected="">${pt["dashboard.revenueAllLocations"]}</option>`);
      expect(html).not.toContain(bad);
    }
  });

  it("is not offered to an owner with a single active clinic (PL-14), and the URL cannot narrow the figure", async () => {
    h.listActiveLocations.mockResolvedValue([LV]);
    const html = await render("owner", { location: LV.id });
    expect(html).not.toContain(TOGGLE);
    expect(html).toContain(AMOUNT);
    expect(h.getMonthlyRevenue.mock.calls[0]).toHaveLength(3);
  });

  it.each(["admin", "reception"] as const)(
    "is never shown to %s, who is not even asked for a clinic list, and ?location= is not passed on",
    async (role) => {
      const html = await render(role, { location: CB.id });
      expect(html).not.toContain(TOGGLE);
      expect(html).not.toContain(TOGGLE_LABEL);
      expect(html).not.toContain(pt["dashboard.revenueAllLocations"]);
      expect(html).not.toContain(CB.id);
      // Their figure is still there; getMonthlyRevenue scopes it to their clinics.
      expect(html).toContain(AMOUNT);
      expect(h.listActiveLocations).not.toHaveBeenCalled();
      expect(h.getMonthlyRevenue).toHaveBeenCalledOnce();
      expect(h.getMonthlyRevenue.mock.calls[0]).toHaveLength(3);
    },
  );

  it("changes nothing for the therapist: no tile, no toggle, no clinic list", async () => {
    const html = await render("therapist", { location: CB.id });
    expect(html).not.toContain(TOGGLE);
    expect(html).not.toContain(pt["dashboard.kpiRevenue"]);
    expect(h.listActiveLocations).not.toHaveBeenCalled();
    expect(h.getMonthlyRevenue).not.toHaveBeenCalled();
  });
});

/**
 * T5b: WHAT THE PAGE HANDS THE TWO CLIENT NAVIGATIONS. url-carry.test.tsx
 * proves each control builds the right URL from the props it is given; these
 * cases prove the page gives them the right props. The toggle needs the page's
 * explicit `?date=` (and null without one, so choosing a clinic does not pin
 * today's date into the URL); the date field needs the owner's chosen clinic,
 * and null for every other role.
 *
 * The toggle's `date` never reaches the markup, so it is read from the element
 * tree the page returns: the toggle sits in the revenue tile's `action` prop,
 * not among any children, so every prop is walked.
 */
function propsOf(node: ReactNode, type: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    const el = n as ReactElement<Record<string, unknown>>;
    if (el.type === type) out.push(el.props);
    Object.values(el.props).forEach(walk);
  };
  walk(node);
  return out;
}

async function toggleProps(searchParams: Record<string, string>): Promise<Record<string, unknown>[]> {
  h.ctx = { tenantId: "tenant-1", role: "owner", userId: "user-owner" };
  return propsOf(await DashboardPage({ searchParams: Promise.resolve(searchParams) }), RevenueLocationToggle);
}

describe("what the page hands the toggle and the date field (T5b)", () => {
  it("the toggle gets the page's explicit ?date=, and null when there is none or it is not a date", async () => {
    const withDate = await toggleProps({ date: "2026-03-17", location: LV.id });
    expect(withDate).toHaveLength(1);
    expect(withDate[0]).toMatchObject({ date: "2026-03-17", value: LV.id });

    expect((await toggleProps({}))[0]).toMatchObject({ date: null, value: null });
    expect((await toggleProps({ date: "17-03-2026" }))[0]).toMatchObject({ date: null });
  });

  it("the date field gets the owner's chosen clinic, and null for every clinic", async () => {
    await render("owner", { location: CB.id, date: "2026-09-15" });
    expect(h.dateJump.at(-1)).toMatchObject({ date: "2026-09-15", location: CB.id });

    await render("owner", { date: "2026-09-15" });
    expect(h.dateJump.at(-1)).toMatchObject({ location: null });

    // An id the toggle does not offer is every clinic, on the date field too.
    await render("owner", { location: "00000000-0000-0000-0000-00000000dead" });
    expect(h.dateJump.at(-1)).toMatchObject({ location: null });
  });

  it.each(["admin", "reception", "therapist"] as const)(
    "the date field gets no clinic for %s, whatever the URL says",
    async (role) => {
      await render(role, { location: CB.id });
      expect(h.dateJump).toHaveLength(1);
      expect(h.dateJump[0]).toMatchObject({ location: null });
    },
  );
});

/**
 * GUIDE-F6: INICIO SHOWS THE BOOKINGS OF THE DAY BEING VIEWED.
 *
 * The page read the bookings from Lisbon midnight TODAY to today+7 and then
 * kept the `?date=` the viewer picked, so a past day, or any day from today+7
 * on, read "Marcacoes hoje 0" and "Sem marcacoes" whatever it held. The ruled
 * fix (option a) reads the viewed day's own window.
 *
 * THE STUB IS A DATABASE, NOT A LIST. listAppointments here returns only the
 * fixture rows whose start falls inside the window the page asks for, which is
 * what the real range read does. So a page that asks for the wrong window gets
 * the wrong rows, and these cases go red: on the old today to today+7 read the
 * past day, the far day and today+7 read 0 (proved by reverting the read once).
 *
 * The clock is pinned to Tuesday 29 Sep 2026, 10:00 Lisbon (UTC+1), so no case
 * depends on when CI runs. Every name below is invented.
 */
const NOW = new Date("2026-09-29T09:00:00.000Z");
const TODAY = "2026-09-29";
const PAST = "2026-09-15"; // 14 days back
const WEEK_EDGE = "2026-10-06"; // today+7: the first day the old read missed
const FAR = "2026-10-20"; // 21 days ahead
const INSIDE = "2026-10-02"; // today+3: inside the old window, still shown

function booking(
  id: string,
  date: string,
  hhmm: string,
  over: Partial<AgendaAppointment> = {},
): AgendaAppointment {
  const start = lisbonDateTimeToUtc(date, hhmm);
  return {
    id,
    patientId: `p-${id}`,
    patientName: `Paciente Inventado ${id}`,
    practitionerId: "t-other",
    practitionerName: "Terapeuta Ficticio",
    colorKey: null,
    patientTwoId: null,
    patientTwoName: null,
    practitionerTwoId: null,
    practitionerTwoName: null,
    locationId: "loc-1",
    locationName: "Clinica Exemplo",
    serviceId: null,
    serviceName: null,
    room: null,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 45 * 60_000).toISOString(),
    status: "scheduled",
    notes: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    ...over,
  } as AgendaAppointment;
}

const ROWS: AgendaAppointment[] = [
  booking("past1", PAST, "11:00"),
  booking("past2", PAST, "15:30", { practitionerId: "t-self" }),
  booking("pastX", PAST, "17:00", { status: "cancelled" }),
  booking("today1", TODAY, "08:30"),
  booking("today2", TODAY, "14:00", { practitionerId: "t-self" }),
  booking("todayX", TODAY, "16:00", { status: "cancelled" }),
  booking("inside1", INSIDE, "12:00"),
  booking("edge1", WEEK_EDGE, "10:30"),
  booking("far1", FAR, "09:30"),
  // Where a `?date=2026-02-30` read lands: the day it rolls over to.
  booking("roll1", "2026-03-02", "10:00"),
];

type Read = { startUtc: Date; endUtc: Date } & Record<string, unknown>;

/**
 * The range read, as the database answers it. `scoped` stands in for the role
 * scoping inside listAppointments (RLS and viewerLocationScope): a therapist's
 * read returns only their own rows, so the page must show what the scoped read
 * returned and nothing wider.
 */
function database(scoped = false) {
  h.listAppointments.mockImplementation(async (ctx: { role: string }, args: Read) =>
    ROWS.filter((r) => {
      const t = Date.parse(r.startsAt);
      if (t < args.startUtc.getTime() || t >= args.endUtc.getTime()) return false;
      return !scoped || ctx.role !== "therapist" || r.practitionerId === "t-self";
    }),
  );
}

type Role = "owner" | "admin" | "therapist" | "reception";

async function view(role: Role, searchParams: Record<string, string> = {}) {
  h.ctx = { tenantId: "tenant-1", role, userId: `user-${role}` };
  const tree = await DashboardPage({ searchParams: Promise.resolve(searchParams) });
  const html = renderToStaticMarkup(tree);
  const tile = propsOf(tree, GlassKpiCard).find((p) => p.label === pt["dashboard.kpiTodayAppointments"]);
  expect(tile, "the Marcacoes hoje tile is on the page").toBeDefined();
  // Proximas marcacoes: from its heading to the Notas rapidas heading.
  const from = html.indexOf(pt["dashboard.upcomingTitle"]);
  const to = html.indexOf(pt["dashboard.notes"], from);
  expect(from).toBeGreaterThan(0);
  expect(to).toBeGreaterThan(from);
  const panel = html.slice(from, to);
  const times = [...panel.matchAll(/tabular-nums text-v2-text-primary">(\d\d:\d\d)<\/span>/g)].map((m) => m[1]);
  return { html, panel, times, count: tile!.value, caption: tile!.caption };
}

describe("GUIDE-F6: Inicio shows the bookings of the day being viewed", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    database();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a past day shows that day's bookings, not zero", async () => {
    const v = await view("reception", { date: PAST });
    expect(v.count).toBe(2);
    expect(v.times).toEqual(["11:00", "15:30"]);
    expect(v.panel).toContain("Paciente Inventado past1");
    expect(v.panel).toContain("Paciente Inventado past2");
    expect(v.panel).not.toContain(pt["dashboard.upcomingEmpty"]);
    // No "Proxima" on a day that is not today, as before.
    expect(v.caption).toBeUndefined();
  });

  it("a day more than 7 days ahead shows that day's bookings, not zero", async () => {
    const v = await view("reception", { date: FAR });
    expect(v.count).toBe(1);
    expect(v.times).toEqual(["09:30"]);
    expect(v.panel).toContain("Paciente Inventado far1");
  });

  it("today+7, the first day the old read left out, shows its booking", async () => {
    const v = await view("reception", { date: WEEK_EDGE });
    expect(v.count).toBe(1);
    expect(v.times).toEqual(["10:30"]);
  });

  it("a day inside the old window still shows its booking", async () => {
    const v = await view("reception", { date: INSIDE });
    expect(v.count).toBe(1);
    expect(v.times).toEqual(["12:00"]);
  });

  it("today still shows today's: the count of the day, the next one, and only what is still ahead", async () => {
    for (const sp of [{}, { date: TODAY }] as Array<Record<string, string>>) {
      const v = await view("reception", sp);
      // 08:30 and 14:00; the cancelled 16:00 is not counted.
      expect(v.count).toBe(2);
      expect(v.caption).toBe(`${pt["dashboard.kpiNext"]}: 14:00`);
      // 10:00 now: 08:30 is behind, so the list holds 14:00 alone.
      expect(v.times).toEqual(["14:00"]);
    }
  });

  it("a day with no bookings still reads zero and Sem marcacoes", async () => {
    const v = await view("reception", { date: "2026-09-16" });
    expect(v.count).toBe(0);
    expect(v.times).toEqual([]);
    expect(v.panel).toContain(pt["dashboard.upcomingEmpty"]);
  });

  it("a ?date= that is not a calendar date counts nothing, although its read lands on the next real day", async () => {
    const v = await view("reception", { date: "2026-02-30" });
    expect(v.count).toBe(0);
    expect(v.times).toEqual([]);
    expect(v.panel).not.toContain("Paciente Inventado roll1");
  });

  it("the week chart and the month revenue still follow today, not the viewed day", async () => {
    await view("owner", { date: FAR });
    const reads = h.listAppointments.mock.calls.map((c) => (c[1] as Read).startUtc.toISOString());
    // Monday 28 Sep 2026, today's week: the Resumo semanal read.
    expect(reads).toContain(lisbonMidnightUtc("2026-09-28").toISOString());
    // September 2026, today's month: the Receita (mes) read.
    expect(h.getMonthlyRevenue).toHaveBeenCalledOnce();
    expect((h.getMonthlyRevenue.mock.calls[0]![1] as Date).toISOString()).toBe(
      lisbonMidnightUtc("2026-09-01").toISOString(),
    );
  });

  describe.each(["owner", "admin", "reception", "therapist"] as const)("role scoping, %s", (role) => {
    it("reads the viewed day through listAppointments with its own context and no practitioner or clinic", async () => {
      await view(role, { date: PAST });
      const day = h.listAppointments.mock.calls.find(
        (c) => (c[1] as Read).startUtc.getTime() === lisbonMidnightUtc(PAST).getTime(),
      );
      expect(day, "one read is the viewed day's").toBeDefined();
      expect(day![0]).toBe(h.ctx);
      expect(day![1]).toEqual({
        startUtc: lisbonMidnightUtc(PAST),
        endUtc: lisbonMidnightUtc("2026-09-16"),
      });
    });

    it("shows exactly what the scoped read returned for the viewed day", async () => {
      database(true);
      const v = await view(role, { date: PAST });
      if (role === "therapist") {
        expect(v.count).toBe(1);
        expect(v.times).toEqual(["15:30"]);
        expect(v.panel).not.toContain("Paciente Inventado past1");
      } else {
        expect(v.count).toBe(2);
        expect(v.times).toEqual(["11:00", "15:30"]);
      }
    });
  });
});
