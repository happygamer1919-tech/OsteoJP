import { redirect } from "next/navigation";
import { can, type RequestContext } from "@osteojp/auth";

import { requireRequestContext } from "@/lib/auth/context";
import { getKpiReports, type KpiFilters } from "@/lib/statistics/kpi-queries";
import { s } from "@/lib/i18n";

import { IndicadoresView } from "./indicadores-view";

export const metadata = { title: s["statistics.cardKpi"] };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * W8-03 — Indicadores (KPI) section. Owner-only, identical four-point gate to the
 * W6-05 dashboard: route redirect here + getKpiReports query guard
 * (statistics:read). The period picker scopes every report; recharts renders each
 * as a full visual page. Migration-free (aggregates over existing data).
 */
export default async function IndicadoresPage({ searchParams }: { searchParams: SearchParams }) {
  let actor: RequestContext;
  try {
    actor = await requireRequestContext();
  } catch {
    redirect("/login");
  }
  if (!can(actor.role, "statistics:read")) redirect("/dashboard");

  const sp = await searchParams;
  const filters: KpiFilters = { from: firstParam(sp.from), to: firstParam(sp.to) };
  const reports = await getKpiReports(actor, filters);

  return <IndicadoresView reports={reports} filters={filters} />;
}
