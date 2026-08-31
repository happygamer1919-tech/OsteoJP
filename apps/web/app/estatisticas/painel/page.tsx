import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";

import { requireRequestContext } from "@/lib/auth/context";
import { scopedLocationId } from "@/lib/auth/location-choice";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { getStatistics, type StatisticsFilters } from "@/lib/statistics/queries";
import { getAgendaOptions } from "@/lib/scheduling/data";
import { s } from "@/lib/i18n";

import { EstatisticasView } from "../estatisticas-view";

export const metadata = { title: s["statistics.title"] };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * W8-03 — the existing W6-05 dashboard, moved here as the "Estatísticas" card
 * target of the chooser. The view (estatisticas-view.tsx) + its hand-rolled SVG
 * chart are UNCHANGED. Owner-only: route redirect here + getStatistics query
 * guard (statistics:read), never nav-hiding alone. Migration-free.
 */
export default async function EstatisticasPainelPage({ searchParams }: { searchParams: SearchParams }) {
  // OSTEOJP-WEB-8: the guard redirects on its own now, so the wrapper is
  // gone. It was not merely redundant - a bare `catch {}` here swallowed
  // NEXT_REDIRECT AND would have turned a real Auth outage into a silent
  // bounce to /login, reporting our failure as this person's logout.
  const actor = await requireRequestContext();
  if (!can(actor.role, "statistics:read")) redirect("/dashboard");

  const sp = await searchParams;
  const filters: StatisticsFilters = {
    from: firstParam(sp.from),
    to: firstParam(sp.to),
    therapistId: firstParam(sp.therapist),
    locationId: scopedLocationId(await viewerLocationScope(actor), firstParam(sp.location)),
    serviceId: firstParam(sp.service),
  };

  const [stats, options] = await Promise.all([getStatistics(actor, filters), getAgendaOptions(actor)]);

  return <EstatisticasView stats={stats} options={options} filters={filters} />;
}
