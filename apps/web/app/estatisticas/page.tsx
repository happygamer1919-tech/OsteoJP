import { redirect } from "next/navigation";
import { can, type RequestContext } from "@osteojp/auth";

import { requireRequestContext } from "@/lib/auth/context";
import { getStatistics, type StatisticsFilters } from "@/lib/statistics/queries";
import { getAgendaOptions } from "@/lib/scheduling/data";
import { s } from "@/lib/i18n";

import { EstatisticasView } from "./estatisticas-view";

export const metadata = { title: s["statistics.title"] };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * W6-05 - Estatisticas: owner-only KPI dashboard. Enforced at BOTH the route
 * (redirect any non-owner via statistics:read) AND the query (getStatistics
 * re-asserts statistics:read), never nav-hiding alone. MVP revenue + volume
 * aggregates over existing invoicing + appointments; migration-free.
 */
export default async function EstatisticasPage({ searchParams }: { searchParams: SearchParams }) {
  let actor: RequestContext;
  try {
    actor = await requireRequestContext();
  } catch {
    redirect("/login");
  }
  // Route-level owner gate (not just nav hiding).
  if (!can(actor.role, "statistics:read")) redirect("/dashboard");

  const sp = await searchParams;
  const filters: StatisticsFilters = {
    from: firstParam(sp.from),
    to: firstParam(sp.to),
    therapistId: firstParam(sp.therapist),
    locationId: firstParam(sp.location),
    serviceId: firstParam(sp.service),
  };

  const [stats, options] = await Promise.all([
    getStatistics(actor, filters),
    getAgendaOptions(actor),
  ]);

  return <EstatisticasView stats={stats} options={options} filters={filters} />;
}
