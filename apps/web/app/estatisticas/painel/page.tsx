import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";

import { requireRequestContext } from "@/lib/auth/context";
import { scopedLocationId } from "@/lib/auth/location-choice";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { getStatistics, type StatisticsFilters } from "@/lib/statistics/queries";
import { getAgendaOptions } from "@/lib/scheduling/data";
import { relabelStaffRows, staffLabelContext } from "@/lib/scheduling/staff-options";
import { s } from "@/lib/i18n";

import { EstatisticasView } from "../estatisticas-view";
import { TimingPanel } from "@/app/_components/timing-panel";
import { collectFor } from "@/lib/perf/request-timing";
import { shouldMeasure } from "@/lib/perf/audience";

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
  // ON REQUEST ONLY since 2026-09-19 (owner ruling): `shouldMeasure` is the role
  // AND `?medicao=1`. Without the parameter this is `await fn()` for everybody.
  const measured = await collectFor(shouldMeasure(actor, sp), async () =>
    Promise.all([getStatistics(actor, filters), getAgendaOptions(actor)]),
  );
  const [rawStats, options] = measured.value;
  // NESA-SCOPE: the per-therapist breakdown groups by staff id, so two machines
  // with one name are two rows. They are labelled with the same collision rule
  // as the filter above them and NEVER dropped: a breakdown row is revenue, and
  // hiding one would make the column disagree with the total.
  const staffLabels = staffLabelContext(options);
  const stats = staffLabels
    ? { ...rawStats, revenueByTherapist: relabelStaffRows(rawStats.revenueByTherapist, staffLabels) }
    : rawStats;

  return (
    <>
      {/* PLACED FIRST, DIRECTLY UNDER THE TITLE, AND THE REASON IS MEASURED.
          It used to sit at the bottom of the page. On /patients that is below
          8,413 rows of table, and on 2026-09-05 the owner went looking for it
          and did not find it. An instrument nobody can reach is the defect
          AI-02 moved the drift banner onto the reviewer's screen for. It is one
          collapsed line, admin and owner only AND ONLY ON REQUEST since 2026-09-19
          (`?medicao=1`), and it carries id="medicao" so the URL
          /patients?medicao=1#medicao reaches it directly.

          The audience check is already inside `measured`: `spans` exists only
          on the measured arm, so this element cannot be created for a principal
          who was not measured, and for them nothing is serialised into the RSC
          payload at all. Not a hidden panel: an absent one. */}
      {measured.measured ? (
        <TimingPanel
          spans={measured.spans}
          serverMs={measured.totalMs}
          route="/estatisticas/painel"
        />
      ) : null}
      <EstatisticasView stats={stats} options={options} filters={filters} />
    </>
  );
}
