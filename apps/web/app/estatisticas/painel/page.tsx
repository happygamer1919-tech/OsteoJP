import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";

import { requireRequestContext } from "@/lib/auth/context";
import { scopedLocationId } from "@/lib/auth/location-choice";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { getStatistics, type StatisticsFilters } from "@/lib/statistics/queries";
import { getAgendaOptions } from "@/lib/scheduling/data";
import { s } from "@/lib/i18n";

import { EstatisticasView } from "../estatisticas-view";
import { TimingPanel } from "@/app/_components/timing-panel";
import { collectFor } from "@/lib/perf/request-timing";
import { mayReadTimings } from "@/lib/perf/audience";

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

  // PERF-timing-admin-stats: `collectFor` opens a span store around the reads
  // and changes NOTHING about them - same calls, same order, same concurrency.
  // For a principal outside the audience no store is opened and `timed` awaits
  // and returns. The panel element is created only on the measured arm, so the
  // numbers are never serialised for anybody else. Measurement only: no compute
  // change, no migration.
  const measured = await collectFor(mayReadTimings(actor), async () =>
    Promise.all([getStatistics(actor, filters), getAgendaOptions(actor)]),
  );
  const [stats, options] = measured.value;

  return (
    <>
      <EstatisticasView stats={stats} options={options} filters={filters} />
      {measured.measured ? (
        <TimingPanel
          spans={measured.spans}
          serverMs={measured.totalMs}
          route="/estatisticas/painel"
        />
      ) : null}
    </>
  );
}
