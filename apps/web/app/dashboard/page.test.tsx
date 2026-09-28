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
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "tenant-1", role: "therapist", userId: "user-1" } as {
    tenantId: string;
    role: string;
    userId: string;
  },
  getMonthlyRevenue: vi.fn(),
  runScoped: vi.fn(),
  listAppointments: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirected");
  }),
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
}));
vi.mock("./date-jump", () => ({ DateJump: () => null }));
vi.mock("./notas-rapidas", () => ({ NotasRapidas: () => null }));

import DashboardPage from "./page";

const pt = getStrings("pt");

/** 124500 cents as the page formats it, NBSP and all. */
const AMOUNT = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(1245);

async function render(role: "owner" | "admin" | "therapist" | "reception"): Promise<string> {
  h.ctx = { tenantId: "tenant-1", role, userId: `user-${role}` };
  const page = await DashboardPage({ searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(page);
}

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
