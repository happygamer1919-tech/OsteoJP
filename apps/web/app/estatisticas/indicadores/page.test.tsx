/**
 * NESA-SCOPE - Indicadores > Top terapeutas names two same-named staff rows
 * apart, as the Painel breakdown does.
 *
 * The report groups by practitioner id, so one machine per clinic under one
 * name is two bars. Before this test both read "NESA" while the Painel tab named
 * them "NESA (CB)" and "NESA (LV)". The page is rendered for real with its reads
 * stubbed; the view is a stub that prints the bar labels it was handed.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirected");
  }),
}));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: vi.fn() }));
vi.mock("@/lib/statistics/kpi-queries", () => ({
  defaultKpiFrom: () => "2026-01-01",
  getKpiReports: vi.fn(),
}));
vi.mock("@/lib/scheduling/data", () => ({ getAgendaOptions: vi.fn() }));
vi.mock("@/lib/perf/audience", () => ({ shouldMeasure: () => false }));
vi.mock("@/app/_components/timing-panel", () => ({ TimingPanel: () => null }));
vi.mock("./indicadores-view", () => ({
  IndicadoresView: ({ reports }: { reports: { topTherapists: { id: string | null; name: string }[] } }) =>
    createElement(
      "ol",
      null,
      reports.topTherapists.map((r) => createElement("li", { key: r.id ?? "none", "data-id": r.id ?? "" }, r.name)),
    ),
}));

import { requireRequestContext } from "@/lib/auth/context";
import { getKpiReports } from "@/lib/statistics/kpi-queries";
import { getAgendaOptions } from "@/lib/scheduling/data";
import IndicadoresPage from "./page";

const LV = "loc-lv";
const CB = "loc-cb";

function reports(topTherapists: { id: string | null; name: string; count: number }[]) {
  return {
    currency: "EUR",
    bookingTypes: [],
    topTherapists,
    revenueByMonth: [],
    revenueByMonthByTherapist: { rows: [], series: [] },
    ageDistribution: [],
    dailyByTherapist: { rows: [], series: [] },
    topPatientsByPayments: [],
    topPatientsByAppointments: [],
    referralSources: [],
    topLocalities: [],
  };
}

const OWNER_OPTIONS = {
  therapists: [],
  locations: [],
  bookableLocations: [],
  services: [],
  packs: [],
  therapistLocationIds: { "nesa-cb": [CB], "nesa-lv": [LV], ana: [LV] },
  viewerClinicIds: [CB, LV],
  clinicCodes: { [CB]: "CB", [LV]: "LV" },
};

async function bars(): Promise<string[]> {
  const page = await IndicadoresPage({ searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(page);
  return [...html.matchAll(/<li data-id="([^"]*)">([^<]*)<\/li>/g)].map((m) => `${m[1]}=${m[2]}`);
}

beforeEach(() => {
  vi.mocked(requireRequestContext).mockResolvedValue({ tenantId: "t-1", role: "owner", userId: "owner" } as never);
  vi.mocked(getAgendaOptions).mockResolvedValue(OWNER_OPTIONS as never);
});

describe("Indicadores > Top terapeutas (NESA-SCOPE)", () => {
  it("two machines with one name are two bars, labelled apart by clinic", async () => {
    vi.mocked(getKpiReports).mockResolvedValue(
      reports([
        { id: "nesa-cb", name: "NESA", count: 9 },
        { id: "ana", name: "Ana Lisboa", count: 5 },
        { id: "nesa-lv", name: "NESA", count: 3 },
      ]) as never,
    );
    expect(await bars()).toEqual(["nesa-cb=NESA (CB)", "ana=Ana Lisboa", "nesa-lv=NESA (LV)"]);
  });

  it("unique names, and a row with no practitioner, are left exactly as they came", async () => {
    vi.mocked(getKpiReports).mockResolvedValue(
      reports([
        { id: "ana", name: "Ana Lisboa", count: 5 },
        { id: null, name: "", count: 2 },
      ]) as never,
    );
    expect(await bars()).toEqual(["ana=Ana Lisboa", "="]);
  });

  it("options without the NESA-SCOPE fields leave the labels untouched", async () => {
    vi.mocked(getAgendaOptions).mockResolvedValue({ ...OWNER_OPTIONS, viewerClinicIds: undefined } as never);
    vi.mocked(getKpiReports).mockResolvedValue(
      reports([
        { id: "nesa-cb", name: "NESA", count: 9 },
        { id: "nesa-lv", name: "NESA", count: 3 },
      ]) as never,
    );
    expect(await bars()).toEqual(["nesa-cb=NESA", "nesa-lv=NESA"]);
  });
});
