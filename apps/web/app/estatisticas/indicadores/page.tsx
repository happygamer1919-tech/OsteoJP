import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";

import { requireRequestContext } from "@/lib/auth/context";
import { defaultKpiFrom, getKpiReports, type KpiFilters } from "@/lib/statistics/kpi-queries";
import { s } from "@/lib/i18n";

import { IndicadoresView } from "./indicadores-view";
import { TimingPanel } from "@/app/_components/timing-panel";
import { collectFor } from "@/lib/perf/request-timing";
import { mayReadTimings } from "@/lib/perf/audience";

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
  // OSTEOJP-WEB-8: the guard redirects on its own now, so the wrapper is
  // gone. It was not merely redundant - a bare `catch {}` here swallowed
  // NEXT_REDIRECT AND would have turned a real Auth outage into a silent
  // bounce to /login, reporting our failure as this person's logout.
  const actor = await requireRequestContext();
  if (!can(actor.role, "statistics:read")) redirect("/dashboard");

  const sp = await searchParams;
  // PERF-06. The 12-month default is RESOLVED HERE, not left implicit, so the
  // period picker renders the dates actually being queried. getKpiReports
  // applies the same floor independently; this is the half that keeps the
  // screen honest about which window it is showing.
  const filters: KpiFilters = {
    from: firstParam(sp.from) ?? defaultKpiFrom(new Date()),
    to: firstParam(sp.to),
  };
  // PERF-timing-admin-stats: `collectFor` opens a span store around the reads
  // and changes NOTHING about them - same calls, same order, same concurrency.
  // For a principal outside the audience no store is opened and `timed` awaits
  // and returns. The panel element is created only on the measured arm, so the
  // numbers are never serialised for anybody else. Measurement only: no compute
  // change, no migration.
  const measured = await collectFor(mayReadTimings(actor), async () => getKpiReports(actor, filters));
  const reports = measured.value;

  return (
    <>
      <IndicadoresView reports={reports} filters={filters} />
      {measured.measured ? (
        <TimingPanel
          spans={measured.spans}
          serverMs={measured.totalMs}
          route="/estatisticas/indicadores"
        />
      ) : null}
    </>
  );
}
